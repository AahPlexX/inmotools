/**
 * Repair tab: noise reduction and restoration (ledgers 33–44), room-tone fill
 * (32), and the sample pen (19).
 *
 * One "Apply to" choice sets the scope for every range-capable processor:
 * the current selection (blended in and out over 5 ms) or the whole selected
 * clip. Each tool sits in a collapsible section so the tab stays scannable on
 * small screens; every action is one undoable clip edit.
 */
import { useState, type ReactNode } from 'react';
import type { TimeSelection } from './mastering-engine';
import MasteringSamplePen from './MasteringSamplePen';
import { SPECTRAL_FRAME } from './dsp/spectral';
import { formatTime, newSeed, type MasteringPanelContext } from './mastering-ui';

function Tool({ title, summary, children, open = false }: { title: string; summary: string; children: ReactNode; open?: boolean }) {
  return <details className="mastering-tool" open={open}>
    <summary><span className="mastering-tool-title">{title}</span><span className="mastering-tool-summary">{summary}</span></summary>
    <div className="mastering-tool-body">{children}</div>
  </details>;
}

function NumberInput({ id, label, value, onChange, min, max, step, disabled }: { id: string; label: string; value: number; onChange: (value: number) => void; min: number; max: number; step: number; disabled: boolean }) {
  return <div className="field"><label htmlFor={id}>{label}</label>
    <input id={id} type="number" min={min} max={max} step={step} value={value} disabled={disabled}
      onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next); }}
      onBlur={() => onChange(Math.min(max, Math.max(min, value)))} /></div>;
}

