import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createNormalizedPoint } from './pitch-engine';
import type {
  NormalizedPoint,
  TacticalProject,
  TelestrationKind,
  TelestrationStroke,
  VideoClip,
} from './tactics-types';
import {
  VIDEO_PLAYBACK_RATES,
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
  createLocalMediaObjectRegistry,
  createVideoPlaylist,
  detachLocalVideo,
  mediaErrorMessage,
  mediaTimeForSharedClock,
  movePlaylistClip,
  nextVideoReviewId,
  orderedPlaylistClips,
  recordLocalVideoDuration,
  removeMatchEvent,
  removeTelestration,
  removeVideoClip,
  resolveLocalVideoMimeType,
  reviewMsToSeconds,
  sampleOverlayPosition,
  sampleVideoPresentation,
  secondsToReviewMs,
  seekReviewTime,
  setAngleSyncAnchor,
  startPlaylistPlayback,
  stepReviewTime,
  type PlaylistPlaybackCursor,
} from './video-review-engine';

interface TacticalVideoPanelProps {
  project: TacticalProject;
  onEdit: (label: string, updater: (current: TacticalProject) => TacticalProject, message: string) => void;
  onStatus: (message: string) => void;
}

interface PlaylistRun {
  playlistId: string;
  clips: VideoClip[];
  cursor: PlaylistPlaybackCursor;
}

const STROKE_COLORS = [
  { label: 'Blue', value: '#155E9C' },
  { label: 'Brown', value: '#7A4E00' },
  { label: 'Purple', value: '#6B2D5B' },
] as const;

const EVENT_KINDS = ['goal', 'shot', 'chance', 'turnover', 'foul', 'set-piece', 'press', 'transition', 'coaching-note'] as const;
const SILENT_CAPTION_TRACK = `data:text/vtt,${encodeURIComponent('WEBVTT\n\n00:00.000 --> 99:59.000\nNo spoken audio in this local review.\n')}`;

function message(error: unknown): string {
  return error instanceof Error ? error.message : mediaErrorMessage(null);
}

function integerField(raw: string, label: string): number {
  if (!/^\d+$/.test(raw.trim())) throw new RangeError(`${label} must be a non-negative integer millisecond value.`);
  return Number(raw.trim());
}

function percentPoint(xRaw: string, yRaw: string): NormalizedPoint {
  const x = Number(xRaw);
  const y = Number(yRaw);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('Enter X and Y percentages from 0 to 100.');
  return createNormalizedPoint(x / 100, y / 100);
}

function fileInput(file: File): { name: string; mimeType: string; sizeBytes: number; blob: File } {
  const mimeType = resolveLocalVideoMimeType(file.name, file.type || '');
  const descriptor = { name: file.name, mimeType, sizeBytes: file.size };
  assertSupportedLocalVideo(descriptor);
  return { ...descriptor, blob: file };
}

