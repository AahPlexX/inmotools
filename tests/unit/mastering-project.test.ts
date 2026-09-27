import { describe, expect, it } from 'vitest';
import {
  MAX_TRACKS,
  addSourceTracksRevision,
  appendAudioEditRevision,
  clipDurationSeconds,
  commitProjectRevision,
  createMasteringDocument,
  createProjectHistory,
  cropProjectRevision,
  crossfadeClipsRevision,
  deleteClipRevision,
  deleteRangeRevision,
  duplicateClipRevision,
  estimateDocumentDuration,
  insertSilenceRevision,
  moveClipRevision,
  moveClipToTrackRevision,
  moveTrackRevision,
  nudgeClipRevision,
  redoProjectRevision,
  removeTrackRevision,
  replaceProjectView,
  resetClipEditsRevision,
  setClipFadeRevision,
  splitClipRevision,
  undoProjectRevision,
  updateClipRevision,
  updateTrackRevision,
  type MasteringDocument,
  type MasteringSourceReference,
} from '../../src/tools/music/mastering-project';

const source = (id: string, seconds: number, sampleRate = 48_000, channelCount = 1): MasteringSourceReference => ({
  id,
  name: `${id}.wav`,
  sampleRate,
  channelCount,
  frameCount: Math.round(seconds * sampleRate),
  fileSize: 1000,
  lastModified: 0,
  codec: 'pcm-s16',
});

const single = (seconds: number, sampleRate = 48_000): MasteringDocument =>
  addSourceTracksRevision(createMasteringDocument(), [{ source: source('s', seconds, sampleRate), trackId: 't1', clipId: 'c1' }]);

describe('mastering document v2', () => {
  it('starts empty and adds one track and clip per source without embedding PCM', () => {
    const empty = createMasteringDocument();
    expect(empty).toMatchObject({ version: 2, sampleRate: null, sources: [], tracks: [], activeClipId: null });
    const document = single(12);
    expect(document.sampleRate).toBe(48_000);
    expect(document.tracks).toEqual([{
      id: 't1', name: 'Track 1', gainDb: 0, pan: 0, muted: false, solo: false,
      clips: [{
        id: 'c1', name: 's.wav', sourceId: 's', startSeconds: 0, edits: [], gainDb: 0, pan: 0, muted: false, solo: false,
        fadeIn: { durationSeconds: 0, curve: 'equalPower' }, fadeOut: { durationSeconds: 0, curve: 'equalPower' },
      }],
    }]);
    expect(document.activeClipId).toBe('c1');
    expect(document.selection).toEqual({ startSeconds: 0, endSeconds: 12 });
    expect(() => JSON.stringify(document)).not.toThrow();
  });

  it('bounds the project to eight mono or stereo tracks with a clear reason', () => {
    let document = createMasteringDocument();
    const placements = Array.from({ length: MAX_TRACKS }, (_, index) => ({ source: source(`s${index}`, 1), trackId: `t${index}`, clipId: `c${index}` }));
    document = addSourceTracksRevision(document, placements);
    expect(document.tracks).toHaveLength(8);
    expect(() => addSourceTracksRevision(document, [{ source: source('extra', 1), trackId: 'tx', clipId: 'cx' }])).toThrow(/up to 8 tracks/);
    expect(() => addSourceTracksRevision(createMasteringDocument(), [{ source: source('six', 1, 48_000, 6), trackId: 't', clipId: 'c' }])).toThrow(/mono or stereo/);
    expect(() => addSourceTracksRevision(createMasteringDocument(), [{ source: source('bad', 1, 0), trackId: 't', clipId: 'c' }])).toThrow(RangeError);
  });

  it('renames, reorders, mixes, and removes tracks, pruning unused sources', () => {
    let document = addSourceTracksRevision(createMasteringDocument(), [
      { source: source('a', 2), trackId: 'ta', clipId: 'ca' },
      { source: source('b', 3), trackId: 'tb', clipId: 'cb' },
    ]);
    document = updateTrackRevision(document, 'tb', { name: '  Vocals  ', gainDb: 99, pan: -4, solo: true });
    expect(document.tracks[1]).toMatchObject({ name: 'Vocals', gainDb: 24, pan: -1, solo: true });
    expect(updateTrackRevision(document, 'tb', { name: '   ' }).tracks[1].name).toBe('Vocals');
    document = moveTrackRevision(document, 'tb', -1);
    expect(document.tracks.map((track) => track.id)).toEqual(['tb', 'ta']);
    expect(moveTrackRevision(document, 'tb', -1).tracks.map((track) => track.id)).toEqual(['tb', 'ta']);
    document = removeTrackRevision(document, 'tb');
    expect(document.sources.map((item) => item.id)).toEqual(['a']);
    expect(document.activeClipId).toBe('ca');
    expect(estimateDocumentDuration(document)).toBe(2);
  });
});

