/**
 * Time & pitch tab (ledgers 28, 29, 30).
 *
 * Three ways to state a stretch (percent, target duration, tempo) resolve to
 * one ratio and one `timeStretch` edit, so every mode shares the same engine.
 * Pitch shifting keeps the clip length exactly.
 */
import { useState } from 'react';
import { MAX_STRETCH, MIN_STRETCH } from './dsp/stretch';
import { formatTime, type MasteringPanelContext } from './mastering-ui';

type StretchMode = 'percent' | 'duration' | 'tempo';

/** Resolves the stretch ratio (new length / old length) for each input mode; null when inputs are incomplete. */
export function stretchRatio(mode: StretchMode, values: { percent: number; targetSeconds: number; currentSeconds: number; fromBpm: number; toBpm: number }): number | null {
  const ratio = mode === 'percent'
    ? values.percent / 100
    : mode === 'duration'
      ? values.currentSeconds > 0 ? values.targetSeconds / values.currentSeconds : NaN
      : values.toBpm > 0 ? values.fromBpm / values.toBpm : NaN;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

export default function MasteringTimePitchTab({ ctx }: { ctx: MasteringPanelContext }) {
  const { clip, clipStart, clipEnd, canEdit } = ctx;
  const current = Math.max(0, clipEnd - clipStart);
  const [mode, setMode] = useState<StretchMode>('percent');
  const [percent, setPercent] = useState(100);
  const [targetSeconds, setTargetSeconds] = useState(0);
  const [fromBpm, setFromBpm] = useState(120);
  const [toBpm, setToBpm] = useState(120);
  const [semitones, setSemitones] = useState(0);
  const [cents, setCents] = useState(0);
  const [formants, setFormants] = useState(true);
  const ratio = stretchRatio(mode, { percent, targetSeconds: targetSeconds || current, currentSeconds: current, fromBpm, toBpm });
  const inRange = ratio !== null && ratio >= MIN_STRETCH && ratio <= MAX_STRETCH;
  const pitchTotal = semitones + cents / 100;

  return <div className="mastering-columns">
    <section className="mastering-panel" aria-labelledby="stretch-heading">
      <div className="mastering-panel-heading"><div><h3 id="stretch-heading">Time stretch</h3><p>Change the selected clip's length without changing its pitch. Later clips on the track move with it.</p></div></div>
      <fieldset className="mastering-fieldset mastering-radio-row">
        <legend>Set the new length by</legend>
        {([['percent', 'Percentage'], ['duration', 'Target duration'], ['tempo', 'Tempo']] as const).map(([value, label]) => <label key={value} className="mastering-check">
          <input type="radio" name="mastering-stretch-mode" value={value} checked={mode === value} onChange={() => setMode(value)} disabled={!canEdit} /> {label}
        </label>)}
      </fieldset>
      {mode === 'percent' && <div className="field"><label htmlFor="mastering-stretch-percent">New length (% of current, 25–400)</label>
        <input id="mastering-stretch-percent" type="number" min={25} max={400} step={0.1} value={percent} onChange={(event) => setPercent(Number(event.target.value))} disabled={!canEdit} /></div>}
      {mode === 'duration' && <div className="field"><label htmlFor="mastering-stretch-duration">Target duration (seconds)</label>
        <input id="mastering-stretch-duration" type="number" min={0.001} step={0.001} value={targetSeconds || Number(current.toFixed(3))} onChange={(event) => setTargetSeconds(Number(event.target.value))} disabled={!canEdit} /></div>}
      {mode === 'tempo' && <div className="workspace-grid">
        <div className="field"><label htmlFor="mastering-from-bpm">Current tempo (BPM)</label><input id="mastering-from-bpm" type="number" min={20} max={400} step={0.01} value={fromBpm} onChange={(event) => setFromBpm(Number(event.target.value))} disabled={!canEdit} /></div>
        <div className="field"><label htmlFor="mastering-to-bpm">Target tempo (BPM)</label><input id="mastering-to-bpm" type="number" min={20} max={400} step={0.01} value={toBpm} onChange={(event) => setToBpm(Number(event.target.value))} disabled={!canEdit} /></div>
      </div>}
      <p className="help-text" aria-live="polite">
        {!clip ? 'Add audio to stretch a clip.' : ratio === null ? 'Enter a value to preview the new length.' : inRange
          ? `${clip.name}: ${formatTime(current)} → ${formatTime(current * ratio)} (${(ratio * 100).toFixed(1)}%).`
          : `That is ${(ratio * 100).toFixed(1)}% of the current length. Stretch works from 25% to 400%.`}
      </p>
      <div className="button-row">
        <button type="button" disabled={!canEdit || !inRange || Math.abs((ratio ?? 1) - 1) < 1e-6}
          onClick={() => ratio !== null && ctx.applyEdit({ type: 'timeStretch', ratio }, `Stretched ${clip?.name ?? 'the clip'} to ${(ratio * 100).toFixed(1)}% of its length. Rendering can take a few seconds for long clips.`)}>Apply time stretch</button>
      </div>
    </section>

    <section className="mastering-panel" aria-labelledby="pitch-heading">
      <div className="mastering-panel-heading"><div><h3 id="pitch-heading">Pitch shift</h3><p>Transpose the selected clip without changing its length.</p></div></div>
      <div className="workspace-grid">
        <div className="field"><label htmlFor="mastering-semitones">Semitones (−24 to 24)</label><input id="mastering-semitones" type="number" min={-24} max={24} step={1} value={semitones} onChange={(event) => setSemitones(Math.trunc(Number(event.target.value)))} disabled={!canEdit} /></div>
        <div className="field"><label htmlFor="mastering-cents">Cents (−100 to 100)</label><input id="mastering-cents" type="number" min={-100} max={100} step={1} value={cents} onChange={(event) => setCents(Number(event.target.value))} disabled={!canEdit} /></div>
      </div>
      <label className="mastering-check"><input type="checkbox" checked={formants} onChange={(event) => setFormants(event.target.checked)} disabled={!canEdit} /> Preserve formants (keeps voices from sounding chipmunk-like or boomy)</label>
      <div className="button-row">
        <button type="button" disabled={!canEdit || Math.abs(pitchTotal) < 1e-6 || Math.abs(pitchTotal) > 24 || Math.abs(cents) > 100}
          onClick={() => ctx.applyEdit({ type: 'pitchShift', semitones, cents, preserveFormants: formants }, `Shifted pitch by ${semitones} semitone${Math.abs(semitones) === 1 ? '' : 's'}${cents ? ` and ${cents} cents` : ''}${formants ? ' with formants preserved' : ''}.`)}>Apply pitch shift</button>
      </div>
    </section>
  </div>;
}