function TelestrationShape({ stroke }: { stroke: TelestrationStroke }) {
  const start = stroke.points[0];
  const end = stroke.points[1];
  if (!start) return null;
  if (stroke.kind === 'text') {
    return <text x={start.x} y={start.y} fill={stroke.color} fontSize={0.07}>{stroke.label}</text>;
  }
  if (stroke.kind === 'freehand') {
    return <polyline points={stroke.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={0.012} />;
  }
  if (!end) return null;
  if (stroke.kind === 'circle') {
    return <ellipse cx={start.x} cy={start.y} rx={Math.max(0.01, Math.abs(end.x - start.x))} ry={Math.max(0.01, Math.abs(end.y - start.y))} fill="none" stroke={stroke.color} strokeWidth={0.012} />;
  }
  return (
    <g>
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={stroke.color} strokeWidth={0.012} />
      {stroke.kind === 'arrow' ? <circle cx={end.x} cy={end.y} r={0.025} fill={stroke.color} /> : null}
    </g>
  );
}

export default function TacticalVideoPanel({ project, onEdit, onStatus }: TacticalVideoPanelProps) {
  const review = project.videoReview;
  const primary = project.media.find((item) => item.id === review.activeMediaId) ?? null;
  const comparison = project.media.find((item) => item.id === review.comparisonMediaId) ?? null;
  const registryRef = useRef(createLocalMediaObjectRegistry(
    (blob) => URL.createObjectURL(blob),
    (url) => URL.revokeObjectURL(url),
  ));
  const onEditRef = useRef(onEdit);
  const primaryVideoRef = useRef<HTMLVideoElement | null>(null);
  const comparisonVideoRef = useRef<HTMLVideoElement | null>(null);
  const playlistRunRef = useRef<PlaylistRun | null>(null);
  const [primaryUrl, setPrimaryUrl] = useState<string | null>(null);
  const [comparisonUrl, setComparisonUrl] = useState<string | null>(null);
  const [reviewTimeMs, setReviewTimeMs] = useState(0);
  const [comparisonTimeMs, setComparisonTimeMs] = useState(0);
  const [timeDraft, setTimeDraft] = useState('0');
  const [frameRate, setFrameRate] = useState(30);
  const [playbackRate, setPlaybackRate] = useState<(typeof VIDEO_PLAYBACK_RATES)[number]>(1);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [drawMode, setDrawMode] = useState(false);
  const [freehandPoints, setFreehandPoints] = useState<NormalizedPoint[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [playlistRun, setPlaylistRun] = useState<PlaylistRun | null>(null);

  useEffect(() => { onEditRef.current = onEdit; }, [onEdit]);
  useEffect(() => () => { registryRef.current.releaseAll(); }, []);
  useEffect(() => { playlistRunRef.current = playlistRun; }, [playlistRun]);

  useEffect(() => {
    const registry = registryRef.current;
    if (!primary?.blob) {
      setPrimaryUrl(null);
      return undefined;
    }
    const binding = registry.bind(primary.id, primary.blob);
    setPrimaryUrl(binding.objectUrl);
    return () => { registry.release(binding); };
  }, [primary?.blob, primary?.id]);

  useEffect(() => {
    const registry = registryRef.current;
    if (!comparison?.blob) {
      setComparisonUrl(null);
      return undefined;
    }
    const binding = registry.bind(comparison.id, comparison.blob);
    setComparisonUrl(binding.objectUrl);
    return () => { registry.release(binding); };
  }, [comparison?.blob, comparison?.id]);

  useEffect(() => {
    const element = primaryVideoRef.current;
    if (!element || !primaryUrl || !primary) return undefined;
    const detach = bindMediaElementListeners(element, {
      onLoadedMetadata: () => {
        try {
          const durationMs = secondsToReviewMs(element.duration);
          onEditRef.current(
            'Record local video duration',
            (current) => recordLocalVideoDuration(current, primary.id, durationMs),
            `Local video duration is ${durationMs} ms.`,
          );
          setError('');
        } catch (caught) {
          setError(message(caught));
        }
      },
      onTimeUpdate: () => {
        try {
          const timeMs = secondsToReviewMs(element.currentTime);
          setReviewTimeMs(timeMs);
          setTimeDraft(String(timeMs));
          const run = playlistRunRef.current;
          if (!run || run.clips[run.cursor.index]?.mediaId !== primary.id) return;
          const next = advancePlaylistPlayback(run.clips, run.cursor.index, timeMs);
          if (next.complete) {
            element.pause();
            setPlaying(false);
            setPlaylistRun(null);
            onStatus('Playlist finished.');
            return;
          }
          if (next.index !== run.cursor.index) {
            element.currentTime = reviewMsToSeconds(next.mediaTimeMs);
            setPlaylistRun({ ...run, cursor: next });
          }
        } catch (caught) {
          setError(message(caught));
        }
      },
      onError: () => {
        setPlaying(false);
        setError(mediaErrorMessage(element.error?.code ?? null));
      },
      onEnded: () => setPlaying(false),
    });
    if (element.readyState >= 1 && Number.isFinite(element.duration)) {
      try {
        const durationMs = secondsToReviewMs(element.duration);
        onEditRef.current(
          'Record local video duration',
          (current) => recordLocalVideoDuration(current, primary.id, durationMs),
          `Local video duration is ${durationMs} ms.`,
        );
      } catch (caught) {
        setError(message(caught));
      }
    }
    if (element.error) setError(mediaErrorMessage(element.error.code));
    return () => { detach(); };
  }, [onStatus, primary, primaryUrl]);

  useEffect(() => {
    const element = comparisonVideoRef.current;
    if (!element || !comparisonUrl || !comparison) return undefined;
    const detach = bindMediaElementListeners(element, {
      onLoadedMetadata: () => {
        try {
          const durationMs = secondsToReviewMs(element.duration);
          onEditRef.current(
            'Record comparison duration',
            (current) => recordLocalVideoDuration(current, comparison.id, durationMs),
            `Comparison angle duration is ${durationMs} ms.`,
          );
        } catch (caught) {
          setError(message(caught));
        }
      },
      onTimeUpdate: () => {
        try {
          setComparisonTimeMs(secondsToReviewMs(element.currentTime));
        } catch (caught) {
          setError(message(caught));
        }
      },
      onError: () => setError(mediaErrorMessage(element.error?.code ?? null)),
      onEnded: () => undefined,
    });
    if (element.readyState >= 1 && Number.isFinite(element.duration)) {
      try {
        const durationMs = secondsToReviewMs(element.duration);
        onEditRef.current(
          'Record comparison duration',
          (current) => recordLocalVideoDuration(current, comparison.id, durationMs),
          `Comparison angle duration is ${durationMs} ms.`,
        );
      } catch (caught) {
        setError(message(caught));
      }
    }
    if (element.error) setError(mediaErrorMessage(element.error.code));
    return () => { detach(); };
  }, [comparison, comparisonUrl]);

  const syncAnchor = comparison
    ? review.syncAnchors.find((anchor) => anchor.mediaId === comparison.id) ?? null
    : null;

  useEffect(() => {
    const element = comparisonVideoRef.current;
    if (!element || !comparison || !syncAnchor || comparison.durationMs == null) return;
    try {
      const mediaMs = mediaTimeForSharedClock(syncAnchor, reviewTimeMs, comparison.durationMs);
      const seconds = reviewMsToSeconds(mediaMs);
      if (Math.abs(element.currentTime - seconds) > 0.045) element.currentTime = seconds;
      setComparisonTimeMs(mediaMs);
    } catch (caught) {
      setError(message(caught));
    }
  }, [comparison, reviewTimeMs, syncAnchor]);

  const presentation = useMemo(
    () => primary ? sampleVideoPresentation(review, primary.id, reviewTimeMs) : null,
    [primary, review, reviewTimeMs],
  );
  const activeTrack = review.overlayTracks.find((track) => track.id === selectedTrackId) ?? review.overlayTracks[0] ?? null;
  const activePlaylist = review.playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? review.playlists[0] ?? null;
  const playlistClips = activePlaylist ? orderedPlaylistClips(review, activePlaylist.id) : [];
  const sampledTrack = activeTrack ? sampleOverlayPosition(activeTrack, reviewTimeMs) : null;

  function openFile(file: File, role: 'primary' | 'comparison') {
    try {
      const descriptor = fileInput(file);
      const id = nextVideoReviewId(role === 'primary' ? 'video' : 'angle', project.media.map((item) => item.id));
      onEdit(
        role === 'primary' ? 'Open local video' : 'Open comparison angle',
        (current) => attachLocalVideo(current, { ...descriptor, id, role }),
        role === 'primary' ? `Opened ${descriptor.name} for local review.` : `Opened comparison angle ${descriptor.name}.`,
      );
      setError('');
      if (role === 'primary') {
        setReviewTimeMs(0);
        setTimeDraft('0');
        setPlaying(false);
        setPlaylistRun(null);
      }
    } catch (caught) {
      setError(message(caught));
    }
  }

  function onFileChange(role: 'primary' | 'comparison') {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) openFile(file, role);
    };
  }

  function assertInsidePrimary(timeMs: number, label: string) {
    if (primary?.durationMs == null) throw new RangeError('Video duration is not available yet.');
    if (timeMs > primary.durationMs) throw new RangeError(`${label} must stay inside the local video.`);
    return timeMs;
  }

  function seekPrimary(timeMs: number) {
    if (primary?.durationMs == null) {
      setError('Video duration is not available yet.');
      return;
    }
    try {
      const next = seekReviewTime(timeMs, primary.durationMs);
      setReviewTimeMs(next);
      setTimeDraft(String(next));
      const element = primaryVideoRef.current;
      if (element) element.currentTime = reviewMsToSeconds(next);
      setError('');
    } catch (caught) {
      setError(message(caught));
    }
  }

  function step(frames: number) {
    if (primary?.durationMs == null) {
      setError('Video duration is not available yet.');
      return;
    }
    try {
      seekPrimary(stepReviewTime(reviewTimeMs, primary.durationMs, frames, frameRate));
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function togglePlayback() {
    const element = primaryVideoRef.current;
    if (!element || primary?.durationMs == null) {
      setError('Video duration is not available yet.');
      return;
    }
    if (!element.paused) {
      element.pause();
      setPlaying(false);
      return;
    }
    try {
      element.playbackRate = assertPlaybackRate(playbackRate);
      await element.play();
      setPlaying(true);
      setError('');
    } catch (caught) {
      setPlaying(false);
      setError(message(caught));
    }
  }

  function submitTelestration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!primary) return;
    const form = new FormData(event.currentTarget);
    try {
      const kind = String(form.get('kind')) as TelestrationKind;
      const startMs = assertInsidePrimary(integerField(String(form.get('start') ?? reviewTimeMs), 'Telestration start'), 'Telestration start');
      const endMs = assertInsidePrimary(integerField(String(form.get('end') ?? startMs), 'Telestration end'), 'Telestration end');
      const color = String(form.get('color') ?? STROKE_COLORS[0].value);
      const label = String(form.get('label') ?? '').trim();
      const points = kind === 'freehand'
        ? freehandPoints
        : kind === 'text'
          ? [percentPoint(String(form.get('x') ?? ''), String(form.get('y') ?? ''))]
          : [
              percentPoint(String(form.get('x') ?? ''), String(form.get('y') ?? '')),
              percentPoint(String(form.get('x2') ?? ''), String(form.get('y2') ?? '')),
            ];
      const id = nextVideoReviewId('draw', review.telestrations.map((stroke) => stroke.id));
      onEdit('Add telestration', (current) => ({
        ...current,
        videoReview: addTelestration(current.videoReview, {
          id,
          mediaId: primary.id,
          kind,
          startMs,
          endMs,
          points,
          color,
          ...(label ? { label } : {}),
        }),
      }), 'Saved a telestration stroke on the local video.');
      setFreehandPoints([]);
      setError('');
    } catch (caught) {
      setError(message(caught));
    }
  }

  function addFreehandPoint(point: NormalizedPoint) {
    setFreehandPoints((current) => {
      const previous = current[current.length - 1];
      if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 0.01) return current;
      return [...current, point].slice(-2_000);
    });
  }

  function onOverlayPointer(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drawMode) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    addFreehandPoint(createNormalizedPoint(x, y));
  }

  function submitTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!primary) return;
    const form = new FormData(event.currentTarget);
    try {
      const id = nextVideoReviewId('track', review.overlayTracks.map((track) => track.id));
      onEdit('Add overlay track', (current) => ({
        ...current,
        videoReview: addOverlayTrack(current.videoReview, {
          id,
          mediaId: primary.id,
          label: String(form.get('label') ?? ''),
          startMs: assertInsidePrimary(integerField(String(form.get('start') ?? ''), 'Track start'), 'Track start'),
          endMs: assertInsidePrimary(integerField(String(form.get('end') ?? ''), 'Track end'), 'Track end'),
          interpolation: String(form.get('interpolation')) === 'hold' ? 'hold' : 'linear',
          anchors: [],
        }),
      }), 'Added a manual overlay track.');
      setSelectedTrackId(id);
      setError('');
    } catch (caught) {
      setError(message(caught));
    }
  }

  function submitAnchor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTrack) return;
    const form = new FormData(event.currentTarget);
    try {
      const id = nextVideoReviewId('anchor', activeTrack.anchors.map((anchor) => anchor.id));
      onEdit('Add overlay anchor', (current) => ({
        ...current,
        videoReview: addOverlayAnchor(current.videoReview, activeTrack.id, {
          id,
          timeMs: assertInsidePrimary(integerField(String(form.get('time') ?? reviewTimeMs), 'Anchor time'), 'Anchor time'),
          position: percentPoint(String(form.get('x') ?? ''), String(form.get('y') ?? '')),
        }),
      }), 'Added a manual tracking anchor.');
      setError('');
    } catch (caught) {
      setError(message(caught));
    }
  }

  function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!primary) return;
    const form = new FormData(event.currentTarget);
    try {
      const id = nextVideoReviewId('event', review.events.map((item) => item.id));
      const kind = String(form.get('kind'));
      onEdit('Tag match event', (current) => ({
        ...current,
        videoReview: addMatchEvent(current.videoReview, {
          id,
          mediaId: primary.id,
          timeMs: assertInsidePrimary(integerField(String(form.get('time') ?? reviewTimeMs), 'Event time'), 'Event time'),
          kind: EVENT_KINDS.find((item) => item === kind) ?? 'coaching-note',
          label: String(form.get('label') ?? ''),
        }),
      }), 'Tagged a match event on the local video.');
      setError('');
    } catch (caught) {
      setError(message(caught));
    }
  }

  function submitClip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!primary) return;
    const form = new FormData(event.currentTarget);
    try {
      const id = nextVideoReviewId('clip', review.clips.map((clip) => clip.id));
      onEdit('Add video clip', (current) => ({
        ...current,
        videoReview: addVideoClip(current.videoReview, {
          id,
          mediaId: primary.id,
          label: String(form.get('label') ?? ''),
          startMs: assertInsidePrimary(integerField(String(form.get('start') ?? ''), 'Clip start'), 'Clip start'),
          endMs: assertInsidePrimary(integerField(String(form.get('end') ?? ''), 'Clip end'), 'Clip end'),
        }),
      }), 'Added a local review clip.');
      setError('');
    } catch (caught) {
      setError(message(caught));
    }
  }

  function submitPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const clipIds = review.clips.filter((clip) => form.get(`clip-${clip.id}`) === 'on').map((clip) => clip.id);
    try {
      const id = nextVideoReviewId('playlist', review.playlists.map((playlist) => playlist.id));
      onEdit('Create clip playlist', (current) => ({
        ...current,
        videoReview: createVideoPlaylist(current.videoReview, {
          id,
          name: String(form.get('name') ?? ''),
          clipIds,
        }),
      }), 'Created a local clip playlist.');
      setSelectedPlaylistId(id);
      setError('');
    } catch (caught) {
      setError(message(caught));
    }
  }

  function playPlaylist() {
    if (!activePlaylist) return;
    const clips = orderedPlaylistClips(review, activePlaylist.id);
    const cursor = startPlaylistPlayback(clips);
    if (!cursor) return;
    setPlaylistRun({ playlistId: activePlaylist.id, clips, cursor });
    seekPrimary(cursor.mediaTimeMs);
    void togglePlayback();
  }

  function submitSync(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comparison) return;
    const form = new FormData(event.currentTarget);
    try {
      if (comparison.durationMs == null) throw new RangeError('Comparison duration is not available yet.');
      const mediaTimeMs = integerField(String(form.get('angle') ?? ''), 'Angle time');
      if (mediaTimeMs > comparison.durationMs) throw new RangeError('Angle time must stay inside the comparison video.');
      onEdit('Set angle sync anchor', (current) => ({
        ...current,
        videoReview: setAngleSyncAnchor(current.videoReview, {
          mediaId: comparison.id,
          sharedTimeMs: integerField(String(form.get('shared') ?? ''), 'Shared time'),
          mediaTimeMs,
        }),
      }), 'Set a manual multi-angle sync anchor.');
      setError('');
    } catch (caught) {
      setError(message(caught));
    }
  }

  const durationLabel = primary?.durationMs == null ? 'Duration unavailable' : `${primary.durationMs} ms`;
  const offsetLabel = syncAnchor ? `${syncAnchor.mediaTimeMs - syncAnchor.sharedTimeMs} ms` : 'Not set';

  return (
    <details className="tactical-setup tactical-video-panel" id="tactical-video-panel">
      <summary>Local video review</summary>
      <div className="tactical-video-body">
        <p className="tactical-video-note">
          Local files stay in this browser. Drawings, tags, clips, and sync anchors are project notes on top of the video. Tracking follows only the anchors you enter.
        </p>
        {error ? <p className="tactical-video-error" role="alert">{error}</p> : null}
        <div className="tactical-video-open">
          <label>
            Open local match video
            <input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.ogv,.ogg,.mov" onChange={onFileChange('primary')} />
          </label>
          <label>
            Open comparison angle
            <input type="file" accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.ogv,.ogg,.mov" onChange={onFileChange('comparison')} disabled={!primary} />
          </label>
          <button type="button" className="action-button secondary" disabled={!primary} onClick={() => {
            if (!primary) return;
            onEdit('Remove local video', (current) => detachLocalVideo(current, primary.id), 'Removed the local video and its review notes.');
            setPlaying(false);
            setPlaylistRun(null);
          }}>
            Remove local video
          </button>
          <button type="button" className="action-button secondary" disabled={!comparison} onClick={() => {
            if (!comparison) return;
            onEdit('Remove comparison angle', (current) => detachLocalVideo(current, comparison.id), 'Removed the comparison angle.');
          }}>
            Remove comparison angle
          </button>
        </div>

        <div className="tactical-video-stage-grid">
          <figure className="tactical-video-stage">
            <div className="tactical-video-frame">
              <video
                ref={primaryVideoRef}
                data-testid="tactical-review-video"
                src={primaryUrl ?? undefined}
                playsInline
                preload="metadata"
                aria-label={primary ? `Local review video ${primary.name}` : 'Local review video'}
              >
                <track kind="captions" src={SILENT_CAPTION_TRACK} srcLang="en" label="No spoken audio" default />
              </video>
              <svg
                className="tactical-video-overlay"
                data-testid="tactical-video-overlay"
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                aria-hidden="true"
                onPointerDown={onOverlayPointer}
                onPointerMove={(event) => { if (event.buttons === 1) onOverlayPointer(event); }}
              >
                {presentation?.telestrations.map((stroke) => <TelestrationShape key={stroke.id} stroke={stroke} />)}
                {presentation?.tracks.map((sample) => sample.position ? (
                  <g key={sample.track.id} data-testid="tactical-track-marker">
                    <circle cx={sample.position.x} cy={sample.position.y} r={0.03} fill="#7A4E00" />
                    <rect x={sample.position.x - 0.02} y={sample.position.y - 0.045} width={0.04} height={0.015} fill="#10233f" />
                  </g>
                ) : null)}
              </svg>
            </div>
            <figcaption>
              <span data-testid="tactical-video-duration">{durationLabel}</span>
              <span data-testid="tactical-video-time">Review time {reviewTimeMs} ms</span>
            </figcaption>
          </figure>

          {comparison ? (
            <figure className="tactical-video-stage">
              <div className="tactical-video-frame">
                <video
                  ref={comparisonVideoRef}
                  data-testid="tactical-comparison-video"
                  src={comparisonUrl ?? undefined}
                  playsInline
                  preload="metadata"
                  aria-label={`Comparison angle ${comparison.name}`}
                >
                  <track kind="captions" src={SILENT_CAPTION_TRACK} srcLang="en" label="No spoken audio" default />
                </video>
              </div>
              <figcaption>
                <span data-testid="tactical-comparison-duration">{comparison.durationMs == null ? 'Duration unavailable' : `${comparison.durationMs} ms`}</span>
                <span>Comparison time {comparisonTimeMs} ms</span>
                <span data-testid="tactical-angle-offset">Angle offset {offsetLabel}</span>
              </figcaption>
            </figure>
          ) : null}
        </div>

        <div className="tactical-video-transport" aria-label="Precision review transport">
          <button type="button" className="action-button secondary" onClick={() => step(-1)} disabled={primary?.durationMs == null}>Step back one frame</button>
          <button type="button" className="action-button" onClick={() => { void togglePlayback(); }} disabled={primary?.durationMs == null}>{playing ? 'Pause review' : 'Play review'}</button>
          <button type="button" className="action-button secondary" onClick={() => step(1)} disabled={primary?.durationMs == null}>Step forward one frame</button>
          <label>
            Review stepping
            <select value={frameRate} onChange={(event) => setFrameRate(Number(event.target.value))}>
              {[24, 25, 30, 50, 60].map((rate) => <option key={rate} value={rate}>{rate} fps</option>)}
            </select>
          </label>
          <label>
            Review rate
            <select value={playbackRate} onChange={(event) => {
              const next = assertPlaybackRate(Number(event.target.value));
              setPlaybackRate(next);
              if (primaryVideoRef.current) primaryVideoRef.current.playbackRate = next;
            }}>
              {VIDEO_PLAYBACK_RATES.map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
            </select>
          </label>
          <label>
            Review time (ms)
            <input inputMode="numeric" value={timeDraft} onChange={(event) => setTimeDraft(event.target.value)} />
          </label>
          <button type="button" className="action-button secondary" onClick={() => {
            try { seekPrimary(integerField(timeDraft, 'Review time')); } catch (caught) { setError(message(caught)); }
          }} disabled={primary?.durationMs == null}>Set review time</button>
          <label>
            Review scrubber
            <input
              type="range"
              min={0}
              max={primary?.durationMs ?? 0}
              step={1}
              value={Math.min(reviewTimeMs, primary?.durationMs ?? 0)}
              disabled={primary?.durationMs == null}
              onChange={(event) => seekPrimary(integerField(event.target.value, 'Review time'))}
            />
          </label>
        </div>

        <div className="tactical-video-tools">
          <form onSubmit={submitTelestration}>
            <fieldset disabled={!primary}>
              <legend>Video telestration</legend>
              <label>
                Telestration kind
                <select name="kind" defaultValue="arrow">
                  <option value="arrow">Arrow</option>
                  <option value="line">Line</option>
                  <option value="circle">Circle</option>
                  <option value="text">Text</option>
                  <option value="freehand">Freehand</option>
                </select>
              </label>
              <label>Telestration start (ms)<input name="start" inputMode="numeric" defaultValue={0} /></label>
              <label>Telestration end (ms)<input name="end" inputMode="numeric" defaultValue={200} /></label>
              <label>Telestration X %<input name="x" inputMode="decimal" defaultValue={20} /></label>
              <label>Telestration Y %<input name="y" inputMode="decimal" defaultValue={30} /></label>
              <label>Telestration end X %<input name="x2" inputMode="decimal" defaultValue={70} /></label>
              <label>Telestration end Y %<input name="y2" inputMode="decimal" defaultValue={60} /></label>
              <label>
                Telestration color
                <select name="color" defaultValue={STROKE_COLORS[0].value}>
                  {STROKE_COLORS.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}
                </select>
              </label>
              <label>Telestration label<input name="label" autoComplete="off" /></label>
              <button type="button" className="action-button secondary" onClick={() => setDrawMode((value) => !value)} aria-pressed={drawMode}>
                {drawMode ? 'Stop drawing on video' : 'Draw on video'}
              </button>
              <button type="button" className="action-button secondary" onClick={() => addFreehandPoint(percentPoint('25', '25'))}>Add freehand point</button>
              <p data-testid="tactical-freehand-count">{freehandPoints.length} freehand points</p>
              <button type="submit" className="action-button">Add telestration</button>
            </fieldset>
          </form>
          <ul data-testid="tactical-telestration-list">
            {review.telestrations.filter((stroke) => stroke.mediaId === primary?.id).map((stroke) => (
              <li key={stroke.id}>
                <span>{stroke.kind} {stroke.label ?? 'unlabeled'} {stroke.startMs}–{stroke.endMs} ms</span>
                <button type="button" className="action-button secondary" onClick={() => onEdit('Remove telestration', (current) => ({
                  ...current,
                  videoReview: removeTelestration(current.videoReview, stroke.id),
                }), 'Removed a telestration stroke.')}>
                  Remove {stroke.label || stroke.kind} telestration
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={submitTrack}>
            <fieldset disabled={!primary}>
              <legend>Manual overlay tracking</legend>
              <label>Track label<input name="label" autoComplete="off" defaultValue="Runner" /></label>
              <label>Track start (ms)<input name="start" inputMode="numeric" defaultValue={0} /></label>
              <label>Track end (ms)<input name="end" inputMode="numeric" defaultValue={200} /></label>
              <label>
                Anchor blending
                <select name="interpolation" defaultValue="linear">
                  <option value="linear">Linear</option>
                  <option value="hold">Hold</option>
                </select>
              </label>
              <button type="submit" className="action-button">Add overlay track</button>
            </fieldset>
          </form>
          {review.overlayTracks.length ? (
            <label>
              Overlay track
              <select value={activeTrack?.id ?? ''} onChange={(event) => setSelectedTrackId(event.target.value)}>
                {review.overlayTracks.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}
              </select>
            </label>
          ) : null}
          <form onSubmit={submitAnchor}>
            <fieldset disabled={!activeTrack}>
              <legend>Tracking anchor</legend>
              <label>Anchor time (ms)<input name="time" inputMode="numeric" value={reviewTimeMs} readOnly /></label>
              <label>Anchor X %<input name="x" inputMode="decimal" defaultValue={40} /></label>
              <label>Anchor Y %<input name="y" inputMode="decimal" defaultValue={50} /></label>
              <button type="submit" className="action-button">Add track anchor</button>
            </fieldset>
          </form>
          <p data-testid="tactical-track-sample">
            {sampledTrack ? `Tracked position ${Math.round(sampledTrack.x * 1000) / 10}% , ${Math.round(sampledTrack.y * 1000) / 10}%` : 'No tracked position at this time'}
          </p>

          <form onSubmit={submitEvent}>
            <fieldset disabled={!primary}>
              <legend>Match event tagging</legend>
              <label>
                Event kind
                <select name="kind" defaultValue="goal">
                  {EVENT_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </select>
              </label>
              <label>Event label<input name="label" autoComplete="off" defaultValue="Near-post goal" /></label>
              <label>Event time (ms)<input name="time" inputMode="numeric" defaultValue={0} /></label>
              <button type="submit" className="action-button">Add match event</button>
            </fieldset>
          </form>
          <ul data-testid="tactical-event-list">
            {review.events.filter((item) => item.mediaId === primary?.id).map((item) => (
              <li key={item.id}>
                <button type="button" className="action-button secondary" onClick={() => seekPrimary(item.timeMs)}>{item.kind}: {item.label} at {item.timeMs} ms</button>
                <button type="button" className="action-button secondary" onClick={() => onEdit('Remove match event', (current) => ({
                  ...current,
                  videoReview: removeMatchEvent(current.videoReview, item.id),
                }), 'Removed a match event.')}>
                  Remove event {item.label}
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={submitClip}>
            <fieldset disabled={!primary}>
              <legend>Local clips</legend>
              <label>Clip label<input name="label" autoComplete="off" defaultValue="Press" /></label>
              <label>Clip start (ms)<input name="start" inputMode="numeric" defaultValue={0} /></label>
              <label>Clip end (ms)<input name="end" inputMode="numeric" defaultValue={400} /></label>
              <button type="submit" className="action-button">Add clip</button>
            </fieldset>
          </form>
          <form onSubmit={submitPlaylist}>
            <fieldset disabled={!review.clips.length}>
              <legend>Clip playlist</legend>
              <label>Playlist name<input name="name" autoComplete="off" defaultValue="Attacking moments" /></label>
              <div className="tactical-video-checks">
                {review.clips.map((clip) => (
                  <label key={clip.id}>
                    <input type="checkbox" name={`clip-${clip.id}`} defaultChecked />
                    {clip.label} {clip.startMs}–{clip.endMs} ms
                  </label>
                ))}
              </div>
              <button type="submit" className="action-button">Create playlist</button>
            </fieldset>
          </form>
          {review.playlists.length ? (
            <label>
              Playlist
              <select value={activePlaylist?.id ?? ''} onChange={(event) => setSelectedPlaylistId(event.target.value)}>
                {review.playlists.map((playlist) => <option key={playlist.id} value={playlist.id}>{playlist.name}</option>)}
              </select>
            </label>
          ) : null}
          <ol data-testid="tactical-playlist-order">
            {playlistClips.map((clip) => (
              <li key={clip.id}>
                <span>{clip.label}</span>
                <button type="button" className="action-button secondary" disabled={!activePlaylist} onClick={() => {
                  if (!activePlaylist) return;
                  onEdit('Reorder playlist', (current) => ({
                    ...current,
                    videoReview: movePlaylistClip(current.videoReview, activePlaylist.id, clip.id, -1),
                  }), 'Moved the clip earlier in the playlist.');
                }}>
                  Move {clip.label} earlier
                </button>
                <button type="button" className="action-button secondary" disabled={!activePlaylist} onClick={() => {
                  if (!activePlaylist) return;
                  onEdit('Reorder playlist', (current) => ({
                    ...current,
                    videoReview: movePlaylistClip(current.videoReview, activePlaylist.id, clip.id, 1),
                  }), 'Moved the clip later in the playlist.');
                }}>
                  Move {clip.label} later
                </button>
                <button type="button" className="action-button secondary" onClick={() => onEdit('Remove clip', (current) => ({
                  ...current,
                  videoReview: removeVideoClip(current.videoReview, clip.id),
                }), 'Removed a local clip.')}>
                  Remove clip {clip.label}
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="action-button" disabled={!playlistClips.length || primary?.durationMs == null} onClick={playPlaylist}>Play playlist</button>

          <form onSubmit={submitSync}>
            <fieldset disabled={!comparison}>
              <legend>Manual multi-angle sync</legend>
              <label>Sync shared time (ms)<input name="shared" inputMode="numeric" defaultValue={0} /></label>
              <label>Sync angle time (ms)<input name="angle" inputMode="numeric" defaultValue={0} /></label>
              <button type="submit" className="action-button">Set sync anchor</button>
            </fieldset>
          </form>
        </div>
      </div>
    </details>
  );
}
