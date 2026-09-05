import { useCallback, useEffect, useRef, useState } from 'react';
import { bytesToHex, hexToBytes } from './packet-engine';

type SerialPort = {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable?: ReadableStream<Uint8Array>;
  writable?: WritableStream<Uint8Array>;
};

declare global { interface Navigator { serial?: { requestPort(): Promise<SerialPort> } } }

// Standard rates, including the slower ones legacy microcontrollers ship with.
const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
const STREAM_LIMIT = 200;

export default function HardwareWorkspace() {
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const [connected, setConnected] = useState(false);
  const [baudRate, setBaudRate] = useState(115200);
  const [stream, setStream] = useState<string[]>([]);
  const [packet, setPacket] = useState('0A FF 10');
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [status, setStatus] = useState('Connect through Web Serial when available, or use the built-in simulator.');

  const add = (line: string) => {
    if (pausedRef.current) return;
    setStream((current) => [line, ...current].slice(0, STREAM_LIMIT));
  };

  // Releasing the reader lock and closing the port is what actually frees the
  // device. Without it the readable and writable locks stayed held until the tab
  // was reloaded, so the port could not be reopened here or claimed by any other
  // application - a leak the user had no control over.
  const teardownPort = useCallback(async () => {
    const reader = readerRef.current;
    readerRef.current = null;
    if (reader) {
      try { await reader.cancel(); } catch { /* already errored or closed */ }
      try { reader.releaseLock(); } catch { /* already released */ }
    }
    const port = portRef.current;
    portRef.current = null;
    if (port) {
      try { await port.close(); } catch { /* already closed */ }
    }
    setConnected(false);
  }, []);

  // Unmounting the workspace must release the device too; navigating away is the
  // most likely way to leave a port open.
  useEffect(() => () => { void teardownPort(); }, [teardownPort]);

  function simulator() {
    add(`SIM RX ${bytesToHex(new Uint8Array([0x53, 0x49, 0x4d, 0x01]))} · sensor=24.3 status=OK`);
    setStatus('Simulator active. No hardware permission is required.');
  }

  async function connect() {
    if (!navigator.serial) {
      setStatus('Web Serial is unavailable in this browser. Use simulator mode.');
      return;
    }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate });
      portRef.current = port;
      setConnected(true);
      setStatus(`Serial port connected at ${baudRate} baud.`);
      const reader = port.readable?.getReader();
      if (reader) {
        readerRef.current = reader;
        void (async () => {
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) add(`RX ${bytesToHex(value)} · ${new TextDecoder().decode(value)}`);
            }
          } catch {
            // A cancelled read during disconnect lands here and is expected.
          } finally {
            try { reader.releaseLock(); } catch { /* already released */ }
          }
        })();
      }
    } catch (error) {
      setStatus(`Serial connection not opened: ${error instanceof Error ? error.message : 'permission declined'}`);
    }
  }

  async function disconnect() {
    await teardownPort();
    setStatus('Serial port closed and its stream locks released.');
  }

  async function send() {
    try {
      const bytes = hexToBytes(packet);
      const writer = portRef.current?.writable?.getWriter();
      if (writer) {
        await writer.write(bytes);
        writer.releaseLock();
        add(`TX ${bytesToHex(bytes)}`);
        setStatus('Packet transmitted.');
      } else {
        add(`SIM TX ${bytesToHex(bytes)}`);
        setStatus('No live port is connected; packet validated and echoed in simulator mode.');
      }
    } catch (error) {
      setStatus(`Packet rejected: ${error instanceof Error ? error.message : 'invalid hexadecimal input'}`);
    }
  }

  return (
    <>
      <div className="workspace-header">
        <div>
          <h2>Packet terminal</h2>
          <p>Hex validation prevents partial or malformed byte writes.</p>
        </div>
      </div>
      <div className="workspace-body">
        <div className="workspace-grid" style={{ marginTop: 0 }}>
          <div className="field">
            <label htmlFor="baud">Baud rate</label>
            <select id="baud" value={baudRate} disabled={connected} onChange={(event) => setBaudRate(Number(event.target.value))}>
              {BAUD_RATES.map((rate) => <option key={rate} value={rate}>{rate}</option>)}
            </select>
            <small>{connected ? 'Disconnect to change the rate.' : 'Match the rate your device is configured for.'}</small>
          </div>
        </div>
        <div className="button-row">
          <button className="action-button" type="button" onClick={() => void connect()} disabled={connected}>Connect serial device</button>
          <button className="action-button secondary" type="button" onClick={() => void disconnect()} disabled={!connected} data-testid="serial-disconnect">Disconnect</button>
          <button className="action-button secondary" type="button" onClick={simulator}>Start simulator</button>
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="packet">Transmit hexadecimal bytes</label>
          <input
            id="packet"
            type="text"
            value={packet}
            onChange={(event) => setPacket(event.target.value)}
            // Enter is what anyone used to a serial terminal will press.
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void send(); } }}
            spellCheck={false}
          />
          <small>Press Enter or use Send packet.</small>
        </div>
        <div className="button-row">
          <button className="action-button secondary" type="button" onClick={() => void send()}>Send packet</button>
          <button
            className="action-button secondary"
            type="button"
            onClick={() => { setPaused((current) => { pausedRef.current = !current; return !current; }); }}
            aria-pressed={paused}
            data-testid="stream-pause"
          >
            {paused ? 'Resume capture' : 'Pause capture'}
          </button>
          <button className="action-button secondary" type="button" disabled={!stream.length} onClick={() => setStream([])} data-testid="stream-clear">Clear log</button>
        </div>
        <div className="status-line" role="status">{status}</div>
        <div className="code-output" data-testid="packet-stream" role="log" aria-live="polite" aria-label="Received packet stream" tabIndex={0}>
          {stream.length ? stream.join('\n') : 'RX stream is empty. Start the simulator or connect a device.'}
        </div>
        <small>Showing the most recent {STREAM_LIMIT} frames{paused ? ' · capture paused' : ''}.</small>
      </div>
    </>
  );
}