describe('history', () => {
  it('commits, undoes, and redoes one atomic revision', () => {
    const history = createProjectHistory(single(4));
    const changed = appendAudioEditRevision(history.present, { type: 'gain', gainDb: 3 });
    const committed = commitProjectRevision(history, { ...changed, markers: [{ id: 'm1', label: 'Hit', seconds: 1 }] });
    expect(committed.past).toHaveLength(1);
    const undone = undoProjectRevision(committed);
    expect(undone.present.tracks[0].clips[0].edits).toEqual([]);
    expect(undone.present.markers).toEqual([]);
    const redone = redoProjectRevision(undone);
    expect(redone.present).toEqual(committed.present);
    expect(redone.future).toEqual([]);
  });

  it('replaces view state without an undo step and ignores unknown active clips', () => {
    const history = createProjectHistory(single(4));
    const moved = replaceProjectView(history, { selection: { startSeconds: 1, endSeconds: 2 }, playhead: 9, activeClipId: 'missing' });
    expect(moved.past).toHaveLength(0);
    expect(moved.present.selection).toEqual({ startSeconds: 1, endSeconds: 2 });
    expect(moved.present.playhead).toBe(4);
    expect(moved.present.activeClipId).toBe('c1');
  });

  it('bounds history to 100 revisions and clears redo after a divergent commit', () => {
    let history = createProjectHistory(single(4));
    for (let revision = 0; revision <= 100; revision += 1) {
      history = commitProjectRevision(history, { ...history.present, metadataEdits: { revision: String(revision) } });
    }
    expect(history.past).toHaveLength(100);
    history = undoProjectRevision(history);
    expect(history.future).toHaveLength(1);
    history = commitProjectRevision(history, { ...history.present, metadataEdits: { revision: 'branch' } });
    expect(history.future).toEqual([]);
  });
});

