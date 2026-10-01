import type { GltfOptimizeOptions, GltfOptimizeResult } from './gltf-engine';

/** Worker messages are discriminated by `type` and correlated by `requestId` so a late reply can never win. */
export type GltfWorkerRequest = { type: 'optimize'; requestId: number; bytes: Uint8Array; options: GltfOptimizeOptions };
export type GltfWorkerResponse =
  | { type: 'progress'; requestId: number; value: number; stage: string }
  | { type: 'completed'; requestId: number; result: GltfOptimizeResult }
  | { type: 'error'; requestId: number; message: string };

export type GltfRunHandle = { promise: Promise<GltfOptimizeResult>; cancel: () => void };
