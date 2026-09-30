import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { downloadBytes } from '../../lib/download';
import { consumeFileInput } from '../../lib/file-input';
import { projectFileName } from './export-engine';
import type { ComponentInstance, LogicDocument, SimulationFrame } from './logic-types';
import {
  addressBitsOf,
  addressFromPins,
  applyAsciiText,
  asciiOf,
  dataBitsOf,
  exportBinary,
  fillOf,
  formatAddress,
  formatWord,
  formatWordCount,
  hexDigitsFor,
  importBinary,
  isMemoryType,
  mergeLive,
  parseHexAddress,
  parseHexWord,
  readWord,
  wordCount,
  wordsFromAscii,
  wordsPerRow,
  type Cells,
  type WordEdit,
} from './memory-engine';
import { readLevel } from './sim-engine';
import './LogicMemoryDock.css';

/** Rows shown at once: 16 rows of 16 bytes is the familiar hex-dump page. */
const PAGE_ROWS = 16;

export interface LogicMemoryDockProps {
  readonly document: LogicDocument;
  readonly frame: SimulationFrame;
  /** The memory to show first: the selected part, or the one the inspector's button named. */
  readonly focusId: string | null;
  /** Changes some words. Returns why it was refused, or undefined when it went through. */
  readonly onEdit: (componentId: string, edits: readonly WordEdit[]) => string | undefined;
  /** Replaces every stored word (and optionally the fill), as an import, a clear, or a fill does. */
  readonly onReplace: (componentId: string, cells: Record<string, number>, fill: number | undefined, label: string) => void;
  /** Forgets what the running circuit has written, so the RAM starts again from its stored contents. */
  readonly onResetLive: (componentId: string) => void;
  /** Stores what the running circuit has written as the RAM's contents in the project. */
  readonly onKeepLive: (componentId: string) => void;
  readonly onClose: () => void;
}

const memoriesOf = (doc: LogicDocument): ComponentInstance[] => doc.components.filter((component) => isMemoryType(component.type));