export default function MasteringRepairTab({ ctx }: { ctx: MasteringPanelContext }) {
  const { clip, clipStart, clipEnd, selection, canEdit } = ctx;
  const [scope, setScope] = useState<'selection' | 'clip'>('clip');
  const [roomTone, setRoomTone] = useState<{ clipId: string; startSeconds: number; endSeconds: number } | null>(null);
  const [noise, setNoise] = useState<{ clipId: string; startSeconds: number; endSeconds: number } | null>(null);
  const [reduction, setReduction] = useState(12);
  const [smoothing, setSmoothing] = useState(60);
  const [humBase, setHumBase] = useState<50 | 60>(60);
  const [harmonics, setHarmonics] = useState(8);
  const [clickSensitivity, setClickSensitivity] = useState(50);
  const [clickLength, setClickLength] = useState(1.5);
  const [crackle, setCrackle] = useState(70);
  const [plosiveCutoff, setPlosiveCutoff] = useState(150);
  const [plosiveSensitivity, setPlosiveSensitivity] = useState(8);
  const [plosiveReduction, setPlosiveReduction] = useState(12);
  const [essFrequency, setEssFrequency] = useState(6500);
  const [essThreshold, setEssThreshold] = useState(-28);
  const [essRange, setEssRange] = useState(8);
  const [hissLow, setHissLow] = useState(2000);
  const [hissHigh, setHissHigh] = useState(7000);
  const [hissThresholds, setHissThresholds] = useState([-55, -60, -62]);
  const [hissReleases, setHissReleases] = useState([150, 120, 100]);
  const [hissRange, setHissRange] = useState(18);
  const [clipLevel, setClipLevel] = useState(98);
  const [bandLow, setBandLow] = useState(2000);
  const [bandHigh, setBandHigh] = useState(4000);
  const [bandReduction, setBandReduction] = useState(18);

  const hasSelection = selection.endSeconds > selection.startSeconds;
  const selectionInsideClip = Boolean(clip) && hasSelection && selection.startSeconds >= clipStart - 1e-9 && selection.endSeconds <= clipEnd + 1e-9;
  const overlapsClip = Boolean(clip) && hasSelection && selection.startSeconds < clipEnd && selection.endSeconds > clipStart;
  const range: TimeSelection | undefined = scope === 'selection' ? { ...selection } : undefined;
  const scopeReady = canEdit && Boolean(clip) && (scope === 'clip' || overlapsClip);
  const scopeLabel = scope === 'selection' ? `${formatTime(selection.startSeconds)}–${formatTime(selection.endSeconds)}` : `all of ${clip?.name ?? 'the clip'}`;
  const valid = (capture: typeof noise) => Boolean(capture && clip && capture.clipId === clip.id && capture.startSeconds >= clipStart - 1e-9 && capture.endSeconds <= clipEnd + 1e-9);
  const captureFrom = (label: string, set: (value: typeof noise) => void, minimum: number) => {
    if (!clip || !selectionInsideClip || selection.endSeconds - selection.startSeconds < minimum) {
      ctx.setStatus(`Select at least ${Math.round(minimum * 1000)} ms inside the selected clip first.`);
      return;
    }
    set({ clipId: clip.id, startSeconds: selection.startSeconds, endSeconds: selection.endSeconds });
    ctx.setStatus(`Captured ${(selection.endSeconds - selection.startSeconds).toFixed(2)} s as ${label}.`);
  };

  return <>
    <fieldset className="mastering-fieldset mastering-radio-row mastering-scope">
      <legend>Apply repairs to</legend>
      <label className="mastering-check"><input type="radio" name="mastering-repair-scope" checked={scope === 'clip'} onChange={() => setScope('clip')} disabled={!canEdit} /> Whole selected clip</label>
      <label className="mastering-check"><input type="radio" name="mastering-repair-scope" checked={scope === 'selection'} onChange={() => setScope('selection')} disabled={!canEdit} /> Selection only{hasSelection ? ` (${formatTime(selection.startSeconds)}–${formatTime(selection.endSeconds)})` : ''}</label>
    </fieldset>
    {scope === 'selection' && !overlapsClip && <p className="help-text">Select part of the waveform inside the selected clip to repair only that part.</p>}

    <section className="mastering-panel" aria-labelledby="restoration-heading">
      <div className="mastering-panel-heading"><div><h3 id="restoration-heading">Noise & restoration</h3><p>Start gentle and listen. Every repair can be undone, and stacking two light passes usually sounds better than one heavy one.</p></div></div>

      <Tool title="Noise reduction" summary="Broadband hiss, fan, and room noise" open>
        <ol className="mastering-steps">
          <li>Select half a second or more where only the noise plays, and capture it as the noise fingerprint.</li>
          <li>Choose how far to lower the noise, then reduce it.</li>
        </ol>
        <div className="field"><span className="field-label">Noise fingerprint</span><output className="mastering-readout">{valid(noise) && noise ? `${formatTime(noise.startSeconds)}–${formatTime(noise.endSeconds)}` : 'Not captured for this clip'}</output></div>
        <div className="workspace-grid">
          <NumberInput id="mastering-denoise-reduction" label="Reduction (dB, 3–40)" value={reduction} onChange={setReduction} min={3} max={40} step={1} disabled={!canEdit} />
          <NumberInput id="mastering-denoise-smoothing" label="Smoothing (%, 0–100)" value={smoothing} onChange={setSmoothing} min={0} max={100} step={5} disabled={!canEdit} />
        </div>
        <div className="button-row">
          <button type="button" disabled={!canEdit || !selectionInsideClip} onClick={() => captureFrom('the noise fingerprint', setNoise, Math.max(0.05, 1.25 * SPECTRAL_FRAME / (ctx.document.sampleRate ?? 48_000)))}>Capture noise fingerprint</button>
          <button type="button" disabled={!scopeReady || !valid(noise)} onClick={() => noise && ctx.applyEdit({ type: 'denoise', noiseStartSeconds: noise.startSeconds, noiseEndSeconds: noise.endSeconds, reductionDb: reduction, smoothing: smoothing / 100, range }, `Reduced noise by up to ${reduction} dB on ${scopeLabel}. Undo is available.`)}>Reduce noise</button>
        </div>
      </Tool>

      <Tool title="Hum removal" summary="50/60 Hz mains hum and its harmonics">
        <fieldset className="mastering-fieldset mastering-radio-row"><legend>Mains frequency</legend>
          {([50, 60] as const).map((value) => <label key={value} className="mastering-check"><input type="radio" name="mastering-hum" checked={humBase === value} onChange={() => setHumBase(value)} disabled={!canEdit} /> {value} Hz{value === 50 ? ' (Europe, Asia, Africa, Oceania)' : ' (Americas, parts of Asia)'}</label>)}
        </fieldset>
        <NumberInput id="mastering-hum-harmonics" label="Harmonics to remove (1–20)" value={harmonics} onChange={(value) => setHarmonics(Math.round(value))} min={1} max={20} step={1} disabled={!canEdit} />
        <div className="button-row"><button type="button" disabled={!scopeReady} onClick={() => ctx.applyEdit({ type: 'dehum', fundamental: humBase, harmonics, range }, `Removed ${humBase} Hz hum and ${harmonics - 1} harmonic${harmonics === 2 ? '' : 's'} on ${scopeLabel}. Undo is available.`)}>Remove hum</button></div>
      </Tool>

      <Tool title="Click removal" summary="Vinyl clicks, digital ticks, lip smacks">
        <div className="workspace-grid">
          <NumberInput id="mastering-click-sensitivity" label="Sensitivity (0–100)" value={clickSensitivity} onChange={setClickSensitivity} min={0} max={100} step={5} disabled={!canEdit} />
          <NumberInput id="mastering-click-length" label="Longest click (ms, 0.1–5)" value={clickLength} onChange={setClickLength} min={0.1} max={5} step={0.1} disabled={!canEdit} />
        </div>
        <div className="button-row"><button type="button" disabled={!scopeReady} onClick={() => ctx.applyEdit({ type: 'declick', sensitivity: clickSensitivity, maxClickMs: clickLength, range }, `Removed clicks on ${scopeLabel}. Undo is available.`)}>Remove clicks</button></div>
      </Tool>

      <Tool title="Crackle reduction" summary="Dense surface crackle and fine ticks">
        <NumberInput id="mastering-crackle" label="Amount (%, 0–100)" value={crackle} onChange={setCrackle} min={0} max={100} step={5} disabled={!canEdit} />
        <div className="button-row"><button type="button" disabled={!scopeReady} onClick={() => ctx.applyEdit({ type: 'decrackle', amount: crackle / 100, range }, `Reduced crackle on ${scopeLabel}. Undo is available.`)}>Reduce crackle</button></div>
      </Tool>

      <Tool title="Plosive control" summary="P-pops and low mouth thumps">
        <div className="workspace-grid three">
          <NumberInput id="mastering-plosive-cutoff" label="Below (Hz, 60–300)" value={plosiveCutoff} onChange={setPlosiveCutoff} min={60} max={300} step={5} disabled={!canEdit} />
          <NumberInput id="mastering-plosive-sensitivity" label="Trigger rise (dB, 3–20)" value={plosiveSensitivity} onChange={setPlosiveSensitivity} min={3} max={20} step={1} disabled={!canEdit} />
          <NumberInput id="mastering-plosive-reduction" label="Max reduction (dB, 3–24)" value={plosiveReduction} onChange={setPlosiveReduction} min={3} max={24} step={1} disabled={!canEdit} />
        </div>
        <div className="button-row"><button type="button" disabled={!scopeReady} onClick={() => ctx.applyEdit({ type: 'deplosive', cutoffHz: plosiveCutoff, sensitivityDb: plosiveSensitivity, reductionDb: plosiveReduction, range }, `Softened plosives below ${plosiveCutoff} Hz on ${scopeLabel}. Undo is available.`)}>Soften plosives</button></div>
      </Tool>

      <Tool title="De-esser" summary="Harsh S, SH, and T sounds">
        <div className="workspace-grid three">
          <NumberInput id="mastering-ess-frequency" label="Listen at (Hz, 3000–12000)" value={essFrequency} onChange={setEssFrequency} min={3000} max={12_000} step={100} disabled={!canEdit} />
          <NumberInput id="mastering-ess-threshold" label="Threshold (dB, −60–0)" value={essThreshold} onChange={setEssThreshold} min={-60} max={0} step={1} disabled={!canEdit} />
          <NumberInput id="mastering-ess-range" label="Max reduction (dB, 1–20)" value={essRange} onChange={setEssRange} min={1} max={20} step={1} disabled={!canEdit} />
        </div>
        <div className="button-row"><button type="button" disabled={!scopeReady} onClick={() => ctx.applyEdit({ type: 'deess', frequencyHz: essFrequency, thresholdDb: essThreshold, rangeDb: essRange, range }, `De-essed around ${essFrequency} Hz on ${scopeLabel}. Undo is available.`)}>De-ess</button></div>
      </Tool>

      <Tool title="Hiss gate" summary="Lowers hiss between phrases, per band">
        <div className="workspace-grid">
          <NumberInput id="mastering-hiss-low" label="Low/mid split (Hz)" value={hissLow} onChange={setHissLow} min={200} max={5000} step={50} disabled={!canEdit} />
          <NumberInput id="mastering-hiss-high" label="Mid/high split (Hz)" value={hissHigh} onChange={setHissHigh} min={1000} max={16_000} step={100} disabled={!canEdit} />
        </div>
        <div className="workspace-grid three">
          {['Low', 'Mid', 'High'].map((band, index) => <div key={band} className="mastering-band">
            <NumberInput id={`mastering-hiss-threshold-${index}`} label={`${band} threshold (dB)`} value={hissThresholds[index]} onChange={(value) => setHissThresholds((current) => current.map((item, position) => position === index ? value : item))} min={-90} max={-10} step={1} disabled={!canEdit} />
            <NumberInput id={`mastering-hiss-release-${index}`} label={`${band} release (ms)`} value={hissReleases[index]} onChange={(value) => setHissReleases((current) => current.map((item, position) => position === index ? value : item))} min={10} max={1000} step={10} disabled={!canEdit} />
          </div>)}
        </div>
        <NumberInput id="mastering-hiss-range" label="Max reduction (dB, 3–40)" value={hissRange} onChange={setHissRange} min={3} max={40} step={1} disabled={!canEdit} />
        <div className="button-row"><button type="button" disabled={!scopeReady || hissLow >= hissHigh} onClick={() => ctx.applyEdit({ type: 'hissGate', lowCrossover: hissLow, highCrossover: hissHigh, bands: [0, 1, 2].map((index) => ({ thresholdDb: hissThresholds[index], releaseMs: hissReleases[index] })), rangeDb: hissRange, range }, `Gated hiss on ${scopeLabel}. Undo is available.`)}>Gate hiss</button></div>
        {hissLow >= hissHigh && <p className="help-text">The low/mid split must be below the mid/high split.</p>}
      </Tool>

      <Tool title="De-clip" summary="Rebuild flattened peaks from an overloaded recording">
        <NumberInput id="mastering-declip-level" label="Clip level (% of peak, 80–100)" value={clipLevel} onChange={setClipLevel} min={80} max={100} step={0.5} disabled={!canEdit} />
        <p className="help-text">Rebuilt peaks can go above 0 dBFS. Lower the gain or use the limiter before export.</p>
        <div className="button-row"><button type="button" disabled={!scopeReady} onClick={() => ctx.applyEdit({ type: 'declip', levelPercent: clipLevel, range }, `Rebuilt clipped peaks on ${scopeLabel}. Undo is available.`)}>De-clip</button></div>
      </Tool>

      <Tool title="Burst repair" summary="Rebuild a short damaged span you select">
        <p className="help-text">Select up to 200 ms of dropout, glitch, or distortion inside the clip. The gap is rebuilt from the audio on both sides.</p>
        <div className="button-row"><button type="button" disabled={!canEdit || !selectionInsideClip || selection.endSeconds - selection.startSeconds > 0.2}
          onClick={() => ctx.applyEdit({ type: 'repairBurst', startSeconds: selection.startSeconds, endSeconds: selection.endSeconds }, `Rebuilt ${formatTime(selection.startSeconds)}–${formatTime(selection.endSeconds)} from its surroundings. Undo is available.`)}>Rebuild selection</button></div>
        {selectionInsideClip && selection.endSeconds - selection.startSeconds > 0.2 && <p className="help-text">The selection is longer than 200 ms. Shorten it, or use Room tone fill for long gaps.</p>}
      </Tool>

      <Tool title="Frequency band repair" summary="Attenuate or heal a frequency band in the selection">
        <p className="help-text">Targets one band inside the current selection, such as a phone ring, squeak, or whistle. You can also paint regions on the spectrogram.</p>
        <div className="workspace-grid three">
          <NumberInput id="mastering-band-low" label="Low edge (Hz)" value={bandLow} onChange={setBandLow} min={0} max={24_000} step={10} disabled={!canEdit} />
          <NumberInput id="mastering-band-high" label="High edge (Hz)" value={bandHigh} onChange={setBandHigh} min={10} max={24_000} step={10} disabled={!canEdit} />
          <NumberInput id="mastering-band-reduction" label="Attenuation (dB, 1–60)" value={bandReduction} onChange={setBandReduction} min={1} max={60} step={1} disabled={!canEdit} />
        </div>
        <div className="button-row">
          <button type="button" disabled={!canEdit || !overlapsClip || bandHigh <= bandLow}
            onClick={() => ctx.applyEdit({ type: 'spectralAttenuate', regions: [{ startSeconds: selection.startSeconds, endSeconds: selection.endSeconds, lowHz: bandLow, highHz: bandHigh }], reductionDb: bandReduction }, `Lowered ${bandLow}–${bandHigh} Hz by ${bandReduction} dB in the selection. Undo is available.`)}>Attenuate band</button>
          <button type="button" disabled={!canEdit || !overlapsClip || bandHigh <= bandLow}
            onClick={() => ctx.applyEdit({ type: 'spectralHeal', region: { startSeconds: selection.startSeconds, endSeconds: selection.endSeconds, lowHz: bandLow, highHz: bandHigh } }, `Healed ${bandLow}–${bandHigh} Hz in the selection from the surrounding audio. Undo is available.`)}>Heal band</button>
        </div>
      </Tool>
    </section>

    <section className="mastering-panel" aria-labelledby="roomtone-heading">
      <div className="mastering-panel-heading"><div><h3 id="roomtone-heading">Room tone fill</h3><p>Cover a cough, bump, or edit gap with the natural background sound from a quiet part of the same clip.</p></div></div>
      <ol className="mastering-steps">
        <li>Select at least 0.5 seconds of clean background noise in the selected clip, then capture it.</li>
        <li>Select the part to cover and fill it. The edges blend over 10 ms so the patch doesn't click.</li>
      </ol>
      <div className="field"><span className="field-label">Captured room tone</span><output className="mastering-readout" aria-live="polite">{valid(roomTone) && roomTone ? `${formatTime(roomTone.startSeconds)}–${formatTime(roomTone.endSeconds)} (${(roomTone.endSeconds - roomTone.startSeconds).toFixed(2)} s)` : 'Nothing captured for this clip yet'}</output></div>
      <div className="button-row">
        <button type="button" disabled={!canEdit || !selectionInsideClip} onClick={() => captureFrom('room tone', setRoomTone, 0.02)}>Capture selection as room tone</button>
        <button type="button" disabled={!canEdit || !valid(roomTone) || !selectionInsideClip}
          onClick={() => roomTone && ctx.applyEdit({ type: 'roomTone', captureStartSeconds: roomTone.startSeconds, captureEndSeconds: roomTone.endSeconds, startSeconds: selection.startSeconds, endSeconds: selection.endSeconds, seed: newSeed() }, `Filled ${formatTime(selection.startSeconds)}–${formatTime(selection.endSeconds)} with room tone. Undo is available.`)}>Fill selection with room tone</button>
      </div>
    </section>
    <MasteringSamplePen ctx={ctx} />
  </>;
}
