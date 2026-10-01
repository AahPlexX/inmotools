/**
 * Meters and monitoring tab (ledgers 60–71).
 *
 * Readings come from the realtime worklet about ten times per second while
 * playing and always describe the processed master. The spectrum overlay
 * reads two AnalyserNodes (before and after the chain); the goniometer draws
 * the worklet's latest Mid/Side points. Monitoring controls (listen source,
 * matrix, mono, loudness match, reference track) change only what you hear.
 */
import { useEffect, useRef, type ChangeEvent } from 'react';
import type { ListenSource, MonitorMode, WorkletMeterMessage } from './mastering-worklet-protocol';
import { CommitNumberField, formatTime } from './mastering-ui';

export interface MonitorState {
  listen: ListenSource;
  monitor: MonitorMode;
  mono: boolean;
  matchLoudness: boolean;
  excursionThresholdDb: number;
}

export const LOUDNESS_TARGETS = [
  { value: -14, label: 'General streaming reference (−14 LUFS)' },
  { value: -16, label: 'Spoken-word reference (−16 LUFS)' },
  { value: -23, label: 'Broadcast, EBU R 128 (−23 LUFS)' },
  { value: -24, label: 'Broadcast, ATSC A/85 (−24 LKFS)' },
] as const;

interface Props {
  meters: WorkletMeterMessage | null;
  playing: boolean;
  pre: AnalyserNode | null;
  post: AnalyserNode | null;
  monitor: MonitorState;
  onMonitorChange: (patch: Partial<MonitorState>) => void;
  target: number;
  onTargetChange: (value: number) => void;
  referenceName: string | null;
  referenceBusy: boolean;
  onReferenceFile: (file: File) => void;
  onClearReference: () => void;
  onResetMeters: () => void;
  /** Maps a worklet time (AudioContext seconds) to a timeline position, or null when unknown. */
  timelineAt: (contextTime: number) => number | null;
  onJump: (seconds: number) => void;
}

