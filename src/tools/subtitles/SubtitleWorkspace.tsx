import { useMemo, useRef, useState } from 'react';
import { downloadText } from '../../lib/download';
import { consumeFileInput } from '../../lib/file-input';
import { PagedTable } from '../../components/PagedTable';
import {
  analyzeCueTimings,
  applyLinearCorrection,
  countCuesShiftedBelowZero,
  parseAnchorTime,
  parseSubtitle,
  serializeSubtitle,
  type ParsedSubtitle,
  type SubtitleTimingDiagnostics,
} from './subtitle-engine';

const SAMPLE = `1\n00:00:00,000 --> 00:00:02,000\nFirst line\n\n2\n00:01:40,000 --> 00:01:42,000\nLast line\n`;

interface CorrectionOutput {
  text: string;
  parsed: ParsedSubtitle;
  belowZero: number;
  diagnostics: SubtitleTimingDiagnostics;
}

function displayTime(ms: number) {
  const sign = ms < 0 ? '−' : '';
  const safe = Math.abs(ms);
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = Math.round(safe) % 1000;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function timingSummary(diagnostics: SubtitleTimingDiagnostics) {
  const order = diagnostics.outOfOrderCueNumbers.length
    ? `${diagnostics.outOfOrderCueNumbers.length} out-of-order cue start${diagnostics.outOfOrderCueNumbers.length === 1 ? '' : 's'}`
    : 'cue starts ordered';
  const overlaps = diagnostics.overlappingCueNumbers.length
    ? `${diagnostics.overlappingCueNumbers.length} adjacent overlap${diagnostics.overlappingCueNumbers.length === 1 ? '' : 's'}`
    : 'no adjacent overlaps';
  return `${order} · ${overlaps}`;
}

export default function SubtitleWorkspace() {
  const [sourceText, setSourceText] = useState(SAMPLE);
  const [sourceName, setSourceName] = useState('subtitle.srt');
  const [sourceStart, setSourceStart] = useState('0');
  const [correctedStart, setCorrectedStart] = useState('0');
  const [sourceEnd, setSourceEnd] = useState('100000');
  const [correctedEnd, setCorrectedEnd] = useState('100000');
  const [preview, setPreview] = useState<CorrectionOutput | null>(null);
  const [applied, setApplied] = useState<CorrectionOutput | null>(null);
  const [status, setStatus] = useState('Set two trusted anchors, then preview the linear correction.');
  const inputRevision = useRef(0);

  const parseState = useMemo(() => {
    try {
      const parsed = parseSubtitle(sourceText);
      return { parsed, diagnostics: analyzeCueTimings(parsed.cues), error: '' };
    } catch (error) {
      return { parsed: null, diagnostics: null, error: error instanceof Error ? error.message : 'Invalid subtitle syntax.' };
    }
  }, [sourceText]);

  const output = applied ?? preview;
  const comparisonRows = useMemo(() => {
    if (!parseState.parsed || !output) return [];
    return parseState.parsed.cues.map((cue, index) => ({
      index,
      source: cue,
      corrected: output.parsed.cues[index],
    }));
  }, [parseState.parsed, output]);

  function invalidateCorrection(message?: string) {
    setPreview(null);
    setApplied(null);
    if (message) setStatus(message);
  }

  async function loadFile(next: File | null) {
    if (!next) return;
    const revision = ++inputRevision.current;
    try {
      const text = await next.text();
      if (inputRevision.current !== revision) return;
      setSourceText(text);
      setSourceName(next.name);
      invalidateCorrection(`Loaded ${next.name} locally. Existing correction output was cleared.`);
    } catch (error) {
      if (inputRevision.current !== revision) return;
      setStatus(`Could not read that file: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  function updateSource(next: string) {
    inputRevision.current += 1;
    setSourceText(next);
    invalidateCorrection('Source changed. Preview the correction again before applying or downloading.');
  }

  function updateAnchor(setter: (value: string) => void, value: string) {
    setter(value);
    invalidateCorrection('Anchor changed. Preview the correction again before applying or downloading.');
  }

  function buildCorrection(): CorrectionOutput {
    const input = parseSubtitle(sourceText);
    if (!input.cues.length) throw new Error('No subtitle cues were found.');
    const correctedCues = applyLinearCorrection(input.cues, {
      sourceStartMs: parseAnchorTime(sourceStart),
      correctedStartMs: parseAnchorTime(correctedStart),
      sourceEndMs: parseAnchorTime(sourceEnd),
      correctedEndMs: parseAnchorTime(correctedEnd),
    }, input.format);
    const belowZero = countCuesShiftedBelowZero(correctedCues);
    const text = serializeSubtitle({ ...input, cues: correctedCues });
    const parsed = parseSubtitle(text);
    return { text, parsed, belowZero, diagnostics: analyzeCueTimings(parsed.cues) };
  }

  function previewCorrection() {
    try {
      const next = buildCorrection();
      setPreview(next);
      setApplied(null);
      setStatus(
        next.belowZero
          ? `Preview ready. ${next.belowZero} cue${next.belowZero === 1 ? '' : 's'} begin below zero and are clipped to 00:00:00.000; cues ending at or below zero are rejected.`
          : `Preview ready for ${next.parsed.cues.length} cue${next.parsed.cues.length === 1 ? '' : 's'}. The original source is unchanged.`,
      );
    } catch (error) {
      setPreview(null);
      setApplied(null);
      setStatus(`Correction failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  function applyPreview() {
    if (!preview) return;
    setApplied(preview);
    setPreview(null);
    setStatus('Correction applied to the output copy. The original source remains unchanged; Undo apply restores preview state.');
  }

  function undoApply() {
    if (!applied) return;
    setPreview(applied);
    setApplied(null);
    setStatus('Applied output returned to preview state. The original source was never modified.');
  }

  function downloadCorrection() {
    if (!output) return;
    const format = output.parsed.format;
    const stem = sourceName.replace(/\.(?:srt|vtt)$/i, '') || 'subtitle';
    downloadText(output.text, `${stem}-corrected.${format}`, format === 'vtt' ? 'text/vtt' : 'application/x-subrip');
    setStatus(`Downloaded corrected ${format.toUpperCase()} copy with ${output.parsed.cues.length} cues. The original source remains unchanged.`);
  }

  return <>
    <div className="workspace-header"><div><h2>Two-anchor correction</h2><p>All cue and WebVTT inline timestamps use the same calculated slope and offset.</p></div></div>
    <div className="workspace-body">
      <div className="field">
        <label htmlFor="subtitle-file">Choose subtitle file (optional)</label>
        <input
          id="subtitle-file"
          type="file"
          accept=".srt,.vtt,application/x-subrip,text/vtt,text/plain"
          onChange={(event) => consumeFileInput(event.target, () => loadFile(event.target.files?.[0] ?? null))}
        />
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="subtitle-text">Original subtitle contents</label>
        <textarea id="subtitle-text" value={sourceText} onChange={(event) => updateSource(event.target.value)} />
        <small>{parseState.parsed && parseState.diagnostics
          ? `${parseState.parsed.cues.length} cues detected · ${parseState.parsed.format.toUpperCase()} · ${timingSummary(parseState.diagnostics)}`
          : `Check subtitle syntax: ${parseState.error}`}</small>
      </div>

      <div className="notice" data-testid="subtitle-output-policy" style={{ marginTop: 14 }}>
        <strong>Output timing policy:</strong> cue starts mapped below zero are clipped to 00:00:00.000; cues ending at or below zero are rejected. Existing overlaps are preserved and reported rather than silently changed.
      </div>

      <div className="workspace-grid" style={{ marginTop: 18 }}>
        <div>
          <strong className="field-label">Early anchor</strong>
          <div className="workspace-grid">
            <div className="field"><label htmlFor="src-start">Source time</label><input id="src-start" type="text" inputMode="decimal" value={sourceStart} onChange={(e) => updateAnchor(setSourceStart, e.target.value)} /><small>Milliseconds or HH:MM:SS.mmm</small></div>
            <div className="field"><label htmlFor="dst-start">Correct time</label><input id="dst-start" type="text" inputMode="decimal" value={correctedStart} onChange={(e) => updateAnchor(setCorrectedStart, e.target.value)} /><small>Milliseconds or HH:MM:SS.mmm</small></div>
          </div>
        </div>
        <div>
          <strong className="field-label">Late anchor</strong>
          <div className="workspace-grid">
            <div className="field"><label htmlFor="src-end">Source time</label><input id="src-end" type="text" inputMode="decimal" value={sourceEnd} onChange={(e) => updateAnchor(setSourceEnd, e.target.value)} /><small>Milliseconds or HH:MM:SS.mmm</small></div>
            <div className="field"><label htmlFor="dst-end">Correct time</label><input id="dst-end" type="text" inputMode="decimal" value={correctedEnd} onChange={(e) => updateAnchor(setCorrectedEnd, e.target.value)} /><small>Milliseconds or HH:MM:SS.mmm</small></div>
          </div>
        </div>
      </div>

      <div className="button-row">
        <button className="action-button" type="button" disabled={!parseState.parsed} onClick={previewCorrection}>Preview correction</button>
        <button className="action-button secondary" type="button" disabled={!preview} onClick={applyPreview}>Apply preview</button>
        <button className="action-button secondary" type="button" disabled={!applied} onClick={undoApply}>Undo apply</button>
        <button className="action-button secondary" type="button" disabled={!output} onClick={downloadCorrection}>Download corrected copy</button>
      </div>
      <div className="status-line" role="status">{status}</div>

      {output ? <>
        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="subtitle-output">{applied ? 'Applied output copy' : 'Correction preview'}</label>
          <textarea id="subtitle-output" value={output.text} readOnly aria-readonly="true" />
          <small>
            {output.belowZero ? `${output.belowZero} cue start${output.belowZero === 1 ? '' : 's'} clipped at zero during serialization. ` : ''}
            WebVTT cue settings, structural blocks, and inline timestamp tags are preserved and retimed. {timingSummary(output.diagnostics)}.
          </small>
        </div>

        <PagedTable
          caption="Before and after subtitle cue comparison"
          rows={comparisonRows}
          pageSize={100}
          columns={[
            { key: 'cue', label: 'Cue' },
            { key: 'before', label: 'Before' },
            { key: 'after', label: 'After' },
            { key: 'text', label: 'Text' },
          ]}
          renderCell={(row, column) => {
            if (column === 'cue') return row.index + 1;
            if (column === 'before') return `${displayTime(row.source.startMs)} → ${displayTime(row.source.endMs)}`;
            if (column === 'after' && row.corrected) return `${displayTime(row.corrected.startMs)} → ${displayTime(row.corrected.endMs)}`;
            if (column === 'text') return <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.source.text}</span>;
            return '—';
          }}
        />
      </> : null}
    </div>
  </>;
}