export function LogicMemoryDock({ document: doc, frame, focusId, onEdit, onReplace, onResetLive, onKeepLive, onClose }: LogicMemoryDockProps) {
  const memories = memoriesOf(doc);
  const [chosenId, setChosenId] = useState<string | null>(focusId);
  const [pageStart, setPageStart] = useState(0);
  const [gotoText, setGotoText] = useState('');
  const [fillText, setFillText] = useState('');
  const [textAt, setTextAt] = useState('');
  const [textValue, setTextValue] = useState('');
  const [message, setMessage] = useState<{ readonly kind: 'info' | 'problem'; readonly text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const memory = memories.find((component) => component.id === chosenId) ?? memories.find((component) => component.id === focusId) ?? memories[0];

  const view = useMemo(() => {
    if (!memory) return null;
    const addressBits = addressBitsOf(memory.params);
    const dataBits = dataBitsOf(memory.params);
    const perRow = wordsPerRow(dataBits);
    const pageWords = perRow * PAGE_ROWS;
    return { addressBits, dataBits, perRow, pageWords, words: wordCount(addressBits), fill: fillOf(memory.params) };
  }, [memory]);

  if (!memory || !view) {
    return (
      <section className="logic-dock logic-memory" aria-label="Memory editor" data-testid="logic-memory-dock">
        <p className="logic-dock-message">There is no RAM or ROM in this circuit yet. Place one from the Memory group in the palette.</p>
        <div className="logic-memory-bar"><button type="button" onClick={onClose}>Close</button></div>
      </section>
    );
  }

  const live: Cells | undefined = frame.componentState[memory.id]?.memoryWrites;
  const liveCount = live ? Object.keys(live).length : 0;
  const storedCount = Object.keys(memory.params.memoryCells ?? {}).length;
  const currentAddress = addressFromPins(memory.params, (portId) => readLevel(frame, memory.id, portId));
  const digits = hexDigitsFor(view.dataBits);
  // The page always starts on a page boundary that fits the address space; a smaller memory than the page shows all of itself.
  const start = Math.min(Math.floor(pageStart / view.pageWords) * view.pageWords, Math.max(0, view.words - 1));
  const end = Math.min(view.words, start + view.pageWords);
  const rows = Array.from({ length: Math.ceil((end - start) / view.perRow) }, (_, row) => start + row * view.perRow);
  const lastPageStart = Math.floor((view.words - 1) / view.pageWords) * view.pageWords;

  const say = (kind: 'info' | 'problem', text: string) => setMessage({ kind, text });

  const commitEdits = (edits: readonly WordEdit[]) => {
    const problem = onEdit(memory.id, edits);
    if (problem) say('problem', problem);
    else setMessage(null);
  };

  /** Applies a typed hexadecimal word, or puts the box back to what the memory holds when the text is not one. */
  const onWordBlur = (input: HTMLInputElement, address: number, current: number) => {
    const parsed = parseHexWord(input.value, view.dataBits);
    if (parsed === undefined) {
      say('problem', `"${input.value.trim()}" is not a ${view.dataBits}-bit hexadecimal word (0 to ${formatWord(2 ** view.dataBits - 1, view.dataBits)}).`);
      input.value = formatWord(current, view.dataBits);
      return;
    }
    if (parsed === current) input.value = formatWord(current, view.dataBits);
    else commitEdits([{ address, value: parsed }]);
  };

  const onWordKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const onAsciiBlur = (rowStart: number, text: string, words: readonly number[]) => {
    const next = applyAsciiText(words, text, view.dataBits);
    const edits: WordEdit[] = [];
    next.forEach((value, index) => {
      if (value !== words[index]) edits.push({ address: rowStart + index, value });
    });
    if (edits.length > 0) commitEdits(edits);
  };

  const goTo = () => {
    const address = parseHexAddress(gotoText, view.addressBits);
    if (address === undefined) {
      say('problem', `"${gotoText.trim()}" is not a hexadecimal address inside this ${formatWordCount(view.words)}-word memory (0 to ${formatAddress(view.words - 1, view.addressBits)}).`);
      return;
    }
    setPageStart(Math.floor(address / view.pageWords) * view.pageWords);
    setMessage(null);
  };

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    consumeFileInput(input, async () => {
      if (!file) return;
      const result = importBinary(new Uint8Array(await file.arrayBuffer()), memory.params);
      if (!result.ok) {
        say('problem', result.reason);
        return;
      }
      onReplace(memory.id, result.cells, undefined, 'Import memory');
      setPageStart(0);
      say('info', `Imported ${result.words.toLocaleString('en-US')} words from ${file.name}${result.truncated ? `; the file was longer than this memory, so the rest was left out` : ''}.`);
    });
  };

  const handleExport = () => {
    const result = exportBinary(memory.params, mergeLive(memory.params, live));
    if (!result.ok) {
      say('problem', result.reason);
      return;
    }
    downloadBytes(result.bytes, projectFileName(doc, `${memory.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'memory'}.bin`));
    say('info', `Exported ${result.words.toLocaleString('en-US')} words.`);
  };

  const handleFill = () => {
    const value = parseHexWord(fillText, view.dataBits);
    if (value === undefined) {
      say('problem', `"${fillText.trim()}" is not a ${view.dataBits}-bit hexadecimal word.`);
      return;
    }
    onReplace(memory.id, {}, value, 'Fill memory');
    say('info', `Every word is now ${formatWord(value, view.dataBits)}.`);
  };

  const handleWriteText = () => {
    const address = parseHexAddress(textAt, view.addressBits);
    if (address === undefined) {
      say('problem', `"${textAt.trim()}" is not a hexadecimal address inside this memory.`);
      return;
    }
    const words = wordsFromAscii(textValue, view.dataBits);
    if (words.length === 0) return;
    commitEdits(words.map((value, index) => ({ address: address + index, value })));
    setPageStart(Math.floor(address / view.pageWords) * view.pageWords);
  };

  return (
    <section className="logic-dock logic-memory" aria-label="Memory editor" data-testid="logic-memory-dock">
      <div className="logic-memory-bar">
        <label className="logic-memory-field">
          <span>Memory</span>
          <select value={memory.id} onChange={(event) => { setChosenId(event.target.value); setPageStart(0); setMessage(null); }}>
            {memories.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.label} ({candidate.type})</option>
            ))}
          </select>
        </label>
        <p className="logic-memory-summary" data-testid="logic-memory-summary">
          {memory.type} · {formatWordCount(view.words)} words × {view.dataBits} bits · {storedCount.toLocaleString('en-US')} stored word{storedCount === 1 ? '' : 's'} differ from {formatWord(view.fill, view.dataBits)}
          {liveCount > 0 ? ` · ${liveCount.toLocaleString('en-US')} written by the running circuit` : ''}
        </p>
        <button type="button" onClick={onClose}>Close</button>
      </div>

      {message ? <p className={message.kind === 'problem' ? 'logic-memory-message problem' : 'logic-memory-message'} role={message.kind === 'problem' ? 'alert' : 'status'}>{message.text}</p> : null}

      <div className="logic-memory-bar">
        <button type="button" onClick={() => setPageStart(Math.max(0, start - view.pageWords))} disabled={start === 0}>Previous page</button>
        <span className="logic-memory-range" data-testid="logic-memory-range">{formatAddress(start, view.addressBits)}–{formatAddress(end - 1, view.addressBits)}</span>
        <button type="button" onClick={() => setPageStart(Math.min(lastPageStart, start + view.pageWords))} disabled={start >= lastPageStart}>Next page</button>
        <label className="logic-memory-field inline">
          <span>Go to address (hex)</span>
          <input type="text" spellCheck={false} value={gotoText} onChange={(event) => setGotoText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') goTo(); }} />
        </label>
        <button type="button" onClick={goTo}>Go</button>
      </div>

      <div className="logic-memory-scroll">
        <table className="logic-memory-table" aria-label={`${memory.label} contents`}>
          <thead>
            <tr>
              <th scope="col">Address</th>
              {Array.from({ length: view.perRow }, (_, column) => <th key={column} scope="col">+{column.toString(16).toUpperCase()}</th>)}
              <th scope="col">ASCII</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((rowStart) => {
              const count = Math.min(view.perRow, end - rowStart);
              const words = Array.from({ length: count }, (_, column) => readWord(memory.params, live, rowStart + column));
              const ascii = words.map((word) => asciiOf(word, view.dataBits)).join('');
              return (
                <tr key={rowStart} className={currentAddress !== undefined && currentAddress >= rowStart && currentAddress < rowStart + count ? 'is-addressed-row' : undefined}>
                  <th scope="row">{formatAddress(rowStart, view.addressBits)}</th>
                  {words.map((word, column) => {
                    const address = rowStart + column;
                    const isLive = live?.[String(address)] !== undefined;
                    const classes = ['logic-memory-cell', isLive ? 'is-live' : '', address === currentAddress ? 'is-addressed' : ''].filter(Boolean).join(' ');
                    return (
                      <td key={address}>
                        <input
                          // A new key when the stored word changes underneath (an import, a fill, a live write) makes the box show it.
                          key={`${address}-${word}`}
                          className={classes}
                          type="text"
                          spellCheck={false}
                          autoComplete="off"
                          maxLength={digits + 2}
                          style={{ width: `${digits + 1}ch` }}
                          defaultValue={formatWord(word, view.dataBits)}
                          aria-label={`Word at address ${formatAddress(address, view.addressBits)}${isLive ? ' (written by the running circuit)' : ''}`}
                          onKeyDown={onWordKey}
                          onBlur={(event) => onWordBlur(event.target, address, word)}
                        />
                      </td>
                    );
                  })}
                  {count < view.perRow ? <td colSpan={view.perRow - count} /> : null}
                  <td>
                    <input
                      key={`ascii-${rowStart}-${ascii}`}
                      className="logic-memory-ascii"
                      type="text"
                      spellCheck={false}
                      autoComplete="off"
                      maxLength={ascii.length}
                      defaultValue={ascii}
                      aria-label={`ASCII text for addresses ${formatAddress(rowStart, view.addressBits)} to ${formatAddress(rowStart + count - 1, view.addressBits)}`}
                      onKeyDown={onWordKey}
                      onBlur={(event) => onAsciiBlur(rowStart, event.target.value, words)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="logic-memory-legend">
        Type hexadecimal in a word, or over the ASCII text (a dot keeps its unprintable byte). Edits are saved with the project.
        {memory.type === 'RAM' ? ' Words the running circuit has written are outlined; the word on the address pins is highlighted.' : ' The word on the address pins is highlighted.'}
      </p>

      <div className="logic-memory-bar">
        <button type="button" onClick={() => fileRef.current?.click()}>Import binary…</button>
        <input ref={fileRef} type="file" hidden accept=".bin,.rom,.img,application/octet-stream" onChange={handleImport} data-testid="logic-memory-file-input" />
        <button type="button" onClick={handleExport}>Export binary</button>
        <button type="button" onClick={() => { onReplace(memory.id, {}, undefined, 'Clear memory'); say('info', 'Every word is back to the fill value.'); }}>Clear</button>
        <label className="logic-memory-field inline">
          <span>Fill all with (hex)</span>
          <input type="text" spellCheck={false} value={fillText} onChange={(event) => setFillText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleFill(); }} />
        </label>
        <button type="button" onClick={handleFill}>Fill</button>
        {memory.type === 'RAM' ? (
          <>
            <button type="button" onClick={() => { onResetLive(memory.id); say('info', 'The RAM is back to its stored contents.'); }} disabled={liveCount === 0}>Reset live values</button>
            <button type="button" onClick={() => { onKeepLive(memory.id); say('info', 'The values the circuit wrote are now stored in the project.'); }} disabled={liveCount === 0}>Keep live values</button>
          </>
        ) : null}
      </div>

      <div className="logic-memory-bar">
        <label className="logic-memory-field inline">
          <span>Write text at address (hex)</span>
          <input type="text" spellCheck={false} value={textAt} onChange={(event) => setTextAt(event.target.value)} />
        </label>
        <label className="logic-memory-field inline grow">
          <span>Text</span>
          <input type="text" spellCheck={false} value={textValue} onChange={(event) => setTextValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleWriteText(); }} />
        </label>
        <button type="button" onClick={handleWriteText}>Write text</button>
      </div>
    </section>
  );
}
