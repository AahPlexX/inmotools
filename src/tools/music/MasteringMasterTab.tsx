/**
 * Master tab (ledgers 45–59, 72).
 *
 * Every control edits the document's master settings: moving a control
 * previews live through the realtime worklet, and releasing it commits one
 * undo step. Stage order matches the kernel (see dsp/master-chain.ts) and is
 * shown top to bottom so the page reads like the signal flow.
 */
import { useState, type ReactNode } from 'react';
import {
  EQ_SHAPES,
  shapeHasGain,
  type EqBandSettings,
  type EqRouting,
  type EqShape,
  type MasterSettings,
} from './dsp/master-chain';
import type { Resonance } from './dsp/analysis';
import type { LoudnessReading } from './dsp/loudness';
import ParameterControl, { formatFrequency, logScale } from './MasteringControls';
import MasteringEqGraph from './MasteringEqGraph';
import { formatTime, messageOf, type MasteringPanelContext } from './mastering-ui';

interface Props {
  ctx: MasteringPanelContext;
  master: MasterSettings;
  onPreview: (settings: MasterSettings) => void;
  onCommit: (settings: MasterSettings, status: string) => void;
  /** Preset controls, supplied by the workspace because it owns the browser store. */
  presets?: ReactNode;
}

const clone = (settings: MasterSettings): MasterSettings => JSON.parse(JSON.stringify(settings)) as MasterSettings;
const fmtDb = (value: number, digits = 1) => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(digits)}` : '−∞';

function Stage({ title, enabled, onToggle, disabled, children, summary }: { title: string; enabled?: boolean; onToggle?: (enabled: boolean) => void; disabled: boolean; children: ReactNode; summary: string }) {
  return <details className="mastering-tool mastering-stage" open={enabled}>
    <summary>
      <span className="mastering-tool-title">{title}</span>
      <span className="mastering-tool-summary">{summary}</span>
    </summary>
    <div className="mastering-tool-body">
      {onToggle && <label className="mastering-check"><input type="checkbox" checked={Boolean(enabled)} disabled={disabled} onChange={(event) => onToggle(event.target.checked)} /> {title} on</label>}
      {children}
    </div>
  </details>;
}

export default function MasteringMasterTab({ ctx, master, onPreview, onCommit, presets }: Props) {
  const disabled = !ctx.canEdit;
  const rate = ctx.document.sampleRate ?? 48_000;
  const [analysis, setAnalysis] = useState<{ spectrumDb: Float64Array; binHz: number; resonances: Resonance[]; label: string } | null>(null);
  const [report, setReport] = useState<{ before: LoudnessReading; after: LoudnessReading; seconds: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /** Builds a settings copy with one change applied. */
  const edit = (change: (settings: MasterSettings) => void) => { const next = clone(master); change(next); return next; };
  const control = (change: (settings: MasterSettings, value: number) => void, status: (value: number) => string) => ({
    onPreview: (value: number) => onPreview(edit((settings) => change(settings, value))),
    onCommit: (value: number) => onCommit(edit((settings) => change(settings, value)), status(value)),
  });
  const toggle = (change: (settings: MasterSettings, on: boolean) => void, name: string) => (on: boolean) => onCommit(edit((settings) => change(settings, on)), `${name} ${on ? 'on' : 'off'}.`);
  const band = (index: number, patch: Partial<EqBandSettings>) => edit((settings) => { settings.eq.bands[index] = { ...settings.eq.bands[index], ...patch }; if (patch.enabled || patch.solo) settings.eq.enabled = true; });

  const analyse = async (useSelection: boolean) => {
    if (!ctx.client) return;
    setBusy('Analysing the spectrum…');
    try {
      const range = useSelection && ctx.selection.endSeconds > ctx.selection.startSeconds ? ctx.selection : null;
      const result = await ctx.client.spectrum(range?.startSeconds, range?.endSeconds);
      setAnalysis({ spectrumDb: result.spectrum.db, binHz: result.spectrum.binHz, resonances: result.resonances, label: range ? `${formatTime(range.startSeconds)}–${formatTime(range.endSeconds)}` : 'the whole mix' });
      ctx.setStatus(result.resonances.length ? `Found ${result.resonances.length} resonance${result.resonances.length === 1 ? '' : 's'} in ${range ? 'the selection' : 'the mix'}.` : 'No narrow resonances stand out. The spectrum is drawn behind the EQ curve.');
    } catch (error) { ctx.setStatus(messageOf(error)); }
    finally { setBusy(null); }
  };

  const addResonanceCut = (resonance: Resonance) => {
    const free = master.eq.bands.findIndex((item) => !item.enabled);
    if (free < 0) { ctx.setStatus('All 10 EQ bands are in use. Turn one off to add this cut.'); return; }
    onCommit(band(free, { enabled: true, shape: 'bell', frequency: Math.round(resonance.frequency), gainDb: Number(resonance.suggestedGainDb.toFixed(1)), q: Number(resonance.suggestedQ.toFixed(1)) }),
      `Band ${free + 1}: ${resonance.suggestedGainDb.toFixed(1)} dB cut at ${formatFrequency(resonance.frequency)}.`);
  };

  const measure = async () => {
    if (!ctx.client) return;
    setBusy('Rendering the master offline…');
    try {
      const started = performance.now();
      const before = await ctx.client.measureMix();
      const result = await ctx.client.renderMaster(master);
      setReport({ before, after: result.loudness, seconds: (performance.now() - started) / 1000 });
      ctx.setStatus(`Master rendered offline: ${fmtDb(result.loudness.integrated)} LUFS integrated, ${fmtDb(result.loudness.maxTruePeakDb)} dBTP true peak.`);
    } catch (error) { ctx.setStatus(`Could not render the master: ${messageOf(error)}`); }
    finally { setBusy(null); }
  };

  const eqOnCount = master.eq.bands.filter((item) => item.enabled).length;

  return <>
    <section className="mastering-panel" aria-labelledby="master-heading">
      <div className="mastering-panel-heading"><div>
        <h3 id="master-heading">Master chain</h3>
        <p>Processes the whole mix in this order: input, EQ, expander, compressor, three-band compressor, saturation, stereo, clipper, limiter, output. Press Play to hear changes as you make them. Use Original on the transport to compare.</p>
      </div></div>
      {presets && <details className="mastering-tool">
        <summary><span className="mastering-tool-title">Presets</span> <span className="mastering-tool-summary">Save this chain or start from one you saved</span></summary>
        <div className="mastering-tool-body">{presets}</div>
      </details>}
      <div className="workspace-grid">
        <ParameterControl label="Input gain" unit="dB" value={master.inputGainDb} min={-24} max={24} step={0.1} disabled={disabled} {...control((s, v) => { s.inputGainDb = v; }, (v) => `Input gain ${fmtDb(v)} dB.`)} />
        <ParameterControl label="Output gain" unit="dB" value={master.outputGainDb} min={-24} max={24} step={0.1} disabled={disabled} {...control((s, v) => { s.outputGainDb = v; }, (v) => `Output gain ${fmtDb(v)} dB.`)} />
      </div>
    </section>

    <Stage title="Equalizer" enabled={master.eq.enabled} onToggle={toggle((s, on) => { s.eq.enabled = on; }, 'Equalizer')} disabled={disabled}
      summary={`${eqOnCount} of 10 bands on · ${master.eq.mode === 'linear' ? 'linear phase' : 'minimum phase'}`}>
      <fieldset className="mastering-fieldset mastering-radio-row"><legend>Phase mode</legend>
        <label className="mastering-check"><input type="radio" name="mastering-eq-mode" checked={master.eq.mode === 'minimum'} disabled={disabled} onChange={() => onCommit(edit((s) => { s.eq.mode = 'minimum'; }), 'EQ set to minimum phase.')} /> Minimum phase (no delay)</label>
        <label className="mastering-check"><input type="radio" name="mastering-eq-mode" checked={master.eq.mode === 'linear'} disabled={disabled} onChange={() => onCommit(edit((s) => { s.eq.mode = 'linear'; }), 'EQ set to linear phase. Playback now runs about 85 ms behind; the original is delayed to match.')} /> Linear phase (no phase shift, adds latency)</label>
      </fieldset>
      {master.eq.mode === 'linear' && <p className="help-text">Dynamic bands always run minimum phase, because their gain changes over time.</p>}
      <MasteringEqGraph settings={master} sampleRate={rate} spectrumDb={analysis?.spectrumDb} spectrumBinHz={analysis?.binHz} disabled={disabled} onPreview={onPreview} onCommit={onCommit} />
      <div className="mastering-resonance">
        <div className="button-row">
          <button type="button" disabled={disabled || Boolean(busy)} onClick={() => void analyse(true)}>Find resonances in selection</button>
          <button type="button" disabled={disabled || Boolean(busy)} onClick={() => void analyse(false)}>Find resonances in whole mix</button>
        </div>
        {analysis && (analysis.resonances.length ? <ul className="mastering-resonance-list" aria-label={`Resonances in ${analysis.label}`}>
          {analysis.resonances.map((item) => <li key={item.frequency}>
            <span>{formatFrequency(item.frequency)} · {item.prominenceDb.toFixed(1)} dB above its neighbourhood</span>
            <button type="button" disabled={disabled} onClick={() => addResonanceCut(item)}>Add {item.suggestedGainDb.toFixed(1)} dB cut</button>
          </li>)}
        </ul> : <p className="help-text">No narrow resonances in {analysis.label}.</p>)}
      </div>
      <div className="mastering-band-list">
        {master.eq.bands.map((item, index) => <details key={index} className="mastering-band-row" open={item.enabled && index === master.eq.bands.findIndex((candidate) => candidate.enabled)}>
          <summary>
            <span className="mastering-tool-title">Band {index + 1}</span>
            <span className="mastering-tool-summary">{item.enabled ? `${EQ_SHAPES.find((shape) => shape.value === item.shape)?.label} · ${formatFrequency(item.frequency)}${shapeHasGain(item.shape) ? ` · ${fmtDb(item.gainDb)} dB` : ''}${item.routing !== 'stereo' ? ` · ${item.routing}` : ''}${item.dynamic.enabled && shapeHasGain(item.shape) ? ' · dynamic' : ''}${item.solo ? ' · solo' : ''}` : 'Off'}</span>
          </summary>
          <div className="mastering-tool-body">
            <div className="mastering-toggle-row">
              <label className="mastering-check"><input type="checkbox" checked={item.enabled} disabled={disabled} onChange={(event) => onCommit(band(index, { enabled: event.target.checked }), `Band ${index + 1} ${event.target.checked ? 'on' : 'off'}.`)} /> Band {index + 1} on</label>
              <button type="button" aria-pressed={item.solo} disabled={disabled || !item.enabled} onClick={() => onCommit(band(index, { solo: !item.solo }), `Band ${index + 1} solo ${item.solo ? 'off' : 'on'}. ${item.solo ? '' : 'You now hear only what this band touches.'}`)}>Solo band {index + 1}</button>
            </div>
            <div className="workspace-grid">
              <label className="field"><span className="field-label">Shape</span>
                <select value={item.shape} disabled={disabled} onChange={(event) => onCommit(band(index, { shape: event.target.value as EqShape }), `Band ${index + 1} shape: ${EQ_SHAPES.find((shape) => shape.value === event.target.value)?.label}.`)}>
                  {EQ_SHAPES.map((shape) => <option key={shape.value} value={shape.value}>{shape.label}</option>)}
                </select></label>
              <label className="field"><span className="field-label">Applies to</span>
                <select value={item.routing} disabled={disabled} onChange={(event) => onCommit(band(index, { routing: event.target.value as EqRouting }), `Band ${index + 1} now affects ${event.target.value === 'stereo' ? 'both channels' : `the ${event.target.value} only`}.`)}>
                  <option value="stereo">Stereo (left and right)</option>
                  <option value="mid">Mid only (centre)</option>
                  <option value="side">Side only (edges)</option>
                </select></label>
            </div>
            <ParameterControl label={`Band ${index + 1} frequency`} unit="Hz" value={item.frequency} min={20} max={20_000} step={1} scale={logScale(20, 20_000)} describe={formatFrequency} disabled={disabled}
              {...control((s, v) => { s.eq.bands[index].frequency = v; }, (v) => `Band ${index + 1} at ${formatFrequency(v)}.`)} />
            {shapeHasGain(item.shape) && <ParameterControl label={`Band ${index + 1} gain`} unit="dB" value={item.gainDb} min={-24} max={24} step={0.1} disabled={disabled}
              {...control((s, v) => { s.eq.bands[index].gainDb = v; }, (v) => `Band ${index + 1} gain ${fmtDb(v)} dB.`)} />}
            <ParameterControl label={`Band ${index + 1} Q`} value={item.q} min={0.1} max={40} step={0.01} scale={logScale(0.1, 40)} describe={(v) => `Q ${v.toFixed(2)}`} disabled={disabled}
              {...control((s, v) => { s.eq.bands[index].q = v; }, (v) => `Band ${index + 1} Q ${v.toFixed(2)}.`)} />
            {shapeHasGain(item.shape) && <fieldset className="mastering-fieldset">
              <legend>Dynamic band</legend>
              <label className="mastering-check"><input type="checkbox" checked={item.dynamic.enabled} disabled={disabled} onChange={(event) => onCommit(edit((s) => { s.eq.bands[index].dynamic.enabled = event.target.checked; }), `Band ${index + 1} dynamics ${event.target.checked ? 'on' : 'off'}.`)} /> Change this band's gain with the level at its frequency</label>
              {item.dynamic.enabled && <>
                <ParameterControl label={`Band ${index + 1} dynamic threshold`} unit="dB" value={item.dynamic.thresholdDb} min={-80} max={0} step={0.5} disabled={disabled} {...control((s, v) => { s.eq.bands[index].dynamic.thresholdDb = v; }, (v) => `Dynamic threshold ${v} dB.`)} />
                <ParameterControl label={`Band ${index + 1} dynamic ratio`} value={item.dynamic.ratio} min={1} max={20} step={0.1} describe={(v) => `${v}:1`} disabled={disabled} {...control((s, v) => { s.eq.bands[index].dynamic.ratio = v; }, (v) => `Dynamic ratio ${v}:1.`)} />
                <ParameterControl label={`Band ${index + 1} dynamic range`} unit="dB" value={item.dynamic.rangeDb} min={-24} max={24} step={0.5} describe={(v) => `${v < 0 ? 'cut' : 'boost'} up to ${Math.abs(v)} dB`} disabled={disabled} {...control((s, v) => { s.eq.bands[index].dynamic.rangeDb = v; }, (v) => `Dynamic range ${fmtDb(v)} dB (${v < 0 ? 'cuts when loud' : 'boosts when loud'}).`)} />
                <ParameterControl label={`Band ${index + 1} dynamic attack`} unit="ms" value={item.dynamic.attackMs} min={0.1} max={500} step={0.1} disabled={disabled} {...control((s, v) => { s.eq.bands[index].dynamic.attackMs = v; }, (v) => `Dynamic attack ${v} ms.`)} />
                <ParameterControl label={`Band ${index + 1} dynamic release`} unit="ms" value={item.dynamic.releaseMs} min={5} max={5000} step={1} disabled={disabled} {...control((s, v) => { s.eq.bands[index].dynamic.releaseMs = v; }, (v) => `Dynamic release ${v} ms.`)} />
              </>}
            </fieldset>}
          </div>
        </details>)}
      </div>
    </Stage>

    <Stage title="Expander / gate" enabled={master.expander.enabled} onToggle={toggle((s, on) => { s.expander.enabled = on; }, 'Expander')} disabled={disabled} summary="Pushes quiet noise down between phrases">
      <ParameterControl label="Expander threshold" unit="dB" value={master.expander.thresholdDb} min={-90} max={0} step={0.5} disabled={disabled} {...control((s, v) => { s.expander.thresholdDb = v; }, (v) => `Expander threshold ${v} dB.`)} />
      <ParameterControl label="Expander ratio" value={master.expander.ratio} min={1} max={10} step={0.1} describe={(v) => `1:${v}`} disabled={disabled} {...control((s, v) => { s.expander.ratio = v; }, (v) => `Expander ratio 1:${v}.`)} />
      <ParameterControl label="Expander range" unit="dB" value={master.expander.rangeDb} min={1} max={60} step={1} disabled={disabled} {...control((s, v) => { s.expander.rangeDb = v; }, (v) => `Expander range ${v} dB.`)} />
      <ParameterControl label="Expander attack" unit="ms" value={master.expander.attackMs} min={0.1} max={200} step={0.1} disabled={disabled} {...control((s, v) => { s.expander.attackMs = v; }, (v) => `Expander attack ${v} ms.`)} />
      <ParameterControl label="Expander release" unit="ms" value={master.expander.releaseMs} min={5} max={3000} step={1} disabled={disabled} {...control((s, v) => { s.expander.releaseMs = v; }, (v) => `Expander release ${v} ms.`)} />
    </Stage>

    <Stage title="Compressor" enabled={master.compressor.enabled} onToggle={toggle((s, on) => { s.compressor.enabled = on; }, 'Compressor')} disabled={disabled} summary={`${master.compressor.ratio}:1 above ${master.compressor.thresholdDb} dB`}>
      <ParameterControl label="Compressor threshold" unit="dB" value={master.compressor.thresholdDb} min={-60} max={0} step={0.5} disabled={disabled} {...control((s, v) => { s.compressor.thresholdDb = v; }, (v) => `Compressor threshold ${v} dB.`)} />
      <ParameterControl label="Compressor ratio" value={master.compressor.ratio} min={1} max={20} step={0.1} describe={(v) => `${v}:1`} disabled={disabled} {...control((s, v) => { s.compressor.ratio = v; }, (v) => `Compressor ratio ${v}:1.`)} />
      <ParameterControl label="Compressor knee" unit="dB" value={master.compressor.kneeDb} min={0} max={24} step={0.5} disabled={disabled} {...control((s, v) => { s.compressor.kneeDb = v; }, (v) => `Compressor knee ${v} dB.`)} />
      <ParameterControl label="Compressor attack" unit="ms" value={master.compressor.attackMs} min={0.1} max={500} step={0.1} disabled={disabled} {...control((s, v) => { s.compressor.attackMs = v; }, (v) => `Compressor attack ${v} ms.`)} />
      <ParameterControl label="Compressor release" unit="ms" value={master.compressor.releaseMs} min={5} max={5000} step={1} disabled={disabled} {...control((s, v) => { s.compressor.releaseMs = v; }, (v) => `Compressor release ${v} ms.`)} />
      <ParameterControl label="Compressor makeup gain" unit="dB" value={master.compressor.makeupDb} min={-12} max={24} step={0.1} disabled={disabled} {...control((s, v) => { s.compressor.makeupDb = v; }, (v) => `Compressor makeup ${fmtDb(v)} dB.`)} />
    </Stage>

    <Stage title="Three-band compressor" enabled={master.multiband.enabled} onToggle={toggle((s, on) => { s.multiband.enabled = on; }, 'Three-band compressor')} disabled={disabled}
      summary={`Splits at ${formatFrequency(master.multiband.lowCrossover)} and ${formatFrequency(master.multiband.highCrossover)}`}>
      <ParameterControl label="Low/mid crossover" unit="Hz" value={master.multiband.lowCrossover} min={40} max={2000} step={1} scale={logScale(40, 2000)} describe={formatFrequency} disabled={disabled} {...control((s, v) => { s.multiband.lowCrossover = v; }, (v) => `Low/mid crossover ${formatFrequency(v)}.`)} />
      <ParameterControl label="Mid/high crossover" unit="Hz" value={master.multiband.highCrossover} min={300} max={16_000} step={1} scale={logScale(300, 16_000)} describe={formatFrequency} disabled={disabled} {...control((s, v) => { s.multiband.highCrossover = v; }, (v) => `Mid/high crossover ${formatFrequency(v)}.`)} />
      {(['Low', 'Mid', 'High'] as const).map((name, index) => <fieldset key={name} className="mastering-fieldset">
        <legend>{name} band</legend>
        <ParameterControl label={`${name} band threshold`} unit="dB" value={master.multiband.bands[index].thresholdDb} min={-60} max={0} step={0.5} disabled={disabled} {...control((s, v) => { s.multiband.bands[index].thresholdDb = v; }, (v) => `${name} band threshold ${v} dB.`)} />
        <ParameterControl label={`${name} band ratio`} value={master.multiband.bands[index].ratio} min={1} max={20} step={0.1} describe={(v) => `${v}:1`} disabled={disabled} {...control((s, v) => { s.multiband.bands[index].ratio = v; }, (v) => `${name} band ratio ${v}:1.`)} />
        <ParameterControl label={`${name} band attack`} unit="ms" value={master.multiband.bands[index].attackMs} min={0.1} max={500} step={0.1} disabled={disabled} {...control((s, v) => { s.multiband.bands[index].attackMs = v; }, (v) => `${name} band attack ${v} ms.`)} />
        <ParameterControl label={`${name} band release`} unit="ms" value={master.multiband.bands[index].releaseMs} min={5} max={5000} step={1} disabled={disabled} {...control((s, v) => { s.multiband.bands[index].releaseMs = v; }, (v) => `${name} band release ${v} ms.`)} />
        <ParameterControl label={`${name} band makeup`} unit="dB" value={master.multiband.bands[index].makeupDb} min={-12} max={24} step={0.1} disabled={disabled} {...control((s, v) => { s.multiband.bands[index].makeupDb = v; }, (v) => `${name} band makeup ${fmtDb(v)} dB.`)} />
      </fieldset>)}
    </Stage>

    <Stage title="Saturation" enabled={master.saturation.enabled} onToggle={toggle((s, on) => { s.saturation.enabled = on; }, 'Saturation')} disabled={disabled} summary={`${master.saturation.mode === 'tube' ? 'Tube' : 'Tape'} · ${Math.round(master.saturation.mix * 100)}% mix`}>
      <fieldset className="mastering-fieldset mastering-radio-row"><legend>Character</legend>
        <label className="mastering-check"><input type="radio" name="mastering-saturation" checked={master.saturation.mode === 'tape'} disabled={disabled} onChange={() => onCommit(edit((s) => { s.saturation.mode = 'tape'; }), 'Saturation set to tape.')} /> Tape (smooth, odd harmonics)</label>
        <label className="mastering-check"><input type="radio" name="mastering-saturation" checked={master.saturation.mode === 'tube'} disabled={disabled} onChange={() => onCommit(edit((s) => { s.saturation.mode = 'tube'; }), 'Saturation set to tube.')} /> Tube (warm, adds even harmonics)</label>
      </fieldset>
      <ParameterControl label="Drive" unit="dB" value={master.saturation.driveDb} min={0} max={36} step={0.5} disabled={disabled} {...control((s, v) => { s.saturation.driveDb = v; }, (v) => `Drive ${v} dB.`)} />
      <ParameterControl label="Saturation mix" unit="%" value={Math.round(master.saturation.mix * 100)} min={0} max={100} step={1} disabled={disabled} {...control((s, v) => { s.saturation.mix = v / 100; }, (v) => `Saturation mix ${v}%.`)} />
      <ParameterControl label="Saturation output trim" unit="dB" value={master.saturation.outputDb} min={-24} max={12} step={0.1} disabled={disabled} {...control((s, v) => { s.saturation.outputDb = v; }, (v) => `Saturation trim ${fmtDb(v)} dB.`)} />
    </Stage>

    <Stage title="Stereo" summary={`Width ${Math.round(master.stereo.width * 100)}%${master.stereo.bassMono ? ` · bass mono below ${formatFrequency(master.stereo.bassMonoHz)}` : ''}`} enabled={master.stereo.width !== 1 || master.stereo.bassMono} disabled={disabled}>
      <ParameterControl label="Stereo width" unit="%" value={Math.round(master.stereo.width * 100)} min={0} max={200} step={1} describe={(v) => v === 0 ? 'mono' : `${v}%`} disabled={disabled} {...control((s, v) => { s.stereo.width = v / 100; }, (v) => `Stereo width ${v}%.`)} />
      <label className="mastering-check"><input type="checkbox" checked={master.stereo.bassMono} disabled={disabled} onChange={(event) => onCommit(edit((s) => { s.stereo.bassMono = event.target.checked; }), `Bass mono ${event.target.checked ? 'on' : 'off'}.`)} /> Make the bass mono</label>
      <ParameterControl label="Bass mono below" unit="Hz" value={master.stereo.bassMonoHz} min={20} max={500} step={1} scale={logScale(20, 500)} describe={formatFrequency} disabled={disabled || !master.stereo.bassMono} {...control((s, v) => { s.stereo.bassMonoHz = v; }, (v) => `Bass mono below ${formatFrequency(v)}.`)} />
    </Stage>

    <Stage title="Soft clipper" enabled={master.clipper.enabled} onToggle={toggle((s, on) => { s.clipper.enabled = on; }, 'Soft clipper')} disabled={disabled} summary={`Ceiling ${master.clipper.ceilingDb} dBFS · ${master.clipper.oversampling}× oversampling`}>
      <ParameterControl label="Clipper ceiling" unit="dBFS" value={master.clipper.ceilingDb} min={-24} max={0} step={0.1} disabled={disabled} {...control((s, v) => { s.clipper.ceilingDb = v; }, (v) => `Clipper ceiling ${v} dBFS.`)} />
      <label className="field"><span className="field-label">Oversampling</span>
        <select value={master.clipper.oversampling} disabled={disabled} onChange={(event) => onCommit(edit((s) => { s.clipper.oversampling = Number(event.target.value) as 1 | 2 | 4; }), `Clipper oversampling ${event.target.value}×.`)}>
          <option value={1}>Off (1×)</option><option value={2}>2×</option><option value={4}>4× (least aliasing)</option>
        </select></label>
    </Stage>

    <Stage title="True-peak limiter" enabled={master.limiter.enabled} onToggle={toggle((s, on) => { s.limiter.enabled = on; }, 'Limiter')} disabled={disabled} summary={`Ceiling ${master.limiter.ceilingDb} dBTP`}>
      <p className="help-text">Watches peaks between samples using 4× oversampling as BS.1770-5 describes. It controls the pre-export true peak; sample-rate conversion and lossy encoding can still move decoded peaks slightly. −1 dBTP is a common delivery ceiling, but requirements vary.</p>
      <ParameterControl label="Limiter ceiling" unit="dBTP" value={master.limiter.ceilingDb} min={-24} max={0} step={0.1} disabled={disabled} {...control((s, v) => { s.limiter.ceilingDb = v; }, (v) => `Limiter ceiling ${v} dBTP.`)} />
      <ParameterControl label="Lookahead" unit="ms" value={master.limiter.lookaheadMs} min={0.5} max={10} step={0.1} disabled={disabled} {...control((s, v) => { s.limiter.lookaheadMs = v; }, (v) => `Lookahead ${v} ms.`)} />
      <ParameterControl label="Limiter release" unit="ms" value={master.limiter.releaseMs} min={1} max={2000} step={1} disabled={disabled} {...control((s, v) => { s.limiter.releaseMs = v; }, (v) => `Limiter release ${v} ms.`)} />
    </Stage>

    <section className="mastering-panel" aria-labelledby="render-heading">
      <div className="mastering-panel-heading"><div><h3 id="render-heading">Render and measure</h3><p>Runs the same master chain used by export at the project sample rate and measures that rendered PCM. Export-rate conversion or lossy encoding happens later.</p></div></div>
      <div className="button-row"><button type="button" disabled={disabled || Boolean(busy)} onClick={() => void measure()}>Render and measure master</button>{busy && <span className="mastering-busy" role="status">{busy}</span>}</div>
      {report && <div className="mastering-table-scroll" tabIndex={0} role="region" aria-label="Before and after master measurements">
        <table className="mastering-report">
          <caption>Mix before and after the master chain (rendered in {report.seconds.toFixed(1)} s)</caption>
          <thead><tr><th scope="col">Measure</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
          <tbody>
            <tr><th scope="row">Integrated loudness</th><td>{fmtDb(report.before.integrated)} LUFS</td><td>{fmtDb(report.after.integrated)} LUFS</td></tr>
            <tr><th scope="row">Loudness range</th><td>{report.before.loudnessRange.toFixed(1)} LU</td><td>{report.after.loudnessRange.toFixed(1)} LU</td></tr>
            <tr><th scope="row">Max true peak</th><td>{fmtDb(report.before.maxTruePeakDb)} dBTP</td><td>{fmtDb(report.after.maxTruePeakDb)} dBTP</td></tr>
            <tr><th scope="row">Max momentary</th><td>{fmtDb(report.before.maxMomentary)} LUFS</td><td>{fmtDb(report.after.maxMomentary)} LUFS</td></tr>
            <tr><th scope="row">Max short-term</th><td>{fmtDb(report.before.maxShortTerm)} LUFS</td><td>{fmtDb(report.after.maxShortTerm)} LUFS</td></tr>
          </tbody>
        </table>
      </div>}
    </section>
  </>;
}