describe('clip range edits', () => {
  it('deletes a range and remaps markers, regions, selection, and playhead together', () => {
    const document = {
      ...single(10),
      markers: [
        { id: 'before', label: 'Before', seconds: 1 },
        { id: 'removed', label: 'Removed', seconds: 4 },
        { id: 'after', label: 'After', seconds: 8 },
      ],
      regions: [
        { id: 'crossing', label: 'Crossing', startSeconds: 2, endSeconds: 5 },
        { id: 'later', label: 'Later', startSeconds: 7, endSeconds: 9 },
      ],
      selection: { startSeconds: 3, endSeconds: 8 },
      playhead: 4,
    };
    const deleted = deleteRangeRevision(document, 3, 6);
    expect(deleted.tracks[0].clips[0].edits.at(-1)).toEqual({ type: 'deleteRange', startSeconds: 3, endSeconds: 6 });
    expect(deleted.markers).toEqual([
      { id: 'before', label: 'Before', seconds: 1 },
      { id: 'after', label: 'After', seconds: 5 },
    ]);
    expect(deleted.regions).toEqual([
      { id: 'crossing', label: 'Crossing', startSeconds: 2, endSeconds: 3 },
      { id: 'later', label: 'Later', startSeconds: 4, endSeconds: 6 },
    ]);
    expect(deleted.selection).toEqual({ startSeconds: 3, endSeconds: 5 });
    expect(deleted.playhead).toBe(3);
    expect(estimateDocumentDuration(deleted)).toBe(7);
    expect(deleteRangeRevision(document, 0, 10)).toEqual(document);
  });

  it('crops edits, markers, regions, selection, and playhead together', () => {
    const document = {
      ...single(10),
      markers: [{ id: 'before', label: 'Before', seconds: 1 }, { id: 'inside', label: 'Inside', seconds: 4 }],
      regions: [{ id: 'overlap', label: 'Overlap', startSeconds: 2, endSeconds: 5 }, { id: 'outside', label: 'Outside', startSeconds: 7, endSeconds: 9 }],
      playhead: 4,
    };
    const cropped = cropProjectRevision(document, 3, 6);
    expect(cropped.tracks[0].clips[0].edits.at(-1)).toEqual({ type: 'crop', startSeconds: 3, endSeconds: 6 });
    expect(cropped.markers).toEqual([{ id: 'inside', label: 'Inside', seconds: 1 }]);
    expect(cropped.regions).toEqual([{ id: 'overlap', label: 'Overlap', startSeconds: 0, endSeconds: 2 }]);
    expect(cropped.selection).toEqual({ startSeconds: 0, endSeconds: 3 });
    expect(cropped.playhead).toBe(1);
  });

  it('inserts silence and shifts every affected annotation atomically', () => {
    const document = {
      ...single(5),
      markers: [{ id: 'm', label: 'Later', seconds: 3 }],
      regions: [{ id: 'r', label: 'Range', startSeconds: 1, endSeconds: 4 }],
      selection: { startSeconds: 2, endSeconds: 4 },
      playhead: 2,
    };
    const inserted = insertSilenceRevision(document, 2, 0.5);
    expect(inserted.tracks[0].clips[0].edits.at(-1)).toEqual({ type: 'insertSilence', atSeconds: 2, durationSeconds: 0.5 });
    expect(inserted.markers[0].seconds).toBe(3.5);
    expect(inserted.regions[0]).toMatchObject({ startSeconds: 1, endSeconds: 4.5 });
    expect(inserted.selection).toEqual({ startSeconds: 2.5, endSeconds: 4.5 });
    expect(inserted.playhead).toBe(2.5);
  });

  it('stores temporal edits and annotation shifts on native sample frames', () => {
    const document = {
      ...single(2, 4),
      markers: [
        { id: 'before', label: 'Before', seconds: 0.24 },
        { id: 'start', label: 'Start', seconds: 0.26 },
        { id: 'inside', label: 'Inside', seconds: 0.5 },
        { id: 'end', label: 'End', seconds: 0.74 },
      ],
      regions: [{ id: 'r', label: 'Range', startSeconds: 0.26, endSeconds: 0.74 }],
      selection: { startSeconds: 0.26, endSeconds: 0.74 },
      playhead: 0.26,
    };
    const edits = (next: MasteringDocument) => next.tracks[0].clips[0].edits;
    expect(edits(appendAudioEditRevision(document, { type: 'reverse', startSeconds: 0.26, endSeconds: 0.74 })).at(-1)).toEqual({ type: 'reverse', startSeconds: 0.25, endSeconds: 0.75 });

    const cropped = cropProjectRevision(document, 0.26, 0.74);
    expect(edits(cropped).at(-1)).toEqual({ type: 'crop', startSeconds: 0.25, endSeconds: 0.75 });
    expect(cropped.markers.map((marker) => marker.seconds)).toEqual([0, 0, 0.25, 0.5]);
    expect(cropped.selection).toEqual({ startSeconds: 0, endSeconds: 0.5 });
    expect(cropped.playhead).toBe(0);

    const deleted = deleteRangeRevision(document, 0.26, 0.74);
    expect(edits(deleted).at(-1)).toEqual({ type: 'deleteRange', startSeconds: 0.25, endSeconds: 0.75 });
    expect(deleted.markers.map((marker) => marker.seconds)).toEqual([0.25, 0.25, 0.25]);
    expect(deleted.selection).toEqual({ startSeconds: 0.25, endSeconds: 0.25 });
    expect(deleted.playhead).toBe(0.25);

    const inserted = insertSilenceRevision(document, 0.26, 0.26);
    expect(edits(inserted).at(-1)).toEqual({ type: 'insertSilence', atSeconds: 0.25, durationSeconds: 0.25 });
    expect(inserted.markers.map((marker) => marker.seconds)).toEqual([0.5, 0.5, 0.75, 1]);
    expect(inserted.regions[0]).toMatchObject({ startSeconds: 0.5, endSeconds: 1 });
    expect(inserted.selection).toEqual({ startSeconds: 0.5, endSeconds: 1 });
    expect(inserted.playhead).toBe(0.5);
    expect(estimateDocumentDuration(inserted)).toBe(2.25);
    expect(edits(document)).toEqual([]);

    expect(edits(appendAudioEditRevision(document, { type: 'reverse', startSeconds: 0.26, endSeconds: 0.37 }))).toEqual([]);
    expect(edits(insertSilenceRevision(document, 0.26, 0.01))).toEqual([]);
  });

  it('maps timeline ranges into a clip that starts later and ripples following clips on that track only', () => {
    let document = addSourceTracksRevision(createMasteringDocument(), [
      { source: source('a', 4), trackId: 't1', clipId: 'a' },
      { source: source('b', 4), trackId: 't2', clipId: 'b' },
    ]);
    document = duplicateClipRevision(document, 'a', 'a2');
    document = moveClipRevision(document, 'a', 1);
    document = moveClipRevision(document, 'a2', 6);
    document = { ...document, activeClipId: 'a', markers: [{ id: 'late', label: 'Late', seconds: 7 }] };
    const deleted = deleteRangeRevision(document, 2, 3);
    expect(deleted.tracks[0].clips[0].edits).toEqual([{ type: 'deleteRange', startSeconds: 1, endSeconds: 2 }]);
    expect(deleted.tracks[0].clips[1].startSeconds).toBe(5);
    expect(deleted.tracks[1].clips[0].startSeconds).toBe(0);
    expect(deleted.markers[0].seconds).toBe(6);
    expect(clipDurationSeconds(deleted, deleted.tracks[0].clips[0])).toBe(3);
    const reset = resetClipEditsRevision(deleted);
    expect(reset.tracks[0].clips[0].edits).toEqual([]);
    expect(reset.tracks[0].clips[1].startSeconds).toBe(6);
  });
});

