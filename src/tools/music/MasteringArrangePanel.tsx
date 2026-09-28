/**
 * Track and clip controls (ledgers 4, 10, 11, 13, 14, 15, 16).
 *
 * Receives the current document and emits whole-document revisions through
 * `onCommit`, so every change here is one undo step. Numeric fields commit on
 * Enter or blur; buttons commit immediately. Nothing here needs a pointer drag.
 */
import { useState } from 'react';
import {
  FADE_CURVES,
  MAX_TRACKS,
  activeClip as findActiveClip,
  clipDurationSeconds,
  crossfadeClipsRevision,
  deleteClipRevision,
  duplicateClipRevision,
  findClip,
  moveClipRevision,
  moveClipToTrackRevision,
  moveTrackRevision,
  nudgeClipRevision,
  removeTrackRevision,
  setClipFadeRevision,
  updateClipRevision,
  updateTrackRevision,
  type FadeCurve,
  type MasteringDocument,
} from './mastering-project';
import { CommitNumberField, formatDb, formatPan, formatTime, messageOf, newId } from './mastering-ui';

interface Props {
  document: MasteringDocument;
  playhead: number;
  disabled: boolean;
  onCommit: (next: MasteringDocument, status: string) => void;
  onStatus: (status: string) => void;
  onActivateClip: (clipId: string) => void;
  onSplit: () => void;
}

export const NUDGE_STEPS: ReadonlyArray<{ label: string; seconds: number | 'frame' }> = [
  { label: '1 sample', seconds: 'frame' },
  { label: '1 ms', seconds: 0.001 },
  { label: '10 ms', seconds: 0.01 },
  { label: '100 ms', seconds: 0.1 },
  { label: '1 second', seconds: 1 },
];

export function nudgeSeconds(step: number, sampleRate: number | null): number {
  const option = NUDGE_STEPS[step] ?? NUDGE_STEPS[2];
  return option.seconds === 'frame' ? 1 / (sampleRate || 48_000) : option.seconds;
}

