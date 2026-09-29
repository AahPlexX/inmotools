/**
 * Edit tab: selection-based precision edits, level and bit-depth operations,
 * channel utilities, the source inspector, and marker/region lists
 * (ledgers 2, 3, 8, 9, 11, 12, 20–25, 27, 31).
 *
 * Receives the shared panel context; every action ends in `ctx.commit` or
 * `ctx.applyEdit`, so each is one undo step on the selected clip.
 */
import { useState } from 'react';
import { clampSelection } from './mastering-engine';
import type { AudioFileInfo } from './mastering-media';
import {
  activeClip as findActiveClip,
  cropProjectRevision,
  deleteRangeRevision,
  insertSilenceRevision,
  resetClipEditsRevision,
} from './mastering-project';
import { SUPPORTED_BIT_DEPTHS, type LevelMeasure } from './dsp/processors';
import { formatBytes, formatTime, messageOf, newId, newSeed, type MasteringPanelContext } from './mastering-ui';

interface Props {
  ctx: MasteringPanelContext;
  sourceInfo: AudioFileInfo | undefined;
  onAddMarker: (label: string) => void;
}

export default function MasteringEditTab({ ctx, sourceInfo, onAddMarker }: Props) {
  const { document, clip, clipInfo, clipStart, clipEnd, duration, playhead, selection, canEdit } = ctx;
  const { markers, regions } = document;
  const [markerName, setMarkerName] = useState('');
  const [regionName, setRegionName] = useState('');
  const [silenceDuration, setSilenceDuration] = useState(1);
  const [snapEditBoundaries, setSnapEditBoundaries] = useState(false);
  const [channelIndex, setChannelIndex] = useState(0);
  const [gainDb, setGainDb] = useState(0);
  const [peakTarget, setPeakTarget] = useState(-1);
  const [levelMeasure, setLevelMeasure] = useState<LevelMeasure>('lufs');
  const [levelTarget, setLevelTarget] = useState(-14);
  const [bitDepth, setBitDepth] = useState<number>(16);
  const [dither, setDither] = useState(true);
  const activeChannelIndex = Math.min(channelIndex, Math.max(0, (clipInfo?.channelCount ?? 1) - 1));
  const selectionInsideClip = Boolean(clip) && selection.endSeconds > selection.startSeconds && selection.startSeconds < clipEnd && selection.endSeconds > clipStart;
  const metadata = sourceInfo?.metadata;

  const updateSelection = (next: typeof selection) => ctx.updateView({ selection: clampSelection(next, duration) });

  const resolveEditRange = async (range: typeof selection) => {
    const selected = clampSelection(range, duration);
    if (!snapEditBoundaries || !clip || !ctx.client) return selected;
    const [start, end] = await ctx.client.snap(ctx.latestDocument(), clip.id, [selected.startSeconds, selected.endSeconds]);
    return clampSelection({ startSeconds: start, endSeconds: end }, duration);
  };

  const cropRange = async (range: typeof selection, label: string) => {
    try {
      const selected = await resolveEditRange(range);
      const current = ctx.latestDocument();
      const next = cropProjectRevision(current, selected.startSeconds, selected.endSeconds);
      if (findActiveClip(next)?.edits.length === findActiveClip(current)?.edits.length) {
        ctx.setStatus('Choose a range inside the selected clip that keeps part of it.');
        return;
      }
      ctx.commit(next, `${label} ${formatTime(selected.startSeconds)}–${formatTime(selected.endSeconds)}. Undo is available.`);
    } catch (error) { ctx.setStatus(messageOf(error)); }
  };

  const deleteSelection = async () => {
    try {
      const selected = await resolveEditRange(selection);
      const current = ctx.latestDocument();
      const next = deleteRangeRevision(current, selected.startSeconds, selected.endSeconds);
      if (findActiveClip(next)?.edits.length === findActiveClip(current)?.edits.length) {
        ctx.setStatus('Choose part of the selected clip to delete. To remove the whole clip, use Delete clip on the Arrange tab.');
        return;
      }
      ctx.commit(next, `Deleted ${formatTime(selected.startSeconds)}–${formatTime(selected.endSeconds)}. Undo is available.`);
    } catch (error) { ctx.setStatus(messageOf(error)); }
  };

  const snapSelectionToZero = async () => {
    if (!clip || !ctx.client) return;
    try {
      const [start, end] = await ctx.client.snap(ctx.latestDocument(), clip.id, [selection.startSeconds, selection.endSeconds]);
      const next = clampSelection({ startSeconds: start, endSeconds: end }, duration);
      ctx.updateView({ selection: next });
      ctx.setStatus(`Selection snapped to nearby zero crossings at ${formatTime(next.startSeconds)} and ${formatTime(next.endSeconds)}.`);
    } catch (error) { ctx.setStatus(messageOf(error)); }
  };

  const addRegion = () => {
    if (selection.endSeconds <= selection.startSeconds) { ctx.setStatus('Choose a non-empty selection before creating a region.'); return; }
    const label = regionName.trim() || `Region ${regions.length + 1}`;
    ctx.commit({ ...document, regions: [...regions, { id: newId('region'), label, startSeconds: selection.startSeconds, endSeconds: selection.endSeconds }] },
      `Added ${label} from ${formatTime(selection.startSeconds)} to ${formatTime(selection.endSeconds)}.`);
    setRegionName('');
  };

  const renameMarker = (id: string, label: string) => {
    const nextLabel = label.trim();
    const current = markers.find((marker) => marker.id === id);
    if (!current || !nextLabel || current.label === nextLabel) return;
    ctx.commit({ ...document, markers: markers.map((marker) => marker.id === id ? { ...marker, label: nextLabel } : marker) }, `Renamed the marker to ${nextLabel}.`);
  };

  const renameRegion = (id: string, label: string) => {
    const nextLabel = label.trim();
    const current = regions.find((region) => region.id === id);
    if (!current || !nextLabel || current.label === nextLabel) return;
    ctx.commit({ ...document, regions: regions.map((region) => region.id === id ? { ...region, label: nextLabel } : region) }, `Renamed the region to ${nextLabel}.`);
  };

  const insertSilenceAtPlayhead = () => {
    if (!clip || !Number.isFinite(silenceDuration) || silenceDuration <= 0) { ctx.setStatus('Enter a silence duration greater than zero.'); return; }
    const next = insertSilenceRevision(document, playhead, silenceDuration);
    const insertion = findActiveClip(next)?.edits.at(-1);
    if (findActiveClip(next)?.edits.length === clip.edits.length || insertion?.type !== 'insertSilence') {
      ctx.setStatus('The silence rounds to zero samples at the project sample rate.');
      return;
    }
    ctx.commit(next, `Inserted ${insertion.durationSeconds.toFixed(3)} seconds of silence at ${formatTime(clip.startSeconds + insertion.atSeconds)}.`);
  };

  return <>
    <div className="mastering-columns">
      <section className="mastering-panel" aria-labelledby="selection-heading">
        <div className="mastering-panel-heading"><div><h3 id="selection-heading">Selection & precision edits</h3><p>Drag across the waveform or type exact times. Range edits change the selected clip{clip ? ` (${clip.name})` : ''}.</p></div></div>
        <div className="workspace-grid three">
          <div className="field"><label htmlFor="mastering-selection-start">Selection start (seconds)</label><input id="mastering-selection-start" type="number" min="0" max={duration} step="0.001" value={selection.startSeconds} onChange={(event) => { const start = Number(event.target.value); updateSelection({ startSeconds: start, endSeconds: Math.max(start, selection.endSeconds) }); }} disabled={!canEdit} /></div>
          <div className="field"><label htmlFor="mastering-selection-end">Selection end (seconds)</label><input id="mastering-selection-end" type="number" min="0" max={duration} step="0.001" value={selection.endSeconds} onChange={(event) => { const end = Number(event.target.value); updateSelection({ startSeconds: Math.min(end, selection.startSeconds), endSeconds: end }); }} disabled={!canEdit} /></div>
          <div className="field"><span className="field-label">Duration</span><output className="mastering-readout">{(selection.endSeconds - selection.startSeconds).toFixed(3)} s</output></div>
        </div>
        <div className="workspace-grid">
          <div className="field"><label htmlFor="mastering-marker-name">Marker name</label><input id="mastering-marker-name" type="text" value={markerName} onChange={(event) => setMarkerName(event.target.value)} placeholder={`Marker ${markers.length + 1}`} disabled={!canEdit} /></div>
          <div className="field"><label htmlFor="mastering-region-name">Region name</label><input id="mastering-region-name" type="text" value={regionName} onChange={(event) => setRegionName(event.target.value)} placeholder={`Region ${regions.length + 1}`} disabled={!canEdit} /></div>
        </div>
        <label className="mastering-check"><input type="checkbox" checked={snapEditBoundaries} onChange={(event) => setSnapEditBoundaries(event.target.checked)} disabled={!canEdit} /> Snap crop and delete boundaries to nearby zero crossings</label>
        <div className="button-row">
          <button type="button" onClick={() => void snapSelectionToZero()} disabled={!canEdit}>Snap selection to zero crossings</button>
          <button type="button" onClick={() => { ctx.updateView({ selection: { startSeconds: clipStart, endSeconds: clipEnd } }); ctx.setStatus(`Selected all of ${clip?.name ?? 'the clip'}.`); }} disabled={!canEdit || !clip}>Select whole clip</button>
          <button type="button" onClick={() => void cropRange(selection, 'Cropped to')} disabled={!canEdit || !selectionInsideClip}>Crop to selection</button>
          <button type="button" onClick={() => void cropRange({ startSeconds: selection.startSeconds, endSeconds: clipEnd }, 'Trimmed before selection, keeping')} disabled={!canEdit || !clip || selection.startSeconds <= clipStart || selection.startSeconds >= clipEnd}>Trim before selection</button>
          <button type="button" onClick={() => void cropRange({ startSeconds: clipStart, endSeconds: selection.endSeconds }, 'Trimmed after selection, keeping')} disabled={!canEdit || !clip || selection.endSeconds >= clipEnd || selection.endSeconds <= clipStart}>Trim after selection</button>
          <button type="button" onClick={() => void deleteSelection()} disabled={!canEdit || !selectionInsideClip}>Delete selection</button>
          <button type="button" onClick={() => { onAddMarker(markerName.trim()); setMarkerName(''); }} disabled={!canEdit}>Add marker at playhead</button>
          <button type="button" onClick={addRegion} disabled={!canEdit || selection.endSeconds <= selection.startSeconds}>Add region from selection</button>
        </div>
      </section>

      <section className="mastering-panel" aria-labelledby="level-heading">
        <div className="mastering-panel-heading"><div><h3 id="level-heading">Level operations</h3><p>Applies to the selected clip. Every operation stays reversible.</p></div></div>
        <div className="workspace-grid three">
          <div className="field"><label htmlFor="mastering-gain">Gain to apply (dB)</label><input id="mastering-gain" type="number" min="-60" max="24" step="0.1" value={gainDb} onChange={(event) => setGainDb(Number(event.target.value))} disabled={!canEdit} /></div>
          <div className="field"><label htmlFor="mastering-peak-target">Peak target (dBFS)</label><input id="mastering-peak-target" type="number" min="-60" max="0" step="0.1" value={peakTarget} onChange={(event) => setPeakTarget(Math.min(0, Number(event.target.value)))} disabled={!canEdit} /></div>
          <div className="field"><span className="field-label">Clip edits</span><output className="mastering-readout" aria-label="Clip edits">{clip?.edits.length ?? 0}</output></div>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => ctx.applyEdit({ type: 'gain', gainDb }, `Applied ${gainDb.toFixed(1)} dB gain. Undo is available.`)} disabled={!canEdit || gainDb === 0}>Apply gain</button>
          <button type="button" onClick={() => ctx.applyEdit({ type: 'normalizePeak', targetDbfs: peakTarget }, `Peak-normalized to ${peakTarget.toFixed(1)} dBFS. Undo is available.`)} disabled={!canEdit || !Number.isFinite(peakTarget)}>Normalize peak</button>
          <button type="button" onClick={() => { if (clip?.edits.length) ctx.commit(resetClipEditsRevision(document), `Reset ${clip.name} to its original audio. Undo is available.`); }} disabled={!canEdit || !clip?.edits.length}>Reset clip edits</button>
        </div>
        <fieldset className="mastering-fieldset">
          <legend>Loudness or RMS normalization</legend>
          <div className="workspace-grid">
            <div className="field"><label htmlFor="mastering-level-measure">Measure</label>
              <select id="mastering-level-measure" value={levelMeasure} onChange={(event) => { const measure = event.target.value as LevelMeasure; setLevelMeasure(measure); setLevelTarget(measure === 'lufs' ? -14 : -18); }} disabled={!canEdit}>
                <option value="lufs">Integrated loudness (LUFS, BS.1770-5)</option>
                <option value="rms">RMS level (dBFS)</option>
              </select></div>
            <div className="field"><label htmlFor="mastering-level-target">Target ({levelMeasure === 'lufs' ? 'LUFS' : 'dBFS'})</label><input id="mastering-level-target" type="number" min="-60" max="0" step="0.1" value={levelTarget} onChange={(event) => setLevelTarget(Number(event.target.value))} disabled={!canEdit} /></div>
          </div>
          <p className="help-text">Common targets: −14 LUFS for most streaming services, −16 LUFS for podcasts, −23 LUFS for EBU R 128 broadcast. Normalizing only changes gain, so check the true-peak meter before export.</p>
          <div className="button-row"><button type="button" onClick={() => ctx.applyEdit({ type: 'normalizeLevel', measure: levelMeasure, target: levelTarget }, `Normalized to ${levelTarget.toFixed(1)} ${levelMeasure === 'lufs' ? 'LUFS integrated loudness' : 'dBFS RMS'}. Undo is available.`)} disabled={!canEdit || !Number.isFinite(levelTarget)}>Normalize level</button></div>
        </fieldset>
        <fieldset className="mastering-fieldset">
          <legend>Bit depth</legend>
          <div className="workspace-grid">
            <div className="field"><label htmlFor="mastering-bit-depth">Reduce to</label>
              <select id="mastering-bit-depth" value={bitDepth} onChange={(event) => setBitDepth(Number(event.target.value))} disabled={!canEdit}>
                {SUPPORTED_BIT_DEPTHS.map((bits) => <option key={bits} value={bits}>{bits}-bit</option>)}
              </select></div>
            <label className="mastering-check"><input type="checkbox" checked={dither} onChange={(event) => setDither(event.target.checked)} disabled={!canEdit} /> Add TPDF dither</label>
          </div>
          <p className="help-text">Rounds the clip to the chosen integer grid so you can hear the result before export. Dither trades a faint noise floor for distortion-free fades.</p>
          <div className="button-row"><button type="button" onClick={() => ctx.applyEdit({ type: 'quantize', bits: bitDepth, dither: dither ? 'tpdf' : 'none', seed: newSeed() }, `Reduced the clip to ${bitDepth}-bit${dither ? ' with TPDF dither' : ''}. Undo is available.`)} disabled={!canEdit}>Apply bit depth</button></div>
        </fieldset>
      </section>
    </div>

    <section className="mastering-panel mastering-utility-panel" aria-labelledby="utility-heading">
      <div className="mastering-panel-heading"><div><h3 id="utility-heading">Repair & channel utilities</h3><p>Quick fixes for the selected clip. Each one replays from the untouched source, so undo is exact.</p></div></div>
      <div className="workspace-grid three">
        <div className="field"><span className="field-label">DC offset by channel</span><output className="mastering-readout mastering-readout-wrap" aria-label="DC offset by channel">{clipInfo?.dcOffsets.length ? clipInfo.dcOffsets.map((offset, index) => `Ch ${index + 1}: ${offset.toExponential(3)}`).join(' · ') : '—'}</output></div>
        <div className="field"><span className="field-label">Working channels</span><output className="mastering-readout" aria-label="Working channels">{clipInfo?.channelCount ?? 0}</output></div>
        <div className="field"><label htmlFor="mastering-channel">Channel target</label><select id="mastering-channel" value={activeChannelIndex} onChange={(event) => setChannelIndex(Number(event.target.value))} disabled={!canEdit}>{Array.from({ length: clipInfo?.channelCount ?? 1 }, (_, index) => <option key={index} value={index}>Channel {index + 1}</option>)}</select></div>
      </div>
      <div className="workspace-grid">
        <div className="field"><label htmlFor="mastering-silence-duration">Silence duration (seconds)</label><input id="mastering-silence-duration" type="number" min="0.001" max="3600" step="0.001" value={silenceDuration} onChange={(event) => setSilenceDuration(Number(event.target.value))} disabled={!canEdit} /></div>
        <div className="field"><span className="field-label">Insertion point</span><output className="mastering-readout">{formatTime(playhead)}</output></div>
      </div>
      <div className="button-row">
        <button type="button" onClick={() => ctx.applyEdit({ type: 'removeDc' }, 'Removed the measured DC offset from each channel. Undo is available.')} disabled={!canEdit}>Remove DC offset</button>
        <button type="button" onClick={() => ctx.applyEdit({ type: 'invertPolarity' }, 'Inverted polarity on every channel. Undo is available.')} disabled={!canEdit}>Invert polarity</button>
        <button type="button" onClick={() => ctx.applyEdit({ type: 'reverse', startSeconds: selection.startSeconds, endSeconds: selection.endSeconds }, 'Reversed the selected range. Undo is available.')} disabled={!canEdit || !selectionInsideClip}>Reverse selection</button>
        <button type="button" onClick={() => ctx.applyEdit({ type: 'reverse', startSeconds: clipStart, endSeconds: clipEnd }, 'Reversed the whole clip. Undo is available.')} disabled={!canEdit || !clip}>Reverse whole clip</button>
        <button type="button" onClick={insertSilenceAtPlayhead} disabled={!canEdit || !clip || silenceDuration <= 0}>Insert silence at playhead</button>
        <button type="button" onClick={() => ctx.applyEdit({ type: 'swapStereo' }, 'Swapped left and right. Undo is available.')} disabled={!canEdit || clipInfo?.channelCount !== 2}>Swap L/R</button>
        <button type="button" onClick={() => ctx.applyEdit({ type: 'foldDownMono' }, 'Folded the clip down to mono. Undo is available.')} disabled={!canEdit || (clipInfo?.channelCount ?? 0) <= 1}>Fold down to mono</button>
        <button type="button" onClick={() => ctx.applyEdit({ type: 'extractChannel', channelIndex: activeChannelIndex }, `Kept only channel ${activeChannelIndex + 1}. Undo is available.`)} disabled={!canEdit || (clipInfo?.channelCount ?? 0) <= 1}>Extract channel</button>
        <button type="button" onClick={() => ctx.applyEdit({ type: 'dualMono', channelIndex: activeChannelIndex }, `Made dual mono from channel ${activeChannelIndex + 1}. Undo is available.`)} disabled={!canEdit}>Create dual mono</button>
      </div>
    </section>

    {sourceInfo && <section className="mastering-panel" aria-labelledby="source-heading">
      <div className="mastering-panel-heading"><div><h3 id="source-heading">Source inspector</h3><p>What the selected clip's original file contains, read locally.</p></div></div>
      <div className="metric-row">
        <div className="metric"><span>File</span><strong className="mastering-wrap">{sourceInfo.fileName}</strong></div>
        <div className="metric"><span>Codec</span><strong>{sourceInfo.codec}</strong></div>
        <div className="metric"><span>Duration</span><strong>{sourceInfo.durationSeconds.toFixed(2)} s</strong></div>
        <div className="metric"><span>Sample rate</span><strong>{sourceInfo.sampleRate.toLocaleString()} Hz</strong></div>
        <div className="metric"><span>Channels</span><strong>{sourceInfo.channelCount}</strong></div>
        <div className="metric"><span>Source size</span><strong>{formatBytes(sourceInfo.fileSize)}</strong></div>
        <div className="metric"><span>Artwork</span><strong>{metadata?.artworkCount ? `${metadata.artworkCount} image${metadata.artworkCount === 1 ? '' : 's'}` : 'None'}</strong></div>
      </div>
      {document.sampleRate && sourceInfo.sampleRate !== document.sampleRate && <p className="help-text">Converted to the project rate of {document.sampleRate.toLocaleString()} Hz on import with a band-limited resampler.</p>}
      {(metadata?.title || metadata?.artist || metadata?.album || metadata?.genre) && <dl className="mastering-metadata">
        {metadata.title && <><dt>Title</dt><dd>{metadata.title}</dd></>}
        {metadata.artist && <><dt>Artist</dt><dd>{metadata.artist}</dd></>}
        {metadata.album && <><dt>Album</dt><dd>{metadata.album}</dd></>}
        {metadata.genre && <><dt>Genre</dt><dd>{metadata.genre}</dd></>}
      </dl>}
    </section>}

    {markers.length > 0 && <section className="mastering-panel" aria-labelledby="markers-heading">
      <div className="mastering-panel-heading"><div><h3 id="markers-heading">Markers</h3><p>Rename, jump to, or remove exact timeline points.</p></div></div>
      <div className="mastering-marker-list">{markers.map((marker, index) => <div key={marker.id}>
        <input type="text" aria-label={`Marker ${index + 1} name`} defaultValue={marker.label} onBlur={(event) => renameMarker(marker.id, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
        <button type="button" onClick={() => ctx.seek(marker.seconds)}>Jump {formatTime(marker.seconds)}</button>
        <button type="button" aria-label={`Remove ${marker.label || `marker ${index + 1}`}`} onClick={() => ctx.commit({ ...document, markers: markers.filter((candidate) => candidate.id !== marker.id) }, `Removed ${marker.label}.`)}>Remove</button>
      </div>)}</div>
    </section>}

    {regions.length > 0 && <section className="mastering-panel" aria-labelledby="regions-heading">
      <div className="mastering-panel-heading"><div><h3 id="regions-heading">Regions</h3><p>Named ranges restore the exact selection and playhead in one action.</p></div></div>
      <div className="mastering-region-list">{regions.map((region, index) => <div key={region.id}>
        <input type="text" aria-label={`Region ${index + 1} name`} defaultValue={region.label} onBlur={(event) => renameRegion(region.id, event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
        <button type="button" onClick={() => { ctx.seek(region.startSeconds); ctx.updateView({ selection: { startSeconds: region.startSeconds, endSeconds: region.endSeconds }, playhead: region.startSeconds }); }}>Select {formatTime(region.startSeconds)}–{formatTime(region.endSeconds)}</button>
        <button type="button" aria-label={`Remove ${region.label || `region ${index + 1}`}`} onClick={() => ctx.commit({ ...document, regions: regions.filter((candidate) => candidate.id !== region.id) }, `Removed ${region.label}.`)}>Remove</button>
      </div>)}</div>
    </section>}
  </>;
}
