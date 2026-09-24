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
  | 'engine-unavailable'
  | 'invalid-request'
  | 'timeout'
  | 'cancelled'
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

export type PhotoPanoramaProjection = 'planar' | 'cylindrical';

/** Alignment applied before a stack/bracket merge; `none` is for tripod-locked frames. */
export type PhotoMergeAlignment = PhotoRegistrationModel | 'none';

export interface PhotoPanoramaOptions {
  projection: PhotoPanoramaProjection;
  /** Horizontal field of view of one frame in degrees; only used by the cylindrical projection. */
  fieldOfView: number;
  gainCompensation: boolean;
}

/** Operation parameters. Only the block matching the operation is read; the plain-data shape
 * crosses the worker boundary by structured clone. */
export interface PhotoMergeOptions {
  alignment: PhotoMergeAlignment;
  /** Crop the result to the largest rectangle every frame covers, instead of keeping transparent edges. */
  cropToCoverage: boolean;
  fusion: { contrast: number; saturation: number; exposure: number };
  hdr: {
    exposureTimes: number[];
    operator: 'reinhard' | 'drago' | 'mantiuk';
    gamma: number;
    intensity: number;
    lightAdaptation: number;
    colorAdaptation: number;
    bias: number;
    scale: number;
    saturation: number;
  };
  focus: { radius: number; selectivity: number };
  panorama: PhotoPanoramaOptions;
}

/** Output ceiling for a merged result. A panorama may exceed one source frame, so it gets a larger
 * edge limit than the per-source ceiling, with the same 16-megapixel area bound. */
export const PHOTO_MERGE_OUTPUT_LIMITS = { maxEdge: 8192, maxPixels: 16 * 1024 * 1024 } as const;

export type PhotoMergeRequest =
  | { id: number; type: 'register'; model: PhotoRegistrationModel; referenceIndex: number; sources: PhotoMergeRaster[] }
  | { id: number; type: 'align'; model: PhotoRegistrationModel; referenceIndex: number; sources: PhotoMergeRaster[] }
  | { id: number; type: 'merge'; operation: PhotoMergeOperation; referenceIndex: number; sources: PhotoMergeRaster[]; options: PhotoMergeOptions };

export interface PhotoMergeOutcome {
  result: PhotoMergeRaster;
  registrations: PhotoFrameRegistration[];
  /** Plain-language facts about what the merge did (scaling, cropping, exposure equalisation). */
  notes: string[];
}

export type PhotoMergeResponse =
  | { id: number; ok: true; type: 'register'; registrations: PhotoFrameRegistration[] }
  | { id: number; ok: true; type: 'align'; registrations: PhotoFrameRegistration[]; aligned: PhotoMergeRaster[] }
  | ({ id: number; ok: true; type: 'merge' } & PhotoMergeOutcome)
  | { id: number; ok: false; diagnostic: PhotoMergeDiagnostic };
