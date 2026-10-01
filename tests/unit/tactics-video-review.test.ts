import { describe, expect, it } from 'vitest';
import { commitTacticalProject, createTacticalHistory, undoTacticalProject } from '../../src/tools/tactics/editor-engine';
import { MAX_ASSET_BYTES } from '../../src/tools/tactics/project-io';
import { createStarterTacticalProject, validateTacticalProject } from '../../src/tools/tactics/tactics-engine';
import { migrateTacticalProject } from '../../src/tools/tactics/project-io';
import type { TacticalProject } from '../../src/tools/tactics/tactics-types';
import {
  VIDEO_IMPORT_MAX_BYTES,
  addMatchEvent,
  addOverlayAnchor,
  addOverlayTrack,
  addTelestration,
  addVideoClip,
  advancePlaylistPlayback,
  assertPlaybackRate,
  assertSupportedLocalVideo,
  attachLocalVideo,
  bindMediaElementListeners,
  createEmptyVideoReview,
  createLocalMediaObjectRegistry,
  createVideoPlaylist,
  detachLocalVideo,
  locatePlaylistTime,
  mediaErrorMessage,
  mediaTimeForSharedClock,
  movePlaylistClip,
  orderedPlaylistClips,
  removeMatchEvent,
  removeTelestration,
  removeVideoClip,
  recordLocalVideoDuration,
  resolveLocalVideoMimeType,
  reviewMsToSeconds,
  sampleOverlayPosition,
  sampleVideoPresentation,
  secondsToReviewMs,
  seekReviewTime,
  setAngleSyncAnchor,
  sharedTimeForMedia,
  startPlaylistPlayback,
  stepReviewTime,
} from '../../src/tools/tactics/video-review-engine';

const FIXED_NOW = () => '2026-09-28T00:00:00.000Z';

function openVideo(project: TacticalProject, id: string, role: 'primary' | 'comparison' = 'primary'): TacticalProject {
  return attachLocalVideo(project, {
    id,
    name: `${id}.webm`,
    mimeType: 'video/webm',
    sizeBytes: 128,
    role,
  }, FIXED_NOW);
}