const lufs = (value: number | undefined) => value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(1);
const signed = (value: number | undefined) => value === undefined || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}`;

function SpectrumCanvas({ pre, post, playing }: { pre: AnalyserNode | null; post: AnalyserNode | null; playing: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let frame = 0;
    const draw = () => {
      // Keep the loop alive while playing even when the tab is hidden (zero width),
      // so the spectrum appears as soon as the tab is shown.
      if (playing) frame = requestAnimationFrame(draw);
      const width = canvas.clientWidth;
      const height = 160;
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
      const context = canvas.getContext('2d');
      if (!context || width <= 0) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = '#111820';
      context.fillRect(0, 0, width, height);
      const plot = (analyser: AnalyserNode | null, color: string) => {
        if (!analyser) return;
        const data = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(data);
        const nyquist = analyser.context.sampleRate / 2;
        context.strokeStyle = color;
        context.beginPath();
        for (let x = 0; x < width; x += 1) {
          const hz = 20 * (nyquist / 20) ** (x / width);
          const value = data[Math.min(data.length - 1, Math.round(hz / nyquist * data.length))];
          const y = Math.min(height, Math.max(0, (-(value) - 10) / 110 * height));
          if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.stroke();
      };
      plot(pre, 'rgba(174, 184, 194, 0.7)');
      plot(post, '#f2b84b');
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [pre, post, playing]);
  return <canvas ref={ref} className="mastering-meter-canvas" style={{ height: 160 }} role="img" aria-label="Spectrum before (grey) and after (amber) the master chain, 20 Hz to Nyquist." />;
}

function Goniometer({ points }: { points: Float32Array | undefined }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const size = 180;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = size * ratio; canvas.height = size * ratio;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#111820';
    context.fillRect(0, 0, size, size);
    context.strokeStyle = '#26313c';
    context.beginPath(); context.moveTo(size / 2, 0); context.lineTo(size / 2, size); context.moveTo(0, size / 2); context.lineTo(size, size / 2);
    context.moveTo(0, 0); context.lineTo(size, size); context.moveTo(size, 0); context.lineTo(0, size); context.stroke();
    context.fillStyle = '#7d8a97';
    context.font = '10px system-ui, sans-serif';
    context.fillText('M', size / 2 + 3, 11); context.fillText('L', 4, 11); context.fillText('R', size - 10, 11);
    if (!points) return;
    context.fillStyle = 'rgba(127, 209, 185, 0.8)';
    for (let index = 0; index < points.length; index += 2) {
      const x = size / 2 + points[index] * size / 2;
      const y = size / 2 - points[index + 1] * size / 2;
      context.fillRect(x, y, 1.5, 1.5);
    }
  }, [points]);
  return <canvas ref={ref} className="mastering-goniometer" width={180} height={180} role="img" aria-label="Goniometer: a vertical line is mono, a horizontal line is out of phase, a wide cloud is a wide stereo image." />;
}

export default function MasteringMeters({ meters, playing, pre, post, monitor, onMonitorChange, target, onTargetChange, referenceName, referenceBusy, onReferenceFile, onClearReference, onResetMeters, timelineAt, onJump }: Props) {
  const loudness = meters?.loudness;
  const levels = meters?.levels;
  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) onReferenceFile(file);
  };
  const correlation = meters?.correlation ?? 0;

  return <>
    <section className="mastering-panel" aria-labelledby="monitor-heading">
      <div className="mastering-panel-heading"><div><h3 id="monitor-heading">Monitoring</h3><p>Changes what you hear, never the master itself. Switching sources crossfades over 20 ms so comparisons don't pop.</p></div></div>
      <fieldset className="mastering-fieldset mastering-radio-row"><legend>Monitor</legend>
        {([['stereo', 'Stereo'], ['mid', 'Mid only'], ['side', 'Side only'], ['left', 'Left only'], ['right', 'Right only']] as const).map(([value, label]) => <label key={value} className="mastering-check">
          <input type="radio" name="mastering-monitor" checked={monitor.monitor === value} onChange={() => onMonitorChange({ monitor: value })} /> {label}
        </label>)}
      </fieldset>
      <div className="mastering-toggle-row">
        <label className="mastering-check"><input type="checkbox" checked={monitor.mono} onChange={(event) => onMonitorChange({ mono: event.target.checked })} /> Mono check (sum to mono)</label>
        <label className="mastering-check"><input type="checkbox" checked={monitor.matchLoudness} onChange={(event) => onMonitorChange({ matchLoudness: event.target.checked })} /> Match loudness when comparing</label>
      </div>
      <p className="help-text">Loudness matching sets the original and the reference to the processed master's short-term loudness, so you judge tone and dynamics rather than volume.</p>
      <fieldset className="mastering-fieldset">
        <legend>Reference track</legend>
        <p className="help-text">Load a commercial master or a previous version to compare against. It plays from the same position as your project.</p>
        <div className="button-row">
          <label className="mastering-file-button mastering-file-secondary">{referenceBusy ? 'Reading…' : referenceName ? 'Replace reference' : 'Load reference track'}
            <input type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac,.aiff,.aif" disabled={referenceBusy} onChange={onFile} /></label>
          {referenceName && <button type="button" onClick={onClearReference} disabled={referenceBusy}>Remove reference</button>}
        </div>
        {referenceName && <p className="help-text">Reference: {referenceName}. Choose “Reference” on the transport to hear it.</p>}
      </fieldset>
    </section>

    <section className="mastering-panel" aria-labelledby="loudness-heading">
      <div className="mastering-panel-heading"><div><h3 id="loudness-heading">Loudness (ITU-R BS.1770-5, EBU R 128)</h3><p>{playing ? 'Live readings of the processed master.' : 'Play to measure. For full-project rendered PCM measurements, use Render and measure on the Master tab.'}</p></div>
        <button type="button" onClick={onResetMeters}>Reset meters</button></div>
      <p className="help-text">Targets are comparison references, not universal delivery rules. Check the destination's current specification before final delivery.</p>
      <div className="workspace-grid">
        <label className="field"><span className="field-label">Target</span>
          <select value={target} onChange={(event) => onTargetChange(Number(event.target.value))}>
            {LOUDNESS_TARGETS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>
        <div className="field"><span className="field-label">Integrated vs target</span><output className="mastering-readout" aria-label="Integrated loudness versus target">{loudness && Number.isFinite(loudness.integrated) ? `${signed(loudness.integrated - target)} LU` : '—'}</output></div>
      </div>
      <div className="metric-row mastering-meter-row" aria-live="off">
        <div className="metric"><span>Momentary</span><strong>{lufs(loudness?.momentary)} LUFS</strong></div>
        <div className="metric"><span>Short-term</span><strong>{lufs(loudness?.shortTerm)} LUFS</strong></div>
        <div className="metric"><span>Integrated</span><strong aria-label="Integrated loudness">{lufs(loudness?.integrated)} LUFS</strong></div>
        <div className="metric"><span>Loudness range</span><strong>{loudness ? loudness.loudnessRange.toFixed(1) : '—'} LU</strong></div>
        <div className="metric"><span>Max momentary</span><strong>{lufs(loudness?.maxMomentary)} LUFS</strong></div>
        <div className="metric"><span>Max short-term</span><strong>{lufs(loudness?.maxShortTerm)} LUFS</strong></div>
      </div>
    </section>

    <section className="mastering-panel" aria-labelledby="peak-heading">
      <div className="mastering-panel-heading"><div><h3 id="peak-heading">Peaks, RMS, and crest factor</h3><p>True peak uses 4× oversampling (BS.1770-5 Annex 2). RMS and peak cover the last 400 ms; programme values cover everything since the last reset.</p></div></div>
      <div className="mastering-table-scroll" tabIndex={0} role="region" aria-label="Peak and crest measurements">
        <table className="mastering-report">
          <thead><tr><th scope="col">Channel</th><th scope="col">True peak</th><th scope="col">Peak</th><th scope="col">RMS</th><th scope="col">Crest</th><th scope="col">Programme crest</th></tr></thead>
          <tbody>
            {['Left', 'Right'].map((name, index) => <tr key={name}>
              <th scope="row">{name}</th>
              <td>{signed(loudness?.truePeakDb[index])} dBTP</td>
              <td>{signed(levels?.peakDb[index])} dBFS</td>
              <td>{signed(levels?.rmsDb[index])} dBFS</td>
              <td>{levels ? levels.crestDb[index].toFixed(1) : '—'} dB</td>
              <td>{levels ? levels.programCrestDb[index].toFixed(1) : '—'} dB</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="workspace-grid">
        <CommitNumberField label="Log true peaks above (dBTP)" value={monitor.excursionThresholdDb} min={-12} max={3} step={0.1} digits={1}
          onCommit={(value) => onMonitorChange({ excursionThresholdDb: value })}
          onPreview={(value) => onMonitorChange({ excursionThresholdDb: value })} />
        <div className="field"><span className="field-label">Processing latency</span><output className="mastering-readout">{meters ? `${meters.latencyFrames} samples` : '—'}</output></div>
      </div>
      {meters && meters.excursions.length > 0 ? <ol className="mastering-excursions" aria-label="True-peak excursions">
        {meters.excursions.map((event) => {
          const at = timelineAt(event.time);
          return <li key={event.time}><span>{signed(event.truePeakDb)} dBTP{at !== null ? ` at ${formatTime(at)}` : ''}</span>{at !== null && <button type="button" onClick={() => onJump(at)}>Jump</button>}</li>;
        })}
      </ol> : <p className="help-text">No true peaks above {monitor.excursionThresholdDb} dBTP{meters ? ' so far' : ' yet'}.</p>}
    </section>

    <section className="mastering-panel" aria-labelledby="image-heading">
      <div className="mastering-panel-heading"><div><h3 id="image-heading">Stereo image and spectrum</h3><p>Correlation near +1 is mono-safe; below 0 means parts will cancel on mono speakers.</p></div></div>
      <div className="mastering-correlation" role="meter" aria-valuemin={-1} aria-valuemax={1} aria-valuenow={Number(correlation.toFixed(2))} aria-label="Phase correlation" aria-valuetext={`${correlation.toFixed(2)}${correlation < 0 ? ', out of phase' : ''}`}>
        <span className="mastering-correlation-scale">−1</span>
        <span className="mastering-correlation-track"><span className="mastering-correlation-marker" style={{ left: `${(correlation + 1) * 50}%` }} /></span>
        <span className="mastering-correlation-scale">+1</span>
        <output>{correlation.toFixed(2)}</output>
      </div>
      <div className="mastering-image-row">
        <Goniometer points={meters?.goniometer} />
        <SpectrumCanvas pre={pre} post={post} playing={playing} />
      </div>
      {meters && <p className="help-text">Gain reduction: compressor {signed(meters.telemetry.compressorReductionDb)} dB · three-band {meters.telemetry.multibandReductionDb.map((value) => signed(value)).join(' / ')} dB · expander {signed(meters.telemetry.expanderReductionDb)} dB · limiter {signed(meters.telemetry.limiterReductionDb)} dB.</p>}
    </section>
  </>;
}
