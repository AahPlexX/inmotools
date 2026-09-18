import type { CountedImageQuantizationResult } from './engines/counted-image-engine';

export interface CountedImageWorkerRequest {
  readonly type: 'quantize';
  readonly requestId: number;
  readonly buffer: ArrayBuffer;
  readonly mimeType: string;
  readonly rows: number;
  readonly cols: number;
  readonly maxColors: number;
  readonly dither: boolean;
}

export type CountedImageWorkerResponse =
  | {
      readonly type: 'result';
      readonly requestId: number;
      readonly result: CountedImageQuantizationResult;
    }
  | {
      readonly type: 'error';
      readonly requestId: number;
      readonly message: string;
    };