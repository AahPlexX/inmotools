import {
  PHOTO_MERGE_LIMITS,
  type PhotoFrameRegistration,
  type PhotoMergeDiagnostic,
  type PhotoMergeRaster,
  type PhotoMergeRequest,
  type PhotoMergeResponse,
  type PhotoRegistrationModel,
} from './photo-merge-types';

/** Rejection carrying the worker's structured diagnostic so callers can show the exact reason. */
export class PhotoMergeFailure extends Error {
  constructor(readonly diagnostic: PhotoMergeDiagnostic) {
    super(diagnostic.message);
    this.name = 'PhotoMergeFailure';
  }
}

export interface PhotoMergeWorkerLike {
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
}

export interface PhotoMergeClientOptions {
  createWorker?: () => PhotoMergeWorkerLike;
  timeoutSeconds?: number;
}

type AlignResult = { registrations: PhotoFrameRegistration[]; aligned: PhotoMergeRaster[] };

function defaultWorker(): PhotoMergeWorkerLike {
  return new Worker(new URL('./photo-merge.worker.ts', import.meta.url), { type: 'module' }) as unknown as PhotoMergeWorkerLike;
}

/** Owns at most one merge worker, created on first use. Jobs run one at a time (bounding peak
 * memory the same way the TIFF/RAW decoder queue does). A job that exceeds its deadline or crashes
 * the worker terminates it; the next job starts a fresh worker instead of inheriting a broken one.
 * Source buffers are transferred to the worker, so callers must not reuse them afterwards. */
export function createPhotoMergeClient(options: PhotoMergeClientOptions = {}) {
  const createWorker = options.createWorker ?? defaultWorker;
  const timeoutMs = (options.timeoutSeconds ?? PHOTO_MERGE_LIMITS.jobSeconds) * 1000;
  let worker: PhotoMergeWorkerLike | null = null;
  let nextId = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let disposed = false;

  function discardWorker() {
    worker?.terminate();
    worker = null;
  }

  function run(request: Omit<PhotoMergeRequest, 'id'>): Promise<PhotoMergeResponse & { ok: true }> {
    const task = queue.then(() => new Promise<PhotoMergeResponse & { ok: true }>((resolve, reject) => {
      if (disposed) {
        reject(new PhotoMergeFailure({ code: 'worker-failed', message: 'The merge workspace was closed.' }));
        return;
      }
      const id = nextId;
      nextId += 1;
      let active: PhotoMergeWorkerLike;
      try {
        worker ??= createWorker();
        active = worker;
      } catch (error) {
        reject(new PhotoMergeFailure({ code: 'engine-unavailable', message: `Background merging is unavailable in this browser (${error instanceof Error ? error.message : String(error)}).` }));
        return;
      }
      const fail = (diagnostic: PhotoMergeDiagnostic) => {
        clearTimeout(timer);
        discardWorker();
        reject(new PhotoMergeFailure(diagnostic));
      };
      const timer = setTimeout(() => fail({
        code: 'timeout',
        message: `Merging exceeded its ${timeoutMs / 1000}-second time limit and was stopped. The selected photos are unchanged.`,
      }), timeoutMs);
      active.onmessage = (event) => {
        const response = event.data as PhotoMergeResponse | null;
        if (!response || typeof response !== 'object' || response.id !== id) return; // Not this job's reply.
        clearTimeout(timer);
        if (response.ok) resolve(response);
        else reject(new PhotoMergeFailure(response.diagnostic));
      };
      active.onerror = () => fail({ code: 'worker-failed', message: 'The merge worker stopped unexpectedly. The selected photos are unchanged.' });
      active.onmessageerror = () => fail({ code: 'worker-failed', message: 'The merge worker returned an unreadable result.' });
      try {
        active.postMessage({ ...request, id }, request.sources.map((source) => source.buffer));
      } catch (error) {
        fail({ code: 'invalid-request', message: `The selected photos could not be sent for merging (${error instanceof Error ? error.message : String(error)}).` });
      }
    }));
    queue = task.catch(() => undefined);
    return task;
  }

  return {
    async register(model: PhotoRegistrationModel, referenceIndex: number, sources: PhotoMergeRaster[]): Promise<PhotoFrameRegistration[]> {
      const response = await run({ type: 'register', model, referenceIndex, sources });
      return response.registrations;
    },
    async align(model: PhotoRegistrationModel, referenceIndex: number, sources: PhotoMergeRaster[]): Promise<AlignResult> {
      const response = await run({ type: 'align', model, referenceIndex, sources });
      if (response.type !== 'align') throw new PhotoMergeFailure({ code: 'worker-failed', message: 'The merge worker returned the wrong result type.' });
      return { registrations: response.registrations, aligned: response.aligned };
    },
    dispose() {
      disposed = true;
      discardWorker();
    },
  };
}
