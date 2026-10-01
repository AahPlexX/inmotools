import type { CadProject } from './cad-types';
import {
  assertKernelRequest,
  isCurrentKernelResponse,
  type CadKernelOperation,
  type CadKernelQuality,
  type CadKernelRequest,
  type CadKernelResponse,
} from './kernel-contract';

export interface CadKernelIssuedRequest {
  generation: number;
  request: CadKernelRequest;
}

export interface CadKernelRestartState {
  generation: number;
  revision: number;
}

export interface CadKernelSessionSnapshot {
  generation: number;
  revision: number;
  consumedRevision: number | null;
}

/**
 * Main-thread revision/generation coordinator for the replaceable geometry
 * worker. It deliberately owns no Worker instance so restart semantics are
 * deterministic and independently testable.
 */
export class CadKernelSession {
  #generation = 0;
  #revision = 0;
  #consumedRevision: number | null = null;

  issue(project: CadProject, quality: CadKernelQuality, operation: CadKernelOperation): CadKernelIssuedRequest {
    this.#revision += 1;
    this.#consumedRevision = null;
    const request = assertKernelRequest({
      revision: this.#revision,
      project,
      quality,
      operation,
    });
    return { generation: this.#generation, request };
  }

  /**
   * Invalidates any in-flight response without requiring a new request.
   * The worker may continue computing, but its old revision can no longer be
   * committed by the caller.
   */
  invalidate(): number {
    this.#revision += 1;
    this.#consumedRevision = null;
    return this.#revision;
  }

  /**
   * Marks the current worker generation as terminated/replaced. A caller
   * should pair this with Worker.terminate() and create a fresh worker from
   * serializable project state.
   */
  restart(): CadKernelRestartState {
    this.#revision += 1;
    this.#generation += 1;
    this.#consumedRevision = null;
    return { generation: this.#generation, revision: this.#revision };
  }

  /**
   * Returns true once, and only once, for the current generation's latest
   * revision. Both successful and failed current responses are consumable;
   * stale/duplicate responses are ignored.
   */
  accept(generation: number, response: CadKernelResponse): boolean {
    if (!Number.isSafeInteger(generation) || generation < 0) return false;
    if (generation !== this.#generation) return false;
    if (!isCurrentKernelResponse(response, this.#revision)) return false;
    if (this.#consumedRevision === response.revision) return false;
    this.#consumedRevision = response.revision;
    return true;
  }

  snapshot(): CadKernelSessionSnapshot {
    return {
      generation: this.#generation,
      revision: this.#revision,
      consumedRevision: this.#consumedRevision,
    };
  }
}
