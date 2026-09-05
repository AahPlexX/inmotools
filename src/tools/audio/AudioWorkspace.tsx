import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadBytes } from '../../lib/download';
import SpectrogramCanvas from './SpectrogramCanvas';
import { encodePcm24Wav } from './audio-engine';
import { consumeFileInput } from '../../lib/file-input';

type AudioAsset = { name: string; buffer: AudioBuffer };
type RoomConfig = { wet: number; preDelayMs: number; lowCutHz: number; highCutHz: number };
type Playback = { source: AudioBufferSourceNode; startedAt: number };

function connectRoomGraph(context: BaseAudioContext, source: AudioBufferSourceNode, destination: AudioNode, impulse: AudioBuffer, config: RoomConfig, analyser?: AnalyserNode) {
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const master = context.createGain();
  const preDelay = context.createDelay(2);
  const highPass = context.createBiquadFilter();
  const lowPass = context.createBiquadFilter();
  const convolver = context.createConvolver();

  const mix = Math.max(0, Math.min(1, config.wet));
  dryGain.gain.value = Math.cos(mix * Math.PI / 2);
  wetGain.gain.value = Math.sin(mix * Math.PI / 2);
  preDelay.delayTime.value = Math.max(0, Math.min(2, config.preDelayMs / 1000));
  highPass.type = 'highpass';
  highPass.frequency.value = Math.max(10, config.lowCutHz);
  lowPass.type = 'lowpass';
  lowPass.frequency.value = Math.max(highPass.frequency.value + 10, config.highCutHz);
  convolver.buffer = impulse;
  convolver.normalize = true;

  source.connect(dryGain).connect(master);
  source.connect(preDelay).connect(highPass).connect(lowPass).connect(convolver).connect(wetGain).connect(master);
  if (analyser) master.connect(analyser).connect(destination);
  else master.connect(destination);
}

