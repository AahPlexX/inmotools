import { describe, expect, it } from 'vitest';
import {
  commitProjectRevision,
  createMasteringDocument,
  createProjectHistory,
  cropProjectRevision,
  duplicateClipRevision,
  moveClipRevision,
  nudgeClipRevision,
  splitClipRevision,
  deleteRangeRevision,
  insertSilenceRevision,
  redoProjectRevision,
  replaceProjectView,
  undoProjectRevision,
} from '../../src/tools/music/mastering-project';

describe('mastering project history', () => {
  it('creates a serializable document shell without embedding source PCM', () => {
    const document = createMasteringDocument({
      id: 'source-1',
      name: 'mix.wav',
      durationSeconds: 12,
      sampleRate: 48_000,
    });
    expect(document).toMatchObject({
      version: 1,
      source: { id: 'source-1', name: 'mix.wav', durationSeconds: 12, sampleRate: 48_000 },
      edits: [],
      markers: [],
      regions: [],
      tracks: [{
        id: 'source-1:track:1',
        name: 'Track 1',
        sourceId: 'source-1',
        gainDb: 0,
        pan: 0,
        muted: false,
        solo: false,
        clips: [{
          id: 'source-1:clip:1',
          sourceId: 'source-1',
          timelineStartSeconds: 0,
          sourceStartSeconds: 0,
          sourceEndSeconds: 12,
          gainDb: 0,
        }],
      }],
      metadataEdits: {},
      selection: { startSeconds: 0, endSeconds: 12 },
      playhead: 0,
    });
    expect(() => JSON.stringify(document)).not.toThrow();
  });

  it('rejects sources without a valid sample rate', () => {
    expect(() => createMasteringDocument({ id: 's', name: 'a.wav', durationSeconds: 1, sampleRate: 0 })).toThrow(RangeError);
    expect(() => createMasteringDocument({ id: 's', name: 'a.wav', durationSeconds: 1, sampleRate: Number.NaN })).toThrow(RangeError);
  });

  it('commits, undoes, and redoes one atomic audio plus annotation revision', () => {
    const initial = createMasteringDocument({ id: 's', name: 'a.wav', durationSeconds: 4, sampleRate: 48_000 });
    const history = createProjectHistory(initial);
    const changed = {
      ...history.present,
      edits: [{ type: 'gain' as const, gainDb: 3 }],
      markers: [{ id: 'm1', label: 'Hit', seconds: 1 }],
    };
    const committed = commitProjectRevision(history, changed);
    expect(committed.past).toHaveLength(1);
    expect(committed.future).toEqual([]);
    expect(committed.present.markers[0].label).toBe('Hit');

    const undone = undoProjectRevision(committed);
    expect(undone.present.edits).toEqual([]);
    expect(undone.present.markers).toEqual([]);
    expect(undone.future).toHaveLength(1);

    const redone = redoProjectRevision(undone);
    expect(redone.present).toEqual(committed.present);
    expect(redone.future).toEqual([]);
  });

  it('replaces selection/playhead view state without creating an undo step', () => {
    const history = createProjectHistory(createMasteringDocument({ id: 's', name: 'a.wav', durationSeconds: 4, sampleRate: 48_000 }));
    const moved = replaceProjectView(history, {
      selection: { startSeconds: 1, endSeconds: 2 },
      playhead: 1.5,
    });
    expect(moved.past).toHaveLength(0);
    expect(moved.present.selection).toEqual({ startSeconds: 1, endSeconds: 2 });
    expect(moved.present.playhead).toBe(1.5);
  });
  it('bounds history to 100 revisions and clears redo after a divergent commit', () => {
    let history = createProjectHistory(createMasteringDocument({ id: 's', name: 'a.wav', durationSeconds: 4, sampleRate: 48_000 }));
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
describe('atomic timeline transforms', () => {
  it('splits, duplicates, moves, and nudges clips while retaining source references in history', () => {
    const original = createMasteringDocument({ id: 's', name: 'a.wav', durationSeconds: 8, sampleRate: 4 });
    const sourceClip = original.tracks[0].clips[0];
    const split = splitClipRevision(original, sourceClip.id, 3.13, 'clip-right');
    expect(split.tracks[0].clips).toEqual([
      { ...sourceClip, sourceEndSeconds: 3.25 },
      { ...sourceClip, id: 'clip-right', timelineStartSeconds: 3.25, sourceStartSeconds: 3.25 },
    ]);
    expect(original.tracks[0].clips).toEqual([sourceClip]);

    const duplicated = duplicateClipRevision(split, 'clip-right', 'clip-copy');
    expect(duplicated.tracks[0].clips[2]).toEqual({
      ...split.tracks[0].clips[1],
      id: 'clip-copy',
      timelineStartSeconds: 8,
    });
    const moved = moveClipRevision(duplicated, 'clip-copy', 10);
    const nudged = nudgeClipRevision(moved, 'clip-copy', -1);
    expect(nudged.tracks[0].clips[2]).toMatchObject({
      id: 'clip-copy',
      sourceId: 's',
      sourceStartSeconds: 3.25,
      sourceEndSeconds: 8,
      timelineStartSeconds: 9,
    });
    const history = commitProjectRevision(createProjectHistory(original), split);
    expect(undoProjectRevision(history).present).toEqual(original);
    expect(redoProjectRevision(undoProjectRevision(history)).present).toEqual(split);
  });

  it('deletes a range and remaps markers, regions, selection, and playhead together', () => {
    const document = {
      ...createMasteringDocument({ id: 's', name: 'a.wav', durationSeconds: 10, sampleRate: 48_000 }),
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
    expect(deleted.edits.at(-1)).toEqual({ type: 'deleteRange', startSeconds: 3, endSeconds: 6 });
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
  });
  it('crops edits, markers, regions, selection, and playhead together', () => {
    const document = {
      ...createMasteringDocument({ id: 's', name: 'a.wav', durationSeconds: 10, sampleRate: 48_000 }),
      markers: [
        { id: 'before', label: 'Before', seconds: 1 },
        { id: 'inside', label: 'Inside', seconds: 4 },
      ],
      regions: [
        { id: 'overlap', label: 'Overlap', startSeconds: 2, endSeconds: 5 },
        { id: 'outside', label: 'Outside', startSeconds: 7, endSeconds: 9 },
      ],
      playhead: 4,
    };
    const cropped = cropProjectRevision(document, 3, 6);
    expect(cropped.edits.at(-1)).toEqual({ type: 'crop', startSeconds: 3, endSeconds: 6 });
    expect(cropped.markers).toEqual([{ id: 'inside', label: 'Inside', seconds: 1 }]);
    expect(cropped.regions).toEqual([{ id: 'overlap', label: 'Overlap', startSeconds: 0, endSeconds: 2 }]);
    expect(cropped.selection).toEqual({ startSeconds: 0, endSeconds: 3 });
    expect(cropped.playhead).toBe(1);
  });

  it('inserts silence and shifts every affected timeline annotation atomically', () => {
    const document = {
      ...createMasteringDocument({ id: 's', name: 'a.wav', durationSeconds: 5, sampleRate: 48_000 }),
      markers: [{ id: 'm', label: 'Later', seconds: 3 }],
      regions: [{ id: 'r', label: 'Range', startSeconds: 1, endSeconds: 4 }],
      selection: { startSeconds: 2, endSeconds: 4 },
      playhead: 2,
    };
    const inserted = insertSilenceRevision(document, 2, 0.5);
    expect(inserted.edits.at(-1)).toEqual({ type: 'insertSilence', atSeconds: 2, durationSeconds: 0.5 });
    expect(inserted.markers[0].seconds).toBe(3.5);
    expect(inserted.regions[0]).toMatchObject({ startSeconds: 1, endSeconds: 4.5 });
    expect(inserted.selection).toEqual({ startSeconds: 2.5, endSeconds: 4.5 });
    expect(inserted.playhead).toBe(2.5);
  });
});
