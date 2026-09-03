import { useRef, useState } from 'react';
import { bytesToHex, hexToBytes } from './packet-engine';

type SerialPort = { open(options:{baudRate:number}):Promise<void>; close():Promise<void>; readable?:ReadableStream<Uint8Array>; writable?:WritableStream<Uint8Array> };

declare global { interface Navigator { serial?: { requestPort(): Promise<SerialPort> } } }

export default function HardwareWorkspace() {
  const portRef = useRef<SerialPort | null>(null);
  const [stream, setStream] = useState<string[]>([]); const [packet, setPacket] = useState('0A FF 10'); const [status,setStatus]=useState('Connect through Web Serial when available, or use the built-in simulator.');
  const add=(line:string)=>setStream((current)=>[line,...current].slice(0,200));
  function simulator(){add(`SIM RX ${bytesToHex(new Uint8Array([0x53,0x49,0x4d,0x01]))} · sensor=24.3 status=OK`);setStatus('Simulator active. No hardware permission is required.');}
  async function connect(){if(!navigator.serial){setStatus('Web Serial is unavailable in this browser. Use simulator mode.');return;} try{const port=await navigator.serial.requestPort();await port.open({baudRate:115200});portRef.current=port;setStatus('Serial port connected at 115200 baud.');const reader=port.readable?.getReader();if(reader){void (async()=>{try{while(true){const {done,value}=await reader.read();if(done)break;if(value)add(`RX ${bytesToHex(value)} · ${new TextDecoder().decode(value)}`)}}finally{reader.releaseLock()}})();}}catch(error){setStatus(`Serial connection not opened: ${error instanceof Error?error.message:'permission declined'}`)}}
  async function send(){try{const bytes=hexToBytes(packet);const writer=portRef.current?.writable?.getWriter();if(writer){await writer.write(bytes);writer.releaseLock();add(`TX ${bytesToHex(bytes)}`);setStatus('Packet transmitted.');}else{add(`SIM TX ${bytesToHex(bytes)}`);setStatus('No live port is connected; packet validated and echoed in simulator mode.');}}catch(error){setStatus(`Packet rejected: ${error instanceof Error?error.message:'invalid hexadecimal input'}`)}}
  return <><div className="workspace-header"><div><h2>Packet terminal</h2><p>Hex validation prevents partial or malformed byte writes.</p></div></div><div className="workspace-body">
    <div className="button-row" style={{marginTop:0}}><button className="action-button" type="button" onClick={()=>void connect()}>Connect serial device</button><button className="action-button secondary" type="button" onClick={simulator}>Start simulator</button></div>
    <div className="field" style={{marginTop:18}}><label htmlFor="packet">Transmit hexadecimal bytes</label><input id="packet" type="text" value={packet} onChange={(e)=>setPacket(e.target.value)} spellCheck={false}/></div><div className="button-row"><button className="action-button secondary" type="button" onClick={()=>void send()}>Send packet</button></div><div className="status-line" role="status">{status}</div>
    <div className="code-output" data-testid="packet-stream" role="log" aria-live="polite" aria-label="Received packet stream" tabIndex={0}>{stream.length?stream.join('\n'):'RX stream is empty. Start the simulator or connect a device.'}</div>
  </div></>;
}
