import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadText } from '../../lib/download';
import {
  bytesToHex,
  hexToBytes,
  matchLineRule,
  PacketStreamFramer,
  validateLineRule,
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
const CAPTURE_LIMIT = 5_000;
const DISPLAY_LIMIT = 200;

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
  const framerRef = useRef<PacketStreamFramer | null>(null);
  const intentionalCloseRef = useRef(false);
  const pausedRef = useRef(false);
  const captureRef = useRef<CaptureEntry[]>([]);
  const nextCaptureId = useRef(1);

  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [baudRate, setBaudRate] = useState(115200);
  const [framing, setFraming] = useState<PacketFramingMode>('line');
  const [packet, setPacket] = useState('0A FF 10');
  const [paused, setPaused] = useState(false);
  const [capture, setCapture] = useState<CaptureEntry[]>([]);
  const [totalFrames, setTotalFrames] = useState(0);
  const [droppedFrames, setDroppedFrames] = useState(0);
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
    if (pausedRef.current) {
      setDroppedFrames((count) => count + 1);
      return;
    }
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
      setDroppedFrames((count) => count + overflow);
    }
    captureRef.current = next;
    setCapture(next);
  }, []);

  const addFrames = useCallback((direction: Direction, frames: ReturnType<PacketStreamFramer['push']>) => {
    frames.forEach((frame) => addEntry(direction, frame.bytes, frame.text));
  }, [addEntry]);

  const closePortAfterReadFailure = useCallback(async (port: SerialPort, message: string) => {
    if (intentionalCloseRef.current || portRef.current !== port) return;
    portRef.current = null;
    framerRef.current = null;
    try { await port.close(); } catch { /* the device may already be gone */ }
    setConnectionState('idle');
    setStatus(message);
  }, []);

  const teardownPort = useCallback(async () => {
    intentionalCloseRef.current = true;
    setConnectionState('disconnecting');
    const reader = readerRef.current;
    readerRef.current = null;
    if (reader) {
      try { await reader.cancel(); } catch { /* already errored or closed */ }
      try { reader.releaseLock(); } catch { /* already released */ }
    }

    const framer = framerRef.current;
    framerRef.current = null;
    if (framer) addFrames('RX', framer.flush());

    const port = portRef.current;
    portRef.current = null;
    if (port) {
      try { await port.close(); } catch { /* already closed or physically disconnected */ }
    }
    setConnectionState('idle');
    intentionalCloseRef.current = false;
  }, [addFrames]);

  useEffect(() => () => { void teardownPort(); }, [teardownPort]);

  async function connect() {
    if (connectionState !== 'idle') return;
    if (!navigator.serial) {
      setStatus('Web Serial is unavailable in this browser. The simulator provides the complete no-hardware fallback.');
      return;
    }

    setConnectionState('connecting');
    setStatus('Waiting for a serial device selection and opening the port…');
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate });
      portRef.current = port;
      const framer = new PacketStreamFramer(framing);
      framerRef.current = framer;
      intentionalCloseRef.current = false;
      setConnectionState('connected');
      setStatus(`Serial port connected at ${baudRate} baud using ${framing === 'line' ? 'newline' : 'read-chunk'} framing.`);

      const reader = port.readable?.getReader();
      if (!reader) {
        setStatus(`Serial port connected at ${baudRate} baud, but this device did not expose a readable stream.`);
        return;
      }
      readerRef.current = reader;

      void (async () => {
        let failure: unknown = null;
        let ended = false;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) { ended = true; break; }
            if (value) addFrames('RX', framer.push(value));
          }
        } catch (error) {
          if (!intentionalCloseRef.current) failure = error;
        } finally {
          if (readerRef.current === reader) readerRef.current = null;
          try { reader.releaseLock(); } catch { /* already released */ }
          if (!intentionalCloseRef.current) addFrames('RX', framer.flush());
        }

        if (failure) {
          await closePortAfterReadFailure(port, `Serial read failed and the connection was closed: ${failure instanceof Error ? failure.message : 'unknown stream error'}`);
        } else if (ended && !intentionalCloseRef.current) {
          await closePortAfterReadFailure(port, 'The serial read stream ended unexpectedly. The connection was closed and its locks were released.');
        }
      })();
    } catch (error) {
      portRef.current = null;
      framerRef.current = null;
      setConnectionState('idle');
      setStatus(`Serial connection not opened: ${error instanceof Error ? error.message : 'permission declined'}`);
    }
  }

  async function disconnect() {
    if (connectionState === 'idle') return;
    await teardownPort();
    setStatus('Serial port closed and its stream locks released.');
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

    const writer = port.writable.getWriter();
    try {
      await writer.write(bytes);
      addEntry('TX', bytes, '');
      setStatus('Packet transmitted.');
    } catch (error) {
      setStatus(`Serial write failed; the writer lock was released for recovery: ${error instanceof Error ? error.message : 'unknown write error'}`);
    } finally {
      try { writer.releaseLock(); } catch { /* already released */ }
    }
  }

  function runSimulator() {
    const framer = new PacketStreamFramer(framing);
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
    chunks.forEach((chunk) => addFrames('SIM RX', framer.push(chunk)));
    addFrames('SIM RX', framer.flush());
    setStatus(`Simulator scenario “${scenario}” completed using ${framing === 'line' ? 'newline' : 'read-chunk'} framing.`);
  }

  function clearCapture() {
    captureRef.current = [];
    setCapture([]);
    setTotalFrames(0);
    setDroppedFrames(0);
    setStatus('Capture cleared and counters reset.');
  }

  function updateRule(index: number, field: keyof LineRule, value: string) {
    setRules((current) => current.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, [field]: value } : rule));
  }

  function removeRule(index: number) {
    setRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index));
    setRuleFilter('all');
  }

  const labelledCapture = useMemo(() => capture.map((entry) => {
    const subject = `${entry.text} ${entry.hex}`;
    const rule = rules.find((candidate) => !validateLineRule(candidate) && matchLineRule(subject, candidate));
    return { ...entry, ruleLabel: rule?.label ?? '' };
  }), [capture, rules]);

  const filteredCapture = useMemo(() => {
    const needle = filterText.trim().toLocaleLowerCase();
    return labelledCapture.filter((entry) => {
      const directionMatches = directionFilter === 'all'
        || (directionFilter === 'rx' && entry.direction === 'RX')
        || (directionFilter === 'tx' && entry.direction === 'TX')
        || (directionFilter === 'sim' && entry.direction.startsWith('SIM'));
      const textMatches = !needle || `${entry.text} ${entry.hex} ${entry.ruleLabel}`.toLocaleLowerCase().includes(needle);
      const ruleMatches = ruleFilter === 'all' || entry.ruleLabel === ruleFilter;
      return directionMatches && textMatches && ruleMatches;
    });
  }, [labelledCapture, filterText, directionFilter, ruleFilter]);

  const displayedCapture = filteredCapture.slice(0, DISPLAY_LIMIT);
  const validRuleLabels = Array.from(new Set(rules.filter((rule) => !validateLineRule(rule)).map((rule) => rule.label).filter(Boolean)));

  function exportCapture() {
    if (!capture.length) return;
    const rows = ['timestamp,direction,rule,hex,text'];
    for (const entry of labelledCapture.slice().reverse()) {
      rows.push([entry.timestamp, entry.direction, entry.ruleLabel, entry.hex, entry.text].map(csvCell).join(','));
    }
    downloadText(rows.join('\r\n'), 'packet-capture.csv', 'text/csv;charset=utf-8');
    setStatus(`Exported ${capture.length.toLocaleString()} retained capture entries. ${droppedFrames.toLocaleString()} dropped entr${droppedFrames === 1 ? 'y was' : 'ies were'} not available for export.`);
  }

  return <>
    <div className="workspace-header"><div><h2>Packet terminal</h2><p>Hex validation, stream framing, capture rules, and explicit device cleanup stay local.</p></div></div>
    <div className="workspace-body">
      <div className="workspace-grid" style={{ marginTop: 0 }}>
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
      </div>

      <div className="button-row">
        <button className="action-button" type="button" onClick={() => void connect()} disabled={connectionState !== 'idle'}>{connectionState === 'connecting' ? 'Connecting…' : 'Connect serial device'}</button>
        <button className="action-button secondary" type="button" onClick={() => void disconnect()} disabled={connectionState === 'idle' || connectionState === 'connecting'} data-testid="serial-disconnect">{connectionState === 'disconnecting' ? 'Disconnecting…' : 'Disconnect'}</button>
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
        <button className="action-button secondary" type="button" onClick={() => void send()}>Send packet</button>
        <button className="action-button secondary" type="button" onClick={() => { setPaused((current) => { pausedRef.current = !current; return !current; }); }} aria-pressed={paused}>{paused ? 'Resume capture' : 'Pause capture'}</button>
        <button className="action-button secondary" type="button" disabled={!capture.length} onClick={clearCapture}>Clear capture</button>
        <button className="action-button secondary" type="button" disabled={!capture.length} onClick={exportCapture}>Export retained CSV</button>
      </div>

      <div className="status-line" role="status">{status}</div>

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

      <div className="code-output" data-testid="packet-stream" role="log" aria-live="polite" aria-label="Received packet stream" tabIndex={0}>
        {displayedCapture.length
          ? displayedCapture.map((entry) => `${entry.timestamp} · ${entry.direction}${entry.ruleLabel ? ` · [${entry.ruleLabel}]` : ''} · ${entry.hex || '(no bytes)'}${entry.text ? ` · ${entry.text}` : ''}`).join('\n')
          : 'Capture is empty for the current filters. Run a simulator scenario, transmit a packet, or connect a device.'}
      </div>
      <small>
        Showing {displayedCapture.length.toLocaleString()} of {filteredCapture.length.toLocaleString()} matching retained entries · {capture.length.toLocaleString()} retained / {CAPTURE_LIMIT.toLocaleString()} maximum · {totalFrames.toLocaleString()} events observed · {droppedFrames.toLocaleString()} dropped or evicted{paused ? ' · capture paused' : ''}. Display is capped at the newest {DISPLAY_LIMIT}; CSV export covers all retained entries, never dropped entries.
      </small>
    </div>
  </>;
}