describe('Tactical local video review', () => {
  it('keeps the local video byte limit aligned with portable ZIP assets', () => {
    expect(VIDEO_IMPORT_MAX_BYTES).toBe(MAX_ASSET_BYTES);
    expect(VIDEO_IMPORT_MAX_BYTES).toBe(128 * 1024 * 1024);
  });

  it('accepts browser-playable local video metadata and rejects unusable files', () => {
    expect(() => assertSupportedLocalVideo({
      name: 'Match.MP4',
      mimeType: 'VIDEO/MP4',
      sizeBytes: VIDEO_IMPORT_MAX_BYTES,
    })).not.toThrow();
    expect(() => assertSupportedLocalVideo({ name: 'clip.webm', mimeType: 'video/webm', sizeBytes: 1 })).not.toThrow();
    expect(() => assertSupportedLocalVideo({ name: 'clip.mov', mimeType: 'video/quicktime', sizeBytes: 1 })).not.toThrow();
    expect(() => assertSupportedLocalVideo({ name: 'clip.ogv', mimeType: 'video/ogg', sizeBytes: 1 })).not.toThrow();
    expect(() => assertSupportedLocalVideo({ name: '', mimeType: 'video/webm', sizeBytes: 1 })).toThrow(/name/i);
    expect(() => assertSupportedLocalVideo({ name: 'notes.txt', mimeType: 'text/plain', sizeBytes: 4 })).toThrow(/supported local video/i);
    expect(() => assertSupportedLocalVideo({ name: 'empty.webm', mimeType: 'video/webm', sizeBytes: 0 })).toThrow(/empty/i);
    expect(() => assertSupportedLocalVideo({
      name: 'huge.webm',
      mimeType: 'video/webm',
      sizeBytes: VIDEO_IMPORT_MAX_BYTES + 1,
    })).toThrow(/size limit/i);
    expect(resolveLocalVideoMimeType('clip.webm', '')).toBe('video/webm');
    expect(resolveLocalVideoMimeType('clip.mov', 'application/octet-stream')).toBe('video/quicktime');
    expect(resolveLocalVideoMimeType('notes.txt', 'text/plain')).toBe('text/plain');
    expect(() => assertSupportedLocalVideo({
      name: 'clip.webm',
      mimeType: resolveLocalVideoMimeType('clip.webm', ''),
      sizeBytes: 32,
    })).not.toThrow();
  });

  it('seeks and steps in integer milliseconds without exceeding the known duration', () => {
    expect(secondsToReviewMs(1.234)).toBe(1234);
    expect(reviewMsToSeconds(1234)).toBe(1.234);
    expect(() => secondsToReviewMs(Number.POSITIVE_INFINITY)).toThrow(/finite/i);
    expect(seekReviewTime(2_500, 2_000)).toBe(2_000);
    expect(seekReviewTime(0, 2_000)).toBe(0);
    expect(() => seekReviewTime(1.5, 2_000)).toThrow(/integer millisecond/i);
    expect(stepReviewTime(1_000, 2_000, 1, 30)).toBe(1_033);
    expect(stepReviewTime(20, 2_000, -1, 30)).toBe(0);
    expect(stepReviewTime(1_990, 2_000, 1, 25)).toBe(2_000);
    expect(() => stepReviewTime(0, 2_000, 0, 30)).toThrow(/frame/i);
    expect(assertPlaybackRate(1.25)).toBe(1.25);
    expect(() => assertPlaybackRate(3)).toThrow(/playback speed/i);
    expect(mediaErrorMessage(3)).toMatch(/decoded/i);
    expect(mediaErrorMessage(4)).toMatch(/cannot play/i);
    expect(mediaErrorMessage(null)).toMatch(/could not be reviewed/i);
  });

  it('stores non-destructive telestration and samples an immutable presentation copy', () => {
    const project = openVideo(createStarterTacticalProject(), 'angle-a');
    const stroke = {
      id: 'draw-1',
      mediaId: 'angle-a',
      kind: 'arrow' as const,
      startMs: 100,
      endMs: 800,
      points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.8 }],
      color: '#155E9C',
      label: 'Press lane',
    };
    const review = addTelestration(project.videoReview, stroke);
    expect(project.videoReview.telestrations).toEqual([]);
    const visible = sampleVideoPresentation(review, 'angle-a', 100);
    const hidden = sampleVideoPresentation(review, 'angle-a', 801);
    expect(visible.telestrations).toHaveLength(1);
    expect(hidden.telestrations).toEqual([]);
    visible.telestrations[0]!.points[0]!.x = 0.9;
    expect(review.telestrations[0]!.points[0]!.x).toBe(0.1);
    expect(() => addTelestration(review, { ...stroke, id: 'draw-2', points: [{ x: 1.2, y: 0 }] })).toThrow(/normalized/i);
    expect(() => addTelestration(review, { ...stroke, id: 'draw-3', endMs: 50 })).toThrow(/range/i);
    expect(removeTelestration(review, 'draw-1').telestrations).toEqual([]);
  });

  it('interpolates manual overlay anchors and holds authored positions', () => {
    let review = createEmptyVideoReview();
    review = addOverlayTrack(review, {
      id: 'track-1',
      mediaId: 'angle-a',
      label: 'Runner',
      startMs: 0,
      endMs: 1_000,
      interpolation: 'linear',
      anchors: [],
    });
    review = addOverlayAnchor(review, 'track-1', { id: 'a1', timeMs: 200, position: { x: 0, y: 0 } });
    review = addOverlayAnchor(review, 'track-1', { id: 'a2', timeMs: 800, position: { x: 1, y: 0.5 } });
    const track = review.overlayTracks[0]!;
    expect(sampleOverlayPosition(track, -1)).toBeNull();
    expect(sampleOverlayPosition(track, 1_001)).toBeNull();
    expect(sampleOverlayPosition(track, 100)).toBeNull();
    expect(sampleOverlayPosition(track, 500)).toEqual({ x: 0.5, y: 0.25 });
    const held = { ...track, interpolation: 'hold' as const };
    expect(sampleOverlayPosition(held, 500)).toEqual({ x: 0, y: 0 });
    expect(sampleOverlayPosition(held, 800)).toEqual({ x: 1, y: 0.5 });
    expect(() => addOverlayAnchor(review, 'track-1', { id: 'a3', timeMs: 200, position: { x: 0.2, y: 0.2 } })).toThrow(/anchor time/i);
    const presentation = sampleVideoPresentation(review, 'angle-a', 500);
    expect(presentation.tracks[0]?.position).toEqual({ x: 0.5, y: 0.25 });
    presentation.tracks[0]!.position!.x = 0;
    expect(sampleOverlayPosition(track, 500)?.x).toBe(0.5);
  });

  it('tags match events in time order and builds an ordered clip playlist', () => {
    let review = createEmptyVideoReview();
    review = addMatchEvent(review, { id: 'e2', mediaId: 'angle-a', timeMs: 900, kind: 'shot', label: 'Far-post shot' });
    review = addMatchEvent(review, { id: 'e1', mediaId: 'angle-a', timeMs: 200, kind: 'turnover', label: 'Midfield loss' });
    expect(sampleVideoPresentation(review, 'angle-a', 200).events.map((event) => event.id)).toEqual(['e1']);
    expect(review.events.map((event) => event.id)).toEqual(['e1', 'e2']);
    review = addVideoClip(review, { id: 'c1', mediaId: 'angle-a', label: 'Press', startMs: 100, endMs: 400 });
    review = addVideoClip(review, { id: 'c2', mediaId: 'angle-a', label: 'Shot', startMs: 800, endMs: 1_000 });
    review = createVideoPlaylist(review, { id: 'pl1', name: 'Attacking moments', clipIds: ['c2', 'c1'] });
    expect(orderedPlaylistClips(review, 'pl1').map((clip) => clip.id)).toEqual(['c2', 'c1']);
    review = movePlaylistClip(review, 'pl1', 'c1', -1);
    expect(orderedPlaylistClips(review, 'pl1').map((clip) => clip.id)).toEqual(['c1', 'c2']);
    const clips = orderedPlaylistClips(review, 'pl1');
    expect(locatePlaylistTime(clips, 0)).toEqual({ clipId: 'c1', mediaTimeMs: 100 });
    expect(locatePlaylistTime(clips, 300)).toEqual({ clipId: 'c2', mediaTimeMs: 800 });
    expect(locatePlaylistTime(clips, 500)).toEqual({ clipId: 'c2', mediaTimeMs: 1_000 });
    expect(locatePlaylistTime(clips, 501)).toBeNull();
    expect(startPlaylistPlayback(clips)).toEqual({ index: 0, mediaTimeMs: 100, complete: false });
    expect(advancePlaylistPlayback(clips, 0, 399)).toEqual({ index: 0, mediaTimeMs: 399, complete: false });
    expect(advancePlaylistPlayback(clips, 0, 400)).toEqual({ index: 1, mediaTimeMs: 800, complete: false });
    expect(advancePlaylistPlayback(clips, 1, 1_000)).toEqual({ index: 1, mediaTimeMs: 1_000, complete: true });
    expect(() => addVideoClip(review, { id: 'c3', mediaId: 'angle-a', label: 'Bad', startMs: 50, endMs: 50 })).toThrow(/range/i);
    const withoutEvent = removeMatchEvent(review, 'e1');
    expect(withoutEvent.events.map((event) => event.id)).toEqual(['e2']);
    const withoutClip = removeVideoClip(review, 'c1');
    expect(withoutClip.clips.map((clip) => clip.id)).toEqual(['c2']);
    expect(orderedPlaylistClips(withoutClip, 'pl1').map((clip) => clip.id)).toEqual(['c2']);
  });

  it('synchronizes comparison angles from a manual anchor only', () => {
    let review = createEmptyVideoReview();
    review = setAngleSyncAnchor(review, { mediaId: 'angle-b', mediaTimeMs: 5_000, sharedTimeMs: 1_000 });
    const anchor = review.syncAnchors[0]!;
    expect(mediaTimeForSharedClock(anchor, 1_000, 8_000)).toBe(5_000);
    expect(mediaTimeForSharedClock(anchor, 0, 8_000)).toBe(4_000);
    expect(mediaTimeForSharedClock(anchor, 4_000, 5_500)).toBe(5_500);
    expect(sharedTimeForMedia(anchor, 5_000)).toBe(1_000);
    review = setAngleSyncAnchor(review, { mediaId: 'angle-b', mediaTimeMs: 100, sharedTimeMs: 100 });
    expect(review.syncAnchors).toHaveLength(1);
    expect(review.syncAnchors[0]).toMatchObject({ mediaTimeMs: 100, sharedTimeMs: 100 });
    expect(mediaTimeForSharedClock(anchor, 0, null)).toBe(4_000);
  });

  it('attaches local video on the project, records duration, and releases review data with the media', () => {
    const starter = createStarterTacticalProject();
    const attached = openVideo(starter, 'angle-a');
    expect(starter.media).toEqual([]);
    expect(attached.media[0]).toMatchObject({ id: 'angle-a', mimeType: 'video/webm', sizeBytes: 128 });
    expect(attached.videoReview.activeMediaId).toBe('angle-a');
    expect(attached.importProvenance.at(-1)).toMatchObject({
      sourceType: 'local-media',
      sourceName: 'angle-a.webm',
      importedAt: '2026-09-28T00:00:00.000Z',
    });
    const timed = recordLocalVideoDuration(attached, 'angle-a', 2_000);
    expect(timed.media[0]?.durationMs).toBe(2_000);
    expect(recordLocalVideoDuration(timed, 'angle-a', 2_000)).toBe(timed);
    const compared = openVideo(timed, 'angle-b', 'comparison');
    let review = addTelestration(compared.videoReview, {
      id: 'draw-a',
      mediaId: 'angle-a',
      kind: 'text',
      startMs: 0,
      endMs: 100,
      points: [{ x: 0.5, y: 0.5 }],
      color: '#155E9C',
      label: 'Keep',
    });
    review = addTelestration(review, {
      id: 'draw-b',
      mediaId: 'angle-b',
      kind: 'text',
      startMs: 0,
      endMs: 100,
      points: [{ x: 0.2, y: 0.2 }],
      color: '#155E9C',
      label: 'Drop',
    });
    review = setAngleSyncAnchor(review, { mediaId: 'angle-b', mediaTimeMs: 10, sharedTimeMs: 0 });
    const removed = detachLocalVideo({ ...compared, videoReview: review }, 'angle-b');
    expect(removed.media.map((item) => item.id)).toEqual(['angle-a']);
    expect(removed.videoReview.comparisonMediaId).toBeNull();
    expect(removed.videoReview.telestrations.map((item) => item.id)).toEqual(['draw-a']);
    expect(removed.videoReview.syncAnchors).toEqual([]);
    expect(validateTacticalProject(removed)).toEqual([]);
  });

  it('does not record review scrubbing in undo history', () => {
    const opened = openVideo(createStarterTacticalProject(), 'angle-a');
    let history = createTacticalHistory(opened);
    const scrubbed = seekReviewTime(400, 2_000);
    expect(scrubbed).toBe(400);
    expect(history.past).toEqual([]);
    expect(history.present).toBe(opened);
    history = commitTacticalProject(history, 'Tag event', (current) => ({
      ...current,
      videoReview: addMatchEvent(current.videoReview, {
        id: 'goal-1',
        mediaId: 'angle-a',
        timeMs: 400,
        kind: 'goal',
        label: 'Near-post goal',
      }),
    }));
    expect(history.past).toHaveLength(1);
    history = undoTacticalProject(history);
    expect(history.present.videoReview.events).toEqual([]);
    expect(history.present.media[0]?.id).toBe('angle-a');
  });

  it('defaults missing video review state inside schema v2 and rejects broken review documents', () => {
    const current = createStarterTacticalProject();
    const legacy = structuredClone(current) as unknown as Record<string, unknown>;
    delete legacy.videoReview;
    const migrated = migrateTacticalProject(legacy);
    expect(migrated.videoReview).toEqual(createEmptyVideoReview());
    expect(validateTacticalProject(migrated)).toEqual([]);

    const broken = openVideo(createStarterTacticalProject(), 'angle-a');
    broken.videoReview = addTelestration(broken.videoReview, {
      id: 'draw-1',
      mediaId: 'missing-media',
      kind: 'line',
      startMs: 0,
      endMs: 10,
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      color: '#155E9C',
    });
    expect(validateTacticalProject(broken).join(' ')).toMatch(/missing-media/);
  });

  it('creates and revokes object URLs once and detaches media listeners', () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const registry = createLocalMediaObjectRegistry(
      () => {
        const url = `blob:local-${created.length + 1}`;
        created.push(url);
        return url;
      },
      (url) => { revoked.push(url); },
    );
    const blob = new Blob(['video'], { type: 'video/webm' });
    const first = registry.bind('angle-a', blob);
    const second = registry.bind('angle-b', blob);
    expect(first.objectUrl).not.toBe(second.objectUrl);
    registry.release(first);
    registry.release(first);
    registry.releaseAll();
    expect(revoked).toEqual(['blob:local-1', 'blob:local-2']);
    expect(registry.size).toBe(0);

    const calls: string[] = [];
    const listeners = new Map<string, Set<() => void>>();
    const target = {
      addEventListener(type: string, listener: () => void) {
        const group = listeners.get(type) ?? new Set<() => void>();
        group.add(listener);
        listeners.set(type, group);
      },
      removeEventListener(type: string, listener: () => void) {
        listeners.get(type)?.delete(listener);
      },
    };
    const detach = bindMediaElementListeners(target, {
      onLoadedMetadata: () => { calls.push('metadata'); },
      onTimeUpdate: () => { calls.push('time'); },
      onError: () => { calls.push('error'); },
      onEnded: () => { calls.push('ended'); },
    });
    listeners.get('loadedmetadata')?.forEach((listener) => listener());
    expect(calls).toEqual(['metadata']);
    detach();
    detach();
    listeners.get('timeupdate')?.forEach((listener) => listener());
    expect(calls).toEqual(['metadata']);
    expect(listeners.get('loadedmetadata')?.size ?? 0).toBe(0);
  });
});
