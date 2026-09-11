import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadText } from '../../lib/download';
import { createPacketRuleQueue, runPacketRules } from './rule-runner';
import {
  bytesToHex,
  hexToBytes,
  PacketFrameLimitError,
  PacketStreamFramer,
  validateLineRule,
  type FramedPacket,
  type LineRule,
  type PacketFramingMode,
} from './packet-engine';

type SerialPort = {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable?: ReadableStream<Uint8Array>;
  writable?: WritableStream<Uint8Array>;
};

declare global { interface Navigator { serial?: { requestPort(): Promise<SerialPort> } } }

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
const MAX_FRAME_SIZES = [1_024, 4_096, 16_384, 65_536, 262_144, 1_048_576];
const CAPTURE_LIMIT = 5_000;
const DISPLAY_PAGE_SIZE = 200;

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnecting';
type Direction = 'RX' | 'TX' | 'SIM RX' | 'SIM TX';

type CaptureEntry = {
  id: number;
  timestamp: string;
  direction: Direction;
  hex: string;
  text: string;
};

type SimulatorScenario = 'sensor-ok' | 'error-burst' | 'unicode-split';

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export default function HardwareWorkspace() {
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const framerRef = useRef<PacketStreamFramer | null>(null);
  const intentionalCloseRef = useRef(false);
  const mountedRef = useRef(true);
  const connectAttemptRef = useRef(0);
  const sendBusyRef = useRef(false);
  const displayPausedRef = useRef(false);
  const captureRef = useRef<CaptureEntry[]>([]);
  const nextCaptureId = useRef(1);

  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [baudRate, setBaudRate] = useState(115200);
  const [framing, setFraming] = useState<PacketFramingMode>('line');
  const [maxFrameBytes, setMaxFrameBytes] = useState(65_536);
  const [packet, setPacket] = useState('0A FF 10');
  const [sending, setSending] = useState(false);
  const [displayPaused, setDisplayPaused] = useState(false);
  const [displaySnapshot, setDisplaySnapshot] = useState<CaptureEntry[] | null>(null);
  const [capture, setCapture] = useState<CaptureEntry[]>([]);
  const [totalFrames, setTotalFrames] = useState(0);
  const [capturedWhileDisplayPaused, setCapturedWhileDisplayPaused] = useState(0);
  const [evictedFrames, setEvictedFrames] = useState(0);
  const [capturePage, setCapturePage] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'rx' | 'tx' | 'sim'>('all');
  const [ruleFilter, setRuleFilter] = useState('all');
  const [rules, setRules] = useState<LineRule[]>([
    { pattern: '\\b(?:ERROR|FAIL)\\b', label: 'error' },
    { pattern: '\\bOK\\b', label: 'ok' },
  ]);
  const [scenario, setScenario] = useState<SimulatorScenario>('sensor-ok');
  const [status, setStatus] = useState('Connect through Web Serial when available, or use the built-in simulator.');

  const addEntry = useCallback((direction: Direction, bytes: Uint8Array, text: string) => {
    setTotalFrames((count) => count + 1);
    if (displayPausedRef.current) setCapturedWhileDisplayPaused((count) => count + 1);
    const entry: CaptureEntry = {
      id: nextCaptureId.current++,
      timestamp: new Date().toISOString(),
      direction,
      hex: bytesToHex(bytes),
      text,
    };
    let next = [entry, ...captureRef.current];
    if (next.length > CAPTURE_LIMIT) {
      const overflow = next.length - CAPTURE_LIMIT;
      next = next.slice(0, CAPTURE_LIMIT);
      setEvictedFrames((count) => count + overflow);
    }
    captureRef.current = next;
    setCapture(next);
  }, []);

  const addFrames = useCallback((direction: Direction, frames: readonly FramedPacket[]) => {
    frames.forEach((frame) => addEntry(direction, frame.bytes, frame.text));
  }, [addEntry]);

  const pushFrames = useCallback((direction: Direction, framer: PacketStreamFramer, chunk: Uint8Array) => {
    try {
      addFrames(direction, framer.push(chunk));
      return null;
    } catch (error) {
      if (error instanceof PacketFrameLimitError && error.completedFrames.length) addFrames(direction, error.completedFrames);
      return error;
    }
  }, [addFrames]);

  const teardownPort = useCallback(async (updateUi = true) => {
    connectAttemptRef.current += 1;
    intentionalCloseRef.current = true;
    if (updateUi && mountedRef.current) setConnectionState('disconnecting');

    const reader = readerRef.current;
    readerRef.current = null;
    if (reader) {
      try { await reader.cancel(); } catch { /* already errored or closed */ }
      try { reader.releaseLock(); } catch { /* already released */ }
    }

    const writer = writerRef.current;
    writerRef.current = null;
    if (writer) {
      try { await writer.abort('Serial connection closing.'); } catch { /* already errored or closed */ }
      try { writer.releaseLock(); } catch { /* already released */ }
    }

    const framer = framerRef.current;
    framerRef.current = null;
    if (framer && (updateUi || mountedRef.current)) addFrames('RX', framer.flush());

    const port = portRef.current;
    portRef.current = null;
    if (port) {
      try { await port.close(); } catch { /* already closed or physically disconnected */ }
    }

    sendBusyRef.current = false;
    if (updateUi && mountedRef.current) {
      setSending(false);
      setConnectionState('idle');
    }
    intentionalCloseRef.current = false;
  }, [addFrames]);

  const closePortAfterReadFailure = useCallback(async (port: SerialPort, message: string) => {
    if (intentionalCloseRef.current || portRef.current !== port) return;
    await teardownPort();
    if (mountedRef.current) setStatus(message);
  }, [teardownPort]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void teardownPort(false);
    };
  }, [teardownPort]);

  async function connect() {
    if (connectionState !== 'idle') return;
    if (!navigator.serial) {
      setStatus('Web Serial is unavailable in this browser. The simulator provides the complete no-hardware fallback.');
      return;
    }

    const attempt = ++connectAttemptRef.current;
    let selectedPort: SerialPort | null = null;
    let opened = false;
    setConnectionState('connecting');
    setStatus('Waiting for a serial device selection and opening the port…');
    try {
      selectedPort = await navigator.serial.requestPort();
      if (!mountedRef.current || attempt !== connectAttemptRef.current) return;

      await selectedPort.open({ baudRate });
      opened = true;
      if (!mountedRef.current || attempt !== connectAttemptRef.current) {
        try { await selectedPort.close(); } catch { /* selection was canceled while open completed */ }
        return;
      }

      portRef.current = selectedPort;
      const framer = new PacketStreamFramer(framing, maxFrameBytes);
      framerRef.current = framer;
      intentionalCloseRef.current = false;
      setConnectionState('connected');
      setStatus(`Serial port connected at ${baudRate} baud using ${framing === 'line' ? 'newline' : 'read-chunk'} framing.`);

      const reader = selectedPort.readable?.getReader();
      if (!reader) {
        setStatus(`Serial port connected at ${baudRate} baud, but this device did not expose a readable stream.`);
        return;
      }
      readerRef.current = reader;
      const port = selectedPort;

      void (async () => {
        let failure: unknown = null;
        let ended = false;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) { ended = true; break; }
            if (value) {
              const frameError = pushFrames('RX', framer, value);
              if (frameError) throw frameError;
            }
          }
        } catch (error) {
          if (!intentionalCloseRef.current && portRef.current === port) failure = error;
        } finally {
          if (readerRef.current === reader) readerRef.current = null;
          try { reader.releaseLock(); } catch { /* already released */ }
          if (!intentionalCloseRef.current && portRef.current === port) addFrames('RX', framer.flush());
        }

        if (failure) {
          const message = failure instanceof PacketFrameLimitError
            ? `Serial frame rejected and the connection was closed: ${failure.message}`
            : `Serial read failed and the connection was closed: ${failure instanceof Error ? failure.message : 'unknown stream error'}`;
          await closePortAfterReadFailure(port, message);
        } else if (ended && !intentionalCloseRef.current && portRef.current === port) {
          await closePortAfterReadFailure(port, 'The serial read stream ended unexpectedly. The connection was closed and its locks were released.');
        }
      })();
    } catch (error) {
      if (!mountedRef.current || attempt !== connectAttemptRef.current) {
        if (selectedPort && opened) {
          try { await selectedPort.close(); } catch { /* stale connection attempt cleanup */ }
        }
        return;
      }
      if (selectedPort && opened) {
        try { await selectedPort.close(); } catch { /* failed connection cleanup */ }
      }
      portRef.current = null;
      framerRef.current = null;
      setConnectionState('idle');
      setStatus(`Serial connection not opened: ${error instanceof Error ? error.message : 'permission declined'}`);
    }
  }

  async function disconnect() {
    if (connectionState === 'idle' || connectionState === 'disconnecting') return;
    const canceledPendingConnection = connectionState === 'connecting';
    await teardownPort();
    setStatus(canceledPendingConnection
      ? 'Connection attempt canceled. If the device picker resolves later, that stale selection will not be opened.'
      : 'Serial port closed and its stream locks released.');
  }

  async function send() {
    let bytes: Uint8Array;
    try {
      bytes = hexToBytes(packet);
      if (!bytes.length) throw new Error('Enter at least one hexadecimal byte.');
    } catch (error) {
      setStatus(`Packet rejected: ${error instanceof Error ? error.message : 'invalid hexadecimal input'}`);
      return;
    }

    const port = portRef.current;
    if (!port) {
      addEntry('SIM TX', bytes, '');
      setStatus('No live port is connected; packet validated and echoed through the simulator fallback.');
      return;
    }
    if (!port.writable) {
      setStatus('The connected serial port is not writable. No bytes were sent.');
      return;
    }
    if (sendBusyRef.current) {
      setStatus('A serial write is already in progress. Wait for it to finish before sending another packet.');
      return;
    }

    sendBusyRef.current = true;
    setSending(true);
    let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    try {
      writer = port.writable.getWriter();
      writerRef.current = writer;
      await writer.write(bytes);
      addEntry('TX', bytes, '');
      if (portRef.current === port) setStatus('Packet transmitted.');
    } catch (error) {
      if (portRef.current === port) {
        setStatus(`Serial write failed; no additional write was started and the writer lock was released: ${error instanceof Error ? error.message : 'unknown write error'}`);
      }
    } finally {
      if (writerRef.current === writer) writerRef.current = null;
      if (writer) {
        try { writer.releaseLock(); } catch { /* already released */ }
      }
      sendBusyRef.current = false;
      if (mountedRef.current) setSending(false);
    }
  }

  function runSimulator() {
    const framer = new PacketStreamFramer(framing, maxFrameBytes);
    const encoder = new TextEncoder();
    let chunks: Uint8Array[];
    if (scenario === 'sensor-ok') {
      chunks = [encoder.encode('sensor=24.3 status=OK\n')];
    } else if (scenario === 'error-burst') {
      chunks = [encoder.encode('sensor=88.1 status=ERROR\n'), encoder.encode('sensor=24.5 status=OK\n')];
    } else {
      const euro = encoder.encode('price=10€ status=OK\n');
      chunks = [euro.slice(0, 9), euro.slice(9, 10), euro.slice(10)];
    }

    try {
      for (const chunk of chunks) {
        const frameError = pushFrames('SIM RX', framer, chunk);
        if (frameError) throw frameError;
      }
      addFrames('SIM RX', framer.flush());
      setStatus(`Simulator scenario “${scenario}” completed using ${framing === 'line' ? 'newline' : 'read-chunk'} framing.`);
    } catch (error) {
      setStatus(`Simulator framing stopped: ${error instanceof Error ? error.message : 'unknown framing error'}`);
    }
  }

  function toggleDisplayPause() {
    if (displayPaused) {
      displayPausedRef.current = false;
      setDisplayPaused(false);
      setDisplaySnapshot(null);
      setCapturePage(0);
      setStatus('Live display resumed. Capture continued while the display was paused.');
      return;
    }
    displayPausedRef.current = true;
    setDisplayPaused(true);
    setDisplaySnapshot(captureRef.current.slice());
    setCapturePage(0);
    setStatus('Display paused. Capture, retention limits, and CSV data collection continue in the background.');
  }

  function clearCapture() {
    captureRef.current = [];
    setCapture([]);
    if (displayPausedRef.current) setDisplaySnapshot([]);
    setTotalFrames(0);
    setCapturedWhileDisplayPaused(0);
    setEvictedFrames(0);
    setCapturePage(0);
    setStatus('Capture cleared and counters reset.');
  }

  function updateRule(index: number, field: keyof LineRule, value: string) {
    setRules((current) => current.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [field]: value } : rule));
  }

  function removeRule(index: number) {
    setRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index));
    setRuleFilter('all');
  }

  const displaySource = displaySnapshot ?? capture;
  const ruleEntries = useMemo(() => Array.from(new Map([...capture, ...displaySource].map((entry) => [entry.id, entry])).values()), [capture, displaySource]);
  const [ruleResult, setRuleResult] = useState<{ entries: typeof ruleEntries; rules: typeof rules; labels: Map<number, string>; error: string } | null>(null);
  const rulesCurrent = ruleResult?.entries === ruleEntries && ruleResult.rules === rules;
  const rulesPending = ruleEntries.length > 0 && rules.length > 0 && !rulesCurrent;
  const ruleError = ruleEntries.length && ruleResult?.rules === rules ? ruleResult.error : '';
  const queueRef = useRef<ReturnType<typeof createPacketRuleQueue> | null>(null);
  const exportRunRef = useRef<ReturnType<typeof runPacketRules> | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    const queue = createPacketRuleQueue(rules, (entries, labels, error) => {
      setRuleResult({ entries: entries as typeof ruleEntries, rules, labels: new Map(labels), error });
    });
    queueRef.current = queue;
    setExporting(false);
    return () => {
      queue.cancel();
      queueRef.current = null;
      exportRunRef.current?.cancel();
      exportRunRef.current = null;
    };
  }, [rules]);
  useEffect(() => { if (ruleEntries.length && rules.length) queueRef.current?.update(ruleEntries); }, [ruleEntries, rules]);
  // Previously completed labels remain valid for retained entries while new
  // capture arrives; changed rules must never reuse old labels.
  const labels = ruleResult?.rules === rules ? ruleResult.labels : undefined;
  const displayLabelledCapture = useMemo(() => displaySource.map((entry) => ({ ...entry, ruleLabel: labels?.get(entry.id) ?? '' })), [displaySource, labels]);

  const filteredCapture = useMemo(() => {
    const needle = filterText.trim().toLocaleLowerCase();
    return displayLabelledCapture.filter((entry) => {
      const directionMatches = directionFilter === 'all'
        || (directionFilter === 'rx' && entry.direction === 'RX')
        || (directionFilter === 'tx' && entry.direction === 'TX')
        || (directionFilter === 'sim' && entry.direction.startsWith('SIM'));
      const textMatches = !needle || `${entry.text} ${entry.hex} ${entry.ruleLabel}`.toLocaleLowerCase().includes(needle);
      const ruleMatches = ruleFilter === 'all' || entry.ruleLabel === ruleFilter;
      return directionMatches && textMatches && ruleMatches;
    });
  }, [displayLabelledCapture, filterText, directionFilter, ruleFilter]);

  useEffect(() => { setCapturePage(0); }, [filterText, directionFilter, ruleFilter, displaySnapshot]);
  useEffect(() => {
    const finalPage = Math.max(0, Math.ceil(filteredCapture.length / DISPLAY_PAGE_SIZE) - 1);
    setCapturePage((current) => Math.min(current, finalPage));
  }, [filteredCapture.length]);

  const pageCount = Math.max(1, Math.ceil(filteredCapture.length / DISPLAY_PAGE_SIZE));
  const pageStart = capturePage * DISPLAY_PAGE_SIZE;
  const displayedCapture = filteredCapture.slice(pageStart, pageStart + DISPLAY_PAGE_SIZE);
  const pageRangeStart = displayedCapture.length ? pageStart + 1 : 0;
  const pageRangeEnd = pageStart + displayedCapture.length;
  const validRuleLabels = Array.from(new Set(rules.filter((rule) => !validateLineRule(rule)).map((rule) => rule.label).filter(Boolean)));

  async function exportCapture() {
    if (!capture.length || ruleError || exportRunRef.current) return;
    const snapshot = capture.slice();
    const run = runPacketRules(snapshot, rules);
    exportRunRef.current = run;
    setExporting(true);
    try {
      const exportLabels = new Map(await run.promise);
      if (exportRunRef.current !== run) return;
      const rows = ['timestamp,direction,rule,hex,text'];
      for (const entry of snapshot.reverse()) {
        rows.push([entry.timestamp, entry.direction, exportLabels.get(entry.id) ?? '', entry.hex, entry.text].map(csvCell).join(','));
      }
      downloadText(rows.join('\r\n'), 'packet-capture.csv', 'text/csv;charset=utf-8');
      setStatus(`Exported ${snapshot.length.toLocaleString()} entries retained when export was requested. ${evictedFrames.toLocaleString()} previously evicted entries were not available for export.`);
    } catch (error) {
      if (exportRunRef.current === run) setStatus(error instanceof Error ? error.message : 'Capture export failed.');
    } finally {
      if (exportRunRef.current === run) { exportRunRef.current = null; setExporting(false); }
    }
  }

  return <>
    <div className="workspace-header"><div><h2>Packet terminal</h2><p>Hex validation, bounded stream framing, capture rules, and explicit device cleanup stay local.</p></div></div>
    <div className="workspace-body">
      <div className="workspace-grid three" style={{ marginTop: 0 }}>
        <div className="field">
          <label htmlFor="baud">Baud rate</label>
          <select id="baud" value={baudRate} disabled={connectionState !== 'idle'} onChange={(event) => setBaudRate(Number(event.target.value))}>
            {BAUD_RATES.map((rate) => <option key={rate} value={rate}>{rate}</option>)}
          </select>
          <small>{connectionState === 'idle' ? 'Match the rate your device is configured for.' : 'Disconnect before changing serial settings.'}</small>
        </div>
        <div className="field">
          <label htmlFor="packet-framing">Receive framing</label>
          <select id="packet-framing" value={framing} disabled={connectionState !== 'idle'} onChange={(event) => setFraming(event.target.value as PacketFramingMode)}>
            <option value="line">Newline-delimited frames</option>
            <option value="chunk">Browser read chunks</option>
          </select>
          <small>Line framing reconstructs records across arbitrary serial read boundaries.</small>
        </div>
        <div className="field">
          <label htmlFor="max-frame-size">Maximum newline frame size</label>
          <select id="max-frame-size" value={maxFrameBytes} disabled={connectionState !== 'idle' || framing !== 'line'} onChange={(event) => setMaxFrameBytes(Number(event.target.value))}>
            {MAX_FRAME_SIZES.map((size) => <option key={size} value={size}>{size >= 1_048_576 ? '1 MiB' : `${size / 1024} KiB`}</option>)}
          </select>
          <small>Unterminated lines beyond this limit are rejected so the receive buffer cannot grow without bound.</small>
        </div>
      </div>

      <div className="button-row">
        <button className="action-button" type="button" onClick={() => void connect()} disabled={connectionState !== 'idle'}>{connectionState === 'connecting' ? 'Connecting…' : 'Connect serial device'}</button>
        <button className="action-button secondary" type="button" onClick={() => void disconnect()} disabled={connectionState === 'idle' || connectionState === 'disconnecting'} data-testid="serial-disconnect">{connectionState === 'connecting' ? 'Cancel connect' : connectionState === 'disconnecting' ? 'Disconnecting…' : 'Disconnect'}</button>
      </div>
      <p className="help-text">Web Serial is not available in every browser. Simulator scenarios exercise the same capture, framing, filtering, rule, and export workflow without hardware permission.</p>

      <div className="workspace-grid" style={{ marginTop: 18 }}>
        <div className="field">
          <label htmlFor="sim-scenario">Simulator scenario</label>
          <select id="sim-scenario" value={scenario} onChange={(event) => setScenario(event.target.value as SimulatorScenario)}>
            <option value="sensor-ok">Nominal sensor frame</option>
            <option value="error-burst">Error then recovery</option>
            <option value="unicode-split">UTF-8 split across reads</option>
          </select>
        </div>
        <div className="button-row" style={{ alignItems: 'end' }}><button className="action-button secondary" type="button" onClick={runSimulator}>Run simulator scenario</button></div>
      </div>

      <div className="field" style={{ marginTop: 18 }}>
        <label htmlFor="packet">Transmit hexadecimal bytes</label>
        <input id="packet" type="text" value={packet} onChange={(event) => setPacket(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void send(); } }} spellCheck={false} />
        <small>Press Enter or use Send packet. With no live port, valid bytes are recorded as simulated TX.</small>
      </div>
      <div className="button-row">
        <button className="action-button secondary" type="button" onClick={() => void send()} disabled={sending}>{sending ? 'Sending…' : 'Send packet'}</button>
        <button className="action-button secondary" type="button" onClick={toggleDisplayPause} aria-pressed={displayPaused}>{displayPaused ? 'Resume live display' : 'Pause display'}</button>
        <button className="action-button secondary" type="button" disabled={!capture.length} onClick={clearCapture}>Clear capture</button>
        <button className="action-button secondary" type="button" disabled={!capture.length || exporting || Boolean(ruleError)} onClick={() => void exportCapture()}>Export retained CSV</button>
      </div>
      <p className="help-text">Pause display freezes the visible log only. Capture continues, retained entries can still be evicted at the cap, and export always uses the current retained capture.</p>

      <div className="status-line" role="status">{status}</div>
      <p role="status" data-testid="packet-rule-status">{ruleError || (rulesPending ? 'Matching capture rules…' : 'Capture rules are up to date.')}</p>

      <section style={{ marginTop: 20 }} aria-labelledby="packet-rules-heading">
        <div className="workspace-header" style={{ padding: 0 }}><div><h3 id="packet-rules-heading">Parsing rules</h3><p>Rules label matching text or hexadecimal content and can be used as capture filters.</p></div></div>
        <div className="result-table-wrap" role="region" aria-label="Packet parsing rules" tabIndex={0}>
          <table><thead><tr><th scope="col">Label</th><th scope="col">Regular expression</th><th scope="col">Validation</th><th scope="col">Action</th></tr></thead><tbody>
            {rules.map((rule, index) => {
              const error = validateLineRule(rule);
              return <tr key={index}>
                <td><input aria-label={`Rule ${index + 1} label`} value={rule.label} onChange={(event) => updateRule(index, 'label', event.target.value)} /></td>
                <td><input aria-label={`Rule ${index + 1} pattern`} value={rule.pattern} onChange={(event) => updateRule(index, 'pattern', event.target.value)} spellCheck={false} /></td>
                <td>{error ? <span role="status">{error}</span> : 'Valid'}</td>
                <td><button type="button" onClick={() => removeRule(index)}>Remove rule</button></td>
              </tr>;
            })}
          </tbody></table>
        </div>
        <button className="action-button secondary" type="button" style={{ marginTop: 10 }} onClick={() => setRules((current) => [...current, { label: `rule-${current.length + 1}`, pattern: '' }])}>Add parsing rule</button>
      </section>

      <div className="workspace-grid three" style={{ marginTop: 20 }}>
        <div className="field"><label htmlFor="capture-search">Search capture</label><input id="capture-search" type="search" value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="Text, hex, or rule label" /></div>
        <div className="field"><label htmlFor="direction-filter">Direction</label><select id="direction-filter" value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value as typeof directionFilter)}><option value="all">All directions</option><option value="rx">Hardware RX</option><option value="tx">Hardware TX</option><option value="sim">Simulator</option></select></div>
        <div className="field"><label htmlFor="rule-filter">Rule label</label><select id="rule-filter" value={ruleFilter} onChange={(event) => setRuleFilter(event.target.value)}><option value="all">All labels</option>{validRuleLabels.map((label) => <option key={label} value={label}>{label}</option>)}</select></div>
      </div>

      <div className="code-output" data-testid="packet-stream" role="log" aria-live={displayPaused ? 'off' : 'polite'} aria-label="Received packet stream" tabIndex={0} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {displayedCapture.length
          ? displayedCapture.map((entry) => `${entry.timestamp} · ${entry.direction}${entry.ruleLabel ? ` · [${entry.ruleLabel}]` : ''} · ${entry.hex || '(no bytes)'}${entry.text ? ` · ${entry.text}` : ''}`).join('\n')
          : 'Capture is empty for the current filters. Run a simulator scenario, transmit a packet, or connect a device.'}
      </div>
      <div className="button-row" aria-label="Capture pages">
        <button className="action-button secondary" type="button" disabled={capturePage === 0} onClick={() => setCapturePage((page) => Math.max(0, page - 1))}>Newer entries</button>
        <button className="action-button secondary" type="button" disabled={capturePage >= pageCount - 1} onClick={() => setCapturePage((page) => Math.min(pageCount - 1, page + 1))}>Older entries</button>
      </div>
      <small data-testid="packet-capture-summary">
        Showing {pageRangeStart.toLocaleString()}–{pageRangeEnd.toLocaleString()} of {filteredCapture.length.toLocaleString()} matching {displayPaused ? 'paused-display' : 'live'} entries · page {(capturePage + 1).toLocaleString()} of {pageCount.toLocaleString()} · {capture.length.toLocaleString()} retained / {CAPTURE_LIMIT.toLocaleString()} maximum · {totalFrames.toLocaleString()} events observed · {capturedWhileDisplayPaused.toLocaleString()} captured while display paused · {evictedFrames.toLocaleString()} evicted. CSV export covers all currently retained entries.
      </small>
    </div>
  </>;
}
