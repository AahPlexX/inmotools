import { checkMergeSources } from './photo-merge-plan';
import type {
  PhotoFrameRegistration,
  PhotoMergeDiagnostic,
  PhotoMergeRaster,
  PhotoMergeRequest,
  PhotoMergeResponse,
  PhotoRegistrationModel,
} from './photo-merge-types';
import { PhotoRegistrationError, registerFramePair, warpFrameToReference, type PhotoCv } from './photo-registration';

const MODELS: PhotoRegistrationModel[] = ['translation', 'euclidean', 'homography'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRaster(value: unknown): value is PhotoMergeRaster {
  if (!isRecord(value)) return false;
  const { width, height, buffer } = value;
  return Number.isInteger(width) && Number.isInteger(height)
    && (width as number) > 0 && (height as number) > 0
    && buffer instanceof ArrayBuffer
    && buffer.byteLength >= (width as number) * (height as number) * 4;
}

/** Structural validation of an untrusted message plus the shared source-size checks. */
export function validatePhotoMergeRequest(message: unknown): { ok: true; request: PhotoMergeRequest } | { ok: false; diagnostic: PhotoMergeDiagnostic } {
  const invalid = (text: string) => ({ ok: false as const, diagnostic: { code: 'invalid-request' as const, message: text } });
  if (!isRecord(message) || !Number.isInteger(message.id)) return invalid('Merge request is missing its id.');
  if (message.type !== 'register' && message.type !== 'align') return invalid('Unknown merge request type.');
  if (!MODELS.includes(message.model as PhotoRegistrationModel)) return invalid('Unknown alignment model.');
  if (!Array.isArray(message.sources)) return invalid('Merge request has no source list.');
  const badSource = message.sources.findIndex((source) => !isRaster(source));
  if (badSource >= 0) {
    return { ok: false, diagnostic: { code: 'invalid-dimensions', message: `Photo ${badSource + 1} is not a complete RGBA raster.`, sourceIndex: badSource } };
  }
  const sources = message.sources as PhotoMergeRaster[];
  const sizeProblem = checkMergeSources(sources, false);
  if (sizeProblem) return { ok: false, diagnostic: sizeProblem };
  const referenceIndex = message.referenceIndex;
  if (!Number.isInteger(referenceIndex) || (referenceIndex as number) < 0 || (referenceIndex as number) >= sources.length) {
    return invalid('Reference photo index is out of range.');
  }
  return {
    ok: true,
    request: {
      id: message.id as number,
      type: message.type,
      model: message.model as PhotoRegistrationModel,
      referenceIndex: referenceIndex as number,
      sources,
    },
  };
}

function referenceRegistration(sourceIndex: number, model: PhotoRegistrationModel): PhotoFrameRegistration {
  return {
    sourceIndex,
    model,
    matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    coarse: 'identity',
    featureMatches: 0,
    inliers: 0,
    correlation: 1,
    lowConfidence: false,
  };
}

/** Handles one request end to end and never throws: every failure — malformed input, an engine
 * that cannot load, a frame that cannot be aligned, or an unexpected engine fault — becomes a
 * diagnostic response for that request id, so one bad job cannot take down the worker or leak
 * into the next request. */
export async function handlePhotoMergeRequest(message: unknown, loadEngine: () => Promise<PhotoCv>): Promise<PhotoMergeResponse> {
  const id = isRecord(message) && Number.isInteger(message.id) ? (message.id as number) : -1;
  const validated = validatePhotoMergeRequest(message);
  if (!validated.ok) return { id, ok: false, diagnostic: validated.diagnostic };
  const { type, model, referenceIndex, sources } = validated.request;

  let cv: PhotoCv;
  try {
    cv = await loadEngine();
  } catch (error) {
    return {
      id,
      ok: false,
      diagnostic: {
        code: 'engine-unavailable',
        message: `The image alignment engine could not load in this browser (${error instanceof Error ? error.message : String(error)}). The selected photos are unchanged.`,
      },
    };
  }

  try {
    const reference = sources[referenceIndex];
    const registrations = sources.map((source, index) => (
      index === referenceIndex ? referenceRegistration(index, model) : registerFramePair(cv, reference, source, model, index)
    ));
    if (type === 'register') return { id, ok: true, type: 'register', registrations };
    const aligned = sources.map((source, index) => (
      index === referenceIndex ? source : warpFrameToReference(cv, source, registrations[index].matrix, reference.width, reference.height)
    ));
    return { id, ok: true, type: 'align', registrations, aligned };
  } catch (error) {
    if (error instanceof PhotoRegistrationError) {
      return { id, ok: false, diagnostic: { code: 'registration-failed', message: error.message, sourceIndex: error.sourceIndex } };
    }
    return {
      id,
      ok: false,
      diagnostic: { code: 'worker-failed', message: `Alignment stopped unexpectedly (${error instanceof Error ? error.message : String(error)}). The selected photos are unchanged.` },
    };
  }
}