describe('clip placement, fades, and crossfades', () => {
  it('splits into two frame-exact halves, then duplicates, moves, nudges, and restores through history', () => {
    const original = single(8, 4);
    const split = splitClipRevision(original, 'c1', 3.13, 'right');
    const [left, right] = split.tracks[0].clips;
    expect(left.edits).toEqual([{ type: 'crop', startSeconds: 0, endSeconds: 3.25 }]);
    expect(right).toMatchObject({ id: 'right', startSeconds: 3.25, edits: [{ type: 'crop', startSeconds: 3.25, endSeconds: 8 }] });
    expect(split.activeClipId).toBe('right');
    expect(estimateDocumentDuration(split)).toBe(8);
    expect(splitClipRevision(original, 'c1', 0, 'x')).toEqual(original);

    const duplicated = duplicateClipRevision(split, 'right', 'copy');
    expect(duplicated.tracks[0].clips[2]).toMatchObject({ id: 'copy', startSeconds: 8, sourceId: 's', name: 's.wav copy' });
    const nudged = nudgeClipRevision(moveClipRevision(duplicated, 'copy', 10.1), 'copy', -1);
    expect(nudged.tracks[0].clips[2].startSeconds).toBe(9);
    expect(moveClipRevision(nudged, 'copy', -5).tracks[0].clips[2].startSeconds).toBe(0);

    const history = commitProjectRevision(createProjectHistory(original), split);
    expect(undoProjectRevision(history).present).toEqual(original);
    expect(redoProjectRevision(undoProjectRevision(history)).present).toEqual(split);
  });

  it('updates clip gain/pan/mute/name within bounds and moves clips between tracks', () => {
    let document = addSourceTracksRevision(createMasteringDocument(), [
      { source: source('a', 2), trackId: 't1', clipId: 'a' },
      { source: source('b', 2), trackId: 't2', clipId: 'b' },
    ]);
    document = updateClipRevision(document, 'a', { gainDb: -100, pan: 0.5, muted: true, name: 'Intro' });
    expect(document.tracks[0].clips[0]).toMatchObject({ gainDb: -60, pan: 0.5, muted: true, name: 'Intro' });
    document = moveClipToTrackRevision(document, 'a', 't2');
    expect(document.tracks[0].clips).toEqual([]);
    expect(document.tracks[1].clips.map((clip) => clip.id)).toEqual(['b', 'a']);
    document = deleteClipRevision(document, 'b');
    expect(document.sources.map((item) => item.id)).toEqual(['a']);
  });

  it('clamps fades so fade-in and fade-out never overlap', () => {
    let document = single(2);
    document = setClipFadeRevision(document, 'c1', 'in', { durationSeconds: 1.5, curve: 'sCurve' });
    document = setClipFadeRevision(document, 'c1', 'out', { durationSeconds: 1.5, curve: 'logarithmic' });
    expect(document.tracks[0].clips[0].fadeIn).toEqual({ durationSeconds: 1.5, curve: 'sCurve' });
    expect(document.tracks[0].clips[0].fadeOut).toEqual({ durationSeconds: 0.5, curve: 'logarithmic' });
  });

  it('creates a synchronized crossfade by overlapping two clips on one track', () => {
    let document = single(4);
    document = duplicateClipRevision(document, 'c1', 'c2');
    const faded = crossfadeClipsRevision(document, 'c1', 'c2', 0.5, 'equalPower');
    const [left, right] = faded.tracks[0].clips;
    expect(right.startSeconds).toBe(3.5);
    expect(left.fadeOut).toEqual({ durationSeconds: 0.5, curve: 'equalPower' });
    expect(right.fadeIn).toEqual({ durationSeconds: 0.5, curve: 'equalPower' });
    expect(estimateDocumentDuration(faded)).toBe(7.5);
    const edited = crossfadeClipsRevision(faded, 'c1', 'c2', 1, 'linear');
    expect(edited.tracks[0].clips[1].startSeconds).toBe(3);
    expect(edited.tracks[0].clips[0].fadeOut).toEqual(edited.tracks[0].clips[1].fadeIn);
    expect(() => crossfadeClipsRevision(document, 'c1', 'c2', 5, 'linear')).toThrow(/longest crossfade/);
    const other = addSourceTracksRevision(document, [{ source: source('x', 1), trackId: 't9', clipId: 'x' }]);
    expect(() => crossfadeClipsRevision(other, 'c1', 'x', 0.1, 'linear')).toThrow(/same track/);
  });
});
