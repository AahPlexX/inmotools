export const MEDIABUNNY_PIN = '1.58.0';

export const MEDIABUNNY_CONTAINER_CODECS = {
  mp4: ['avc', 'hevc', 'vp9', 'av1', 'vp8', 'prores'],
  webm: ['vp8', 'vp9', 'av1'],
} as const;

export const ANALYTICS_CLAIM_BOUNDARY = 'Geometric measurement from authored or imported samples on the configured pitch. Not a GPS reading, probability, intent, or officiating decision.';

export const SOCIAL_STILL_PRESETS = {
  square: { id: 'square', label: 'Square 1080', width: 1080, height: 1080 },
  portrait: { id: 'portrait', label: 'Portrait 4:5', width: 1080, height: 1350 },
  story: { id: 'story', label: 'Story 9:16', width: 1080, height: 1920 },
  landscape: { id: 'landscape', label: 'Landscape 16:9', width: 1920, height: 1080 },
} as const;

export type SocialStillPresetId = keyof typeof SOCIAL_STILL_PRESETS;

export const RASTER_STILL_FORMATS = [
  { id: 'png', mime: 'image/png', label: 'PNG' },
  { id: 'jpeg', mime: 'image/jpeg', label: 'JPEG' },
  { id: 'webp', mime: 'image/webp', label: 'WebP' },
] as const;

export type RasterMime = (typeof RASTER_STILL_FORMATS)[number]['mime'];

export interface RasterSurface {
  width: number;
  height: number;
  drawSvg: (svg: string) => Promise<void>;
  toBlob: (mime: RasterMime, quality: number) => Promise<Blob | null>;
}

export const VIDEO_EXPORT_CANDIDATES = [
  { id: 'mp4-avc-1280x720-30', container: 'mp4', codec: 'avc', width: 1280, height: 720, frameRate: 30, bitrate: 2_500_000 },
  { id: 'mp4-avc-1920x1080-30', container: 'mp4', codec: 'avc', width: 1920, height: 1080, frameRate: 30, bitrate: 6_000_000 },
  { id: 'webm-vp9-1280x720-30', container: 'webm', codec: 'vp9', width: 1280, height: 720, frameRate: 30, bitrate: 2_500_000 },
  { id: 'webm-vp8-1280x720-30', container: 'webm', codec: 'vp8', width: 1280, height: 720, frameRate: 30, bitrate: 2_500_000 },
] as const;

export interface VideoExportCandidate {
  id: string;
  container: 'mp4' | 'webm';
  codec: 'avc' | 'hevc' | 'vp9' | 'av1' | 'vp8' | 'prores';
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
}

export interface ExportMetadata {
  title: string;
  description: string;
  creator: string;
  club: string;
  ageGroup: string;
  sessionType: string;
  tacticalTheme: string;
  tags: string[];
  rights: string;
  license: string;
  language: string;
  createdAt: string;
  modifiedAt: string;
  notes: string;
}

export interface ExportMetadataDraft {
  title: string;
  description: string;
  creator: string;
  club: string;
  ageGroup: string;
  sessionType: string;
  tacticalTheme: string;
  tagsText: string;
  rights: string;
  license: string;
  language: string;
  notes: string;
}

export interface VideoEncodeRequest {
  candidate: VideoExportCandidate;
  frames: Array<{ timeMs: number; svg: string }>;
  tags: {
    title?: string;
    description?: string;
    artist?: string;
    comment?: string;
    date?: Date;
  };
}

export interface AnalyticsReportRow {
  section: 'pitch' | 'trajectory' | 'team-geometry';
  subjectId: string;
  metric: string;
  value: number;
  unit: string;
  source: 'authored' | 'imported' | 'geometric';
  claimBoundary: string;
}