function PanField({ label, value, disabled, onCommit }: { label: string; value: number; disabled: boolean; onCommit: (pan: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  return <div className="field">
    <label>{label} <output className="mastering-unit">{formatPan(shown)}</output>
      <input type="range" min={-1} max={1} step={0.01} value={shown} disabled={disabled}
        aria-valuetext={formatPan(shown)}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={() => { if (draft !== null) { onCommit(draft); setDraft(null); } }}
        onKeyUp={() => { if (draft !== null) { onCommit(draft); setDraft(null); } }}
        onBlur={() => { if (draft !== null) { onCommit(draft); setDraft(null); } }} />
    </label>
  </div>;
}

export default function MasteringArrangePanel({ document, playhead, disabled, onCommit, onStatus, onActivateClip, onSplit }: Props) {
  const [nudgeStep, setNudgeStep] = useState(2);
  const [crossfadeSeconds, setCrossfadeSeconds] = useState(0.05);
  const [crossfadeCurve, setCrossfadeCurve] = useState<FadeCurve>('equalPower');
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const clip = findActiveClip(document);
  const location = clip ? findClip(document, clip.id) : null;
  const clipDuration = clip ? clipDurationSeconds(document, clip) : 0;
  const nextOnTrack = location ? [...location.track.clips]
    .filter((candidate) => candidate.id !== clip?.id && candidate.startSeconds >= (clip?.startSeconds ?? 0))
    .sort((a, b) => a.startSeconds - b.startSeconds)[0] ?? null : null;

  const commit = (next: MasteringDocument, status: string) => onCommit(next, status);
  const tryCommit = (build: () => MasteringDocument, status: string) => {
    try { commit(build(), status); } catch (error) { onStatus(messageOf(error)); }
  };

  return <section className="mastering-panel" aria-labelledby="arrange-heading">
    <div className="mastering-panel-heading"><div>
      <h3 id="arrange-heading">Tracks & clips</h3>
      <p>Up to {MAX_TRACKS} mono or stereo tracks. Pick a clip in the timeline or the list to edit it; every change can be undone.</p>
    </div></div>

    <ol className="mastering-track-list">
      {document.tracks.map((track, index) => <li key={track.id} className="mastering-track-row">
        <div className="mastering-track-head">
          <label className="field mastering-track-name">
            <span className="field-label">Track {index + 1} name</span>
            <input type="text" defaultValue={track.name} key={track.name} maxLength={80} disabled={disabled}
              onBlur={(event) => { if (event.currentTarget.value.trim() && event.currentTarget.value.trim() !== track.name) commit(updateTrackRevision(document, track.id, { name: event.currentTarget.value }), `Renamed the track to ${event.currentTarget.value.trim()}.`); }}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
          </label>
          <div className="mastering-toggle-row">
            <button type="button" aria-pressed={track.muted} disabled={disabled} onClick={() => commit(updateTrackRevision(document, track.id, { muted: !track.muted }), `${track.name} ${track.muted ? 'unmuted' : 'muted'}.`)}>Mute</button>
            <button type="button" aria-pressed={track.solo} disabled={disabled} onClick={() => commit(updateTrackRevision(document, track.id, { solo: !track.solo }), `${track.name} solo ${track.solo ? 'off' : 'on'}.`)}>Solo</button>
            <button type="button" disabled={disabled || index === 0} aria-label={`Move ${track.name} up`} onClick={() => commit(moveTrackRevision(document, track.id, -1), `Moved ${track.name} up.`)}>↑</button>
            <button type="button" disabled={disabled || index === document.tracks.length - 1} aria-label={`Move ${track.name} down`} onClick={() => commit(moveTrackRevision(document, track.id, 1), `Moved ${track.name} down.`)}>↓</button>
            {pendingRemoval === track.id
              ? <button type="button" className="mastering-danger" disabled={disabled} onClick={() => { setPendingRemoval(null); commit(removeTrackRevision(document, track.id), `Removed ${track.name}. Undo brings it back.`); }}>Confirm remove</button>
              : <button type="button" disabled={disabled} aria-label={`Remove ${track.name}`} onClick={() => setPendingRemoval(track.id)}>Remove</button>}
          </div>
        </div>
        <div className="workspace-grid">
          <CommitNumberField label="Track gain" suffix="dB" value={track.gainDb} min={-60} max={24} step={0.1} digits={2} disabled={disabled}
            onCommit={(gainDb) => commit(updateTrackRevision(document, track.id, { gainDb }), `${track.name} gain ${formatDb(gainDb)}.`)} />
          <PanField label="Track pan" value={track.pan} disabled={disabled} onCommit={(pan) => commit(updateTrackRevision(document, track.id, { pan }), `${track.name} pan ${formatPan(pan)}.`)} />
        </div>
        {track.clips.length > 0 && <div className="mastering-clip-chips" role="group" aria-label={`Clips on ${track.name}`}>
          {track.clips.map((item) => <button type="button" key={item.id} aria-pressed={item.id === clip?.id} onClick={() => onActivateClip(item.id)}>
            {item.name} · {formatTime(item.startSeconds)}
          </button>)}
        </div>}
      </li>)}
    </ol>

    {clip && location && <div className="mastering-clip-editor" aria-labelledby="clip-heading">
      <h4 id="clip-heading">Selected clip: {clip.name}</h4>
      <p className="help-text">On {location.track.name}. Starts {formatTime(clip.startSeconds)}, lasts {formatTime(clipDuration)}. Range edits in the panels below apply to this clip.</p>
      <div className="workspace-grid three">
        <label className="field">
          <span className="field-label">Clip name</span>
          <input type="text" defaultValue={clip.name} key={`${clip.id}:${clip.name}`} maxLength={120} disabled={disabled}
            onBlur={(event) => { if (event.currentTarget.value.trim() && event.currentTarget.value.trim() !== clip.name) commit(updateClipRevision(document, clip.id, { name: event.currentTarget.value }), `Renamed the clip to ${event.currentTarget.value.trim()}.`); }}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
        </label>
        <CommitNumberField label="Clip start" suffix="seconds" value={clip.startSeconds} min={0} step={0.001} disabled={disabled}
          onCommit={(seconds) => commit(moveClipRevision(document, clip.id, seconds), `Moved ${clip.name} to ${formatTime(seconds)}.`)} />
        <label className="field">
          <span className="field-label">Move to track</span>
          <select value={location.track.id} disabled={disabled || document.tracks.length < 2}
            onChange={(event) => commit(moveClipToTrackRevision(document, clip.id, event.target.value), `Moved ${clip.name} to ${document.tracks.find((track) => track.id === event.target.value)?.name ?? 'another track'}.`)}>
            {document.tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
          </select>
        </label>
      </div>
      <div className="mastering-nudge" role="group" aria-label="Nudge selected clip">
        <label className="field">
          <span className="field-label">Nudge step</span>
          <select value={nudgeStep} onChange={(event) => setNudgeStep(Number(event.target.value))} disabled={disabled}>
            {NUDGE_STEPS.map((option, index) => <option key={option.label} value={index}>{option.label}</option>)}
          </select>
        </label>
        <button type="button" disabled={disabled || clip.startSeconds <= 0} onClick={() => commit(nudgeClipRevision(document, clip.id, -nudgeSeconds(nudgeStep, document.sampleRate)), `Nudged ${clip.name} earlier by ${NUDGE_STEPS[nudgeStep].label}.`)}>Nudge earlier</button>
        <button type="button" disabled={disabled} onClick={() => commit(nudgeClipRevision(document, clip.id, nudgeSeconds(nudgeStep, document.sampleRate)), `Nudged ${clip.name} later by ${NUDGE_STEPS[nudgeStep].label}.`)}>Nudge later</button>
      </div>
      <div className="workspace-grid three">
        <CommitNumberField label="Clip gain" suffix="dB" value={clip.gainDb} min={-60} max={24} step={0.1} digits={2} disabled={disabled}
          onCommit={(gainDb) => commit(updateClipRevision(document, clip.id, { gainDb }), `${clip.name} gain ${formatDb(gainDb)}.`)} />
        <PanField label="Clip pan" value={clip.pan} disabled={disabled} onCommit={(pan) => commit(updateClipRevision(document, clip.id, { pan }), `${clip.name} pan ${formatPan(pan)}.`)} />
        <div className="field"><span className="field-label">Clip mute and solo</span>
          <div className="mastering-toggle-row">
            <button type="button" aria-pressed={clip.muted} disabled={disabled} onClick={() => commit(updateClipRevision(document, clip.id, { muted: !clip.muted }), `${clip.name} ${clip.muted ? 'unmuted' : 'muted'}.`)}>Mute clip</button>
            <button type="button" aria-pressed={clip.solo} disabled={disabled} onClick={() => commit(updateClipRevision(document, clip.id, { solo: !clip.solo }), `${clip.name} solo ${clip.solo ? 'off' : 'on'}.`)}>Solo clip</button>
          </div>
        </div>
      </div>
      <fieldset className="mastering-fieldset">
        <legend>Fades</legend>
        <div className="workspace-grid">
          {(['in', 'out'] as const).map((edge) => {
            const fade = edge === 'in' ? clip.fadeIn : clip.fadeOut;
            return <div key={edge} className="mastering-fade-row">
              <CommitNumberField label={edge === 'in' ? 'Fade-in length' : 'Fade-out length'} suffix="seconds" value={fade.durationSeconds} min={0} max={clipDuration} step={0.001} disabled={disabled}
                onCommit={(durationSeconds) => commit(setClipFadeRevision(document, clip.id, edge, { ...fade, durationSeconds }), `Fade-${edge} set to ${durationSeconds.toFixed(3)} s.`)} />
              <label className="field">
                <span className="field-label">{edge === 'in' ? 'Fade-in curve' : 'Fade-out curve'}</span>
                <select value={fade.curve} disabled={disabled}
                  onChange={(event) => commit(setClipFadeRevision(document, clip.id, edge, { ...fade, curve: event.target.value as FadeCurve }), `Fade-${edge} curve set to ${FADE_CURVES.find((option) => option.value === event.target.value)?.label}.`)}>
                  {FADE_CURVES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>;
          })}
        </div>
      </fieldset>
      <div className="button-row">
        <button type="button" disabled={disabled || playhead <= clip.startSeconds || playhead >= clip.startSeconds + clipDuration} onClick={onSplit}>Split at playhead</button>
        <button type="button" disabled={disabled} onClick={() => commit(duplicateClipRevision(document, clip.id, newId('clip')), `Duplicated ${clip.name} after the original.`)}>Duplicate clip</button>
        <button type="button" disabled={disabled} onClick={() => commit(deleteClipRevision(document, clip.id), `Removed ${clip.name} from the timeline. Undo brings it back.`)}>Delete clip</button>
      </div>
      {nextOnTrack && <fieldset className="mastering-fieldset">
        <legend>Crossfade into {nextOnTrack.name}</legend>
        <p className="help-text">Moves the next clip so the two overlap by this length and fades across the overlap with matching curves.</p>
        <div className="workspace-grid">
          <CommitNumberField label="Crossfade length" suffix="seconds" value={crossfadeSeconds} min={0.001} step={0.001} disabled={disabled} onCommit={setCrossfadeSeconds} />
          <label className="field">
            <span className="field-label">Crossfade curve</span>
            <select value={crossfadeCurve} disabled={disabled} onChange={(event) => setCrossfadeCurve(event.target.value as FadeCurve)}>
              {FADE_CURVES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <div className="button-row">
          <button type="button" disabled={disabled} onClick={() => tryCommit(() => crossfadeClipsRevision(document, clip.id, nextOnTrack.id, crossfadeSeconds, crossfadeCurve), `Crossfaded ${clip.name} into ${nextOnTrack.name} over ${crossfadeSeconds.toFixed(3)} s.`)}>Apply crossfade</button>
        </div>
      </fieldset>}
    </div>}
  </section>;
}
