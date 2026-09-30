/** Motion model estimated between a reference frame and each other frame. */
export type PhotoRegistrationModel = 'translation' | 'euclidean' | 'homography';

export type PhotoMergeOperation = 'exposure-fusion' | 'hdr' | 'panorama' | 'focus-stack' | 'average-stack' | 'median-stack';

/** Source limits shared by every multi-image operation. Kept equal to the TIFF/RAW import
 * ceilings so a merge can never accept a frame the rest of Photo Studio would refuse. */
export const PHOTO_MERGE_LIMITS = {
  minSources: 2,
  maxSources: 9,
  maxEdge: 4096,
  maxSourcePixels: 16 * 1024 * 1024,
  /** Estimated peak working memory for one job, including per-frame float intermediates. */
  maxWorkingBytes: 768 * 1024 * 1024,
  /** A stitched canvas keeps 16 bytes per pixel of float accumulators plus one warped frame. */
  maxPanoramaPixels: 12 * 1024 * 1024,
  /** Registration runs on a copy downscaled to this long edge, then is scaled back. */
  registrationMaxEdge: 1024,
  jobSeconds: 90,
} as const;

export type PhotoMergeDiagnosticCode =
  | 'too-few-sources'
  | 'too-many-sources'
  | 'invalid-dimensions'
  | 'source-too-large'
  | 'dimension-mismatch'
  | 'memory-budget'
  | 'registration-failed'
  | 'no-common-coverage'
  | 'engine-unavailable'
  | 'invalid-request'
  | 'timeout'
  | 'worker-failed';

export interface PhotoMergeDiagnostic {
  code: PhotoMergeDiagnosticCode;
  message: string;
  /** Zero-based source index the diagnostic refers to, when it is about one frame. */
  sourceIndex?: number;
}

export interface PhotoMergeRaster {
  width: number;
  height: number;
  /** RGBA8, row-major, width * height * 4 bytes. Transferred, not copied. */
  buffer: ArrayBuffer;
}

export interface PhotoFrameRegistration {
  sourceIndex: number;
  model: PhotoRegistrationModel;
  /** 3x3 row-major matrix mapping reference pixel coordinates to this frame's coordinates. */
  matrix: number[];
  /** Whether the feature-based coarse estimate succeeded or refinement started from identity. */
  coarse: 'features' | 'identity';
  featureMatches: number;
  inliers: number;
  /** ECC correlation coefficient of the refined alignment, 0..1 (higher is better). */
  correlation: number;
  lowConfidence: boolean;
}

/** OpenCV TonemapReinhard parameters (Reinhard et al. 2005), passed through unchanged. */
export interface PhotoTonemapSettings {
  gamma: number;
  intensity: number;
  lightAdaptation: number;
  colorAdaptation: number;
}

export const DEFAULT_TONEMAP: PhotoTonemapSettings = { gamma: 1, intensity: 0, lightAdaptation: 1, colorAdaptation: 0 };

export interface PhotoMergeCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

type RequestBase = { id: number; model: PhotoRegistrationModel; referenceIndex: number; sources: PhotoMergeRaster[] };

export type PhotoMergeRequest =
  | RequestBase & { type: 'register' }
  | RequestBase & { type: 'align' }
  | RequestBase & { type: 'fuse'; align: boolean }
  | RequestBase & { type: 'hdr'; align: boolean; exposureSeconds: number[]; tonemap: PhotoTonemapSettings }
  | RequestBase & { type: 'panorama'; cropMode: PhotoPanoramaCrop }
  | RequestBase & { type: 'stack'; method: PhotoStackMethod; align: boolean };

/** Focus picks the locally sharpest frame, average lowers noise, median rejects transients. */
export type PhotoStackMethod = 'focus' | 'average' | 'median';

/** 'full' keeps the whole stitched canvas, transparent where no photo reaches; 'inscribed'
 * trims to a rectangle every pixel of which is covered. */
export type PhotoPanoramaCrop = 'full' | 'inscribed';

export type PhotoMergeResponse =
  | { id: number; ok: true; type: 'register'; registrations: PhotoFrameRegistration[] }
  | { id: number; ok: true; type: 'align'; registrations: PhotoFrameRegistration[]; aligned: PhotoMergeRaster[] }
  | { id: number; ok: true; type: 'fuse' | 'hdr' | 'panorama' | 'stack'; registrations: PhotoFrameRegistration[]; result: PhotoMergeRaster; crop: PhotoMergeCrop }
  | { id: number; ok: false; diagnostic: PhotoMergeDiagnostic };