export default function AudioWorkspace() {
  const contextRef = useRef<AudioContext | null>(null);
  const playbackRef = useRef<Playback | null>(null);
  const offsetRef = useRef(0);
  const [dry, setDry] = useState<AudioAsset | null>(null);
  const [impulse, setImpulse] = useState<AudioAsset | null>(null);
  const [wet, setWet] = useState(0.38);
  const [preDelayMs, setPreDelayMs] = useState(18);
  const [lowCutHz, setLowCutHz] = useState(80);
  const [highCutHz, setHighCutHz] = useState(14_000);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState('Choose a dry audio file and an impulse response. Both stay on this device.');

  const config = useMemo<RoomConfig>(() => ({ wet, preDelayMs, lowCutHz, highCutHz }), [highCutHz, lowCutHz, preDelayMs, wet]);

  function ensureContext(): AudioContext {
    if (typeof AudioContext === 'undefined') throw new Error('Web Audio is not available in this browser.');
    contextRef.current ??= new AudioContext();
    return contextRef.current;
  }

  function stopSource(resetOffset: boolean) {
    const playback = playbackRef.current;
    if (playback) {
      playback.source.onended = null;
      try { playback.source.stop(); } catch { /* already stopped */ }
      playback.source.disconnect();
      playbackRef.current = null;
    }
    if (resetOffset) offsetRef.current = 0;
    setPlaying(false);
    setAnalyser(null);
  }

  useEffect(() => () => {
    stopSource(true);
    const context = contextRef.current;
    contextRef.current = null;
    if (context) void context.close();
  }, []);

  async function loadAudio(file: File | undefined, kind: 'dry' | 'impulse') {
    if (!file) return;
    try {
      stopSource(true);
      const context = ensureContext();
      const buffer = await context.decodeAudioData((await file.arrayBuffer()).slice(0));
      const asset = { name: file.name, buffer };
      if (kind === 'dry') setDry(asset); else setImpulse(asset);
      setPaused(false);
      setStatus(`${file.name} decoded locally: ${buffer.duration.toFixed(2)} s · ${buffer.sampleRate.toLocaleString()} Hz · ${buffer.numberOfChannels} channel${buffer.numberOfChannels === 1 ? '' : 's'}.`);
    } catch (error) {
      setStatus(`Audio decode failed: ${error instanceof Error ? error.message : 'unsupported audio file'}`);
    }
  }

  async function play() {
    if (!dry || !impulse) { setStatus('Choose both a dry audio file and an impulse response first.'); return; }
    try {
      stopSource(false);
      const context = ensureContext();
      await context.resume();
      const source = context.createBufferSource();
      const liveAnalyser = context.createAnalyser();
      liveAnalyser.fftSize = 2048;
      liveAnalyser.smoothingTimeConstant = 0.75;
      source.buffer = dry.buffer;
      connectRoomGraph(context, source, context.destination, impulse.buffer, config, liveAnalyser);
      const offset = Math.max(0, Math.min(offsetRef.current, Math.max(0, dry.buffer.duration - 0.001)));
      const startedAt = context.currentTime;
      playbackRef.current = { source, startedAt };
      source.onended = () => {
        if (playbackRef.current?.source !== source) return;
        playbackRef.current = null; offsetRef.current = 0; setPlaying(false); setPaused(false); setAnalyser(null); setStatus('Playback finished.');
      };
      source.start(0, offset);
      setAnalyser(liveAnalyser); setPlaying(true); setPaused(false);
      setStatus(`${offset ? 'Resumed' : 'Playing'} locally with ${(wet * 100).toFixed(0)}% wet mix.`);
    } catch (error) { setStatus(`Playback failed: ${error instanceof Error ? error.message : 'Web Audio error'}`); }
  }

  function pause() {
    const playback = playbackRef.current;
    const context = contextRef.current;
    if (!playback || !context || !dry) return;
    offsetRef.current = Math.min(dry.buffer.duration, offsetRef.current + Math.max(0, context.currentTime - playback.startedAt));
    stopSource(false); setPaused(true); setStatus(`Paused at ${offsetRef.current.toFixed(2)} s.`);
  }

  function stop() {
    stopSource(true); setPaused(false); setStatus('Playback stopped.');
  }

  async function renderOffline() {
    if (!dry || !impulse) { setStatus('Choose both source files before rendering.'); return; }
    try {
      setStatus('Rendering the wet/dry graph locally with OfflineAudioContext…');
      const sampleRate = dry.buffer.sampleRate;
      const duration = dry.buffer.duration + impulse.buffer.duration + config.preDelayMs / 1000;
      const channelCount = Math.max(1, Math.min(32, Math.max(dry.buffer.numberOfChannels, impulse.buffer.numberOfChannels)));
      const offline = new OfflineAudioContext(channelCount, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
      const source = offline.createBufferSource();
      source.buffer = dry.buffer;
      connectRoomGraph(offline, source, offline.destination, impulse.buffer, config);
      source.start();
      const rendered = await offline.startRendering();
      const channels = Array.from({ length: rendered.numberOfChannels }, (_, index) => rendered.getChannelData(index));
      const wav = encodePcm24Wav(channels, rendered.sampleRate);
      const base = dry.name.replace(/\.[^.]+$/, '') || 'room-profile';
      downloadBytes(new Uint8Array(wav), `${base}.convolved-24bit.wav`, 'audio/wav');
      setStatus(`Rendered ${rendered.duration.toFixed(2)} s as ${rendered.numberOfChannels}-channel 24-bit PCM WAV.`);
    } catch (error) { setStatus(`Offline render failed: ${error instanceof Error ? error.message : 'Web Audio error'}`); }
  }

  return <>
    <div className="workspace-header"><div><h2>Convolution room profiler</h2><p>Audition a dry source through a local impulse response and render the same graph offline.</p></div></div>
    <div className="workspace-body">
      {typeof AudioContext === 'undefined' ? <div className="notice">This browser does not expose the Web Audio API required by this workspace.</div> : <>
        <div className="workspace-grid">
          <div className="field"><label htmlFor="audio-dry">Dry source audio</label><input id="audio-dry" type="file" accept="audio/*" onChange={(event) => consumeFileInput(event.target, () => loadAudio(event.target.files?.[0], 'dry'))}/><small>{dry ? `${dry.name} · ${dry.buffer.duration.toFixed(2)} s` : 'Choose audio that you want to place into the room response.'}</small></div>
          <div className="field"><label htmlFor="audio-ir">Impulse response</label><input id="audio-ir" type="file" accept="audio/*" onChange={(event) => consumeFileInput(event.target, () => loadAudio(event.target.files?.[0], 'impulse'))}/><small>{impulse ? `${impulse.name} · ${impulse.buffer.duration.toFixed(2)} s` : 'Choose a local room, hall, cabinet, or other impulse-response recording.'}</small></div>
        </div>
        <div className="workspace-grid" style={{ marginTop: 20 }}>
          <div className="field"><label htmlFor="audio-wet">Wet mix · {(wet * 100).toFixed(0)}%</label><input id="audio-wet" type="range" min="0" max="1" step="0.01" value={wet} onChange={(event) => setWet(Number(event.target.value))}/><small>Equal-power crossfade between the dry and convolved paths.</small></div>
          <div className="field"><label htmlFor="audio-predelay">Pre-delay (ms)</label><input id="audio-predelay" type="number" min="0" max="2000" step="1" value={preDelayMs} onChange={(event) => setPreDelayMs(Math.max(0, Math.min(2000, Number(event.target.value))))}/></div>
          <div className="field"><label htmlFor="audio-lowcut">Low cut (Hz)</label><input id="audio-lowcut" type="number" min="10" max="5000" step="10" value={lowCutHz} onChange={(event) => setLowCutHz(Math.max(10, Number(event.target.value)))}/></div>
          <div className="field"><label htmlFor="audio-highcut">High cut (Hz)</label><input id="audio-highcut" type="number" min="100" max="24000" step="100" value={highCutHz} onChange={(event) => setHighCutHz(Math.max(100, Number(event.target.value)))}/></div>
        </div>
        <div className="button-row"><button className="action-button" type="button" disabled={!dry || !impulse || playing} onClick={() => void play()}>{paused ? 'Resume preview' : 'Play preview'}</button><button className="action-button secondary" type="button" disabled={!playing} onClick={pause}>Pause</button><button className="action-button secondary" type="button" disabled={!playing && !paused} onClick={stop}>Stop</button><button className="action-button secondary" type="button" disabled={!dry || !impulse} onClick={() => void renderOffline()}>Render 24-bit WAV</button></div>
        <SpectrogramCanvas analyser={analyser} active={playing}/>
        {dry && impulse ? <div className="metric-row"><div className="metric"><span>Dry duration</span><strong>{dry.buffer.duration.toFixed(2)} s</strong></div><div className="metric"><span>IR duration</span><strong>{impulse.buffer.duration.toFixed(2)} s</strong></div><div className="metric"><span>Sample rate</span><strong>{dry.buffer.sampleRate.toLocaleString()} Hz</strong></div><div className="metric"><span>Export depth</span><strong>24-bit PCM</strong></div></div> : null}
      </>}
      <div className={`status-line ${dry || impulse ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
