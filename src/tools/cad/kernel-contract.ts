import type { CadProject } from './cad-types';

export type CadKernelQuality = 'preview' | 'final';
export type CadKernelExportFormat = 'step' | 'brep' | 'stl' | 'gltf';
export type CadKernelImportFormat = 'step' | 'brep';

export type CadKernelOperation =
  | { kind: 'rebuild'; dirtyFeatureIds: string[] }
  | { kind: 'measure'; targetIds: string[] }
  | { kind: 'export'; format: CadKernelExportFormat; options: Record<string, unknown> }
  | { kind: 'import'; format: CadKernelImportFormat; data: ArrayBuffer };

export interface CadKernelRequest {
  revision: number;
  project: CadProject;
  quality: CadKernelQuality;
  operation: CadKernelOperation;
}

export type CadKernelVector3 = [number, number, number];

export interface CadKernelMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export interface CadKernelBounds {
  min: CadKernelVector3;
  max: CadKernelVector3;
}

export interface CadKernelBodyResult {
  bodyId: string;
  mesh: CadKernelMesh;
  bounds: CadKernelBounds;
}

export interface CadKernelMeasurement {
  id: string;
  kind: 'length' | 'area' | 'volume' | 'angle' | 'radius' | 'diameter' | 'center-of-mass' | 'bounds';
  value: number | CadKernelVector3 | CadKernelBounds;
  unit: 'mm' | 'mm2' | 'mm3' | 'rad' | 'none';
}

export type CadKernelPayload =
  | { kind: 'rebuild'; bodies: CadKernelBodyResult[]; warnings: string[] }
  | { kind: 'measure'; measurements: CadKernelMeasurement[]; warnings: string[] }
  | { kind: 'export'; format: CadKernelExportFormat; data: string | Uint8Array; warnings: string[] }
  | { kind: 'import'; bodies: CadKernelBodyResult[]; warnings: string[] };

export type CadKernelErrorCode =
  | 'unsupported-browser'
  | 'kernel-init'
  | 'invalid-request'
  | 'evaluation-failed'
  | 'cancelled'
  | 'import-failed'
  | 'export-failed';

export interface CadKernelError {
  code: CadKernelErrorCode;
  message: string;
  recoverable: boolean;
  featureId?: string;
}

export type CadKernelResponse =
  | { revision: number; ok: true; payload: CadKernelPayload }
  | { revision: number; ok: false; error: CadKernelError };

export interface CadKernelTessellationOptions {
  linearDeflection: number;
  angularDeflection: number;
}

export interface CadKernelShapeBounds {
  min: CadKernelVector3;
  max: CadKernelVector3;
}

declare const cadKernelShapeBrand: unique symbol;

/**
 * Opaque worker-only exact geometry. This type is intentionally absent from
 * CadKernelRequest/CadKernelResponse so React/project state cannot retain a
 * native kernel handle.
 */
export type CadKernelShape = { readonly [cadKernelShapeBrand]: true };

export interface CadExactKernel {
  box(width: number, depth: number, height: number): CadKernelShape;
  cylinder(radius: number, height: number): CadKernelShape;
  sphere(radius: number): CadKernelShape;
  cone(radius1: number, radius2: number, height: number): CadKernelShape;
  torus(majorRadius: number, minorRadius: number): CadKernelShape;
  fuse(left: CadKernelShape, right: CadKernelShape): CadKernelShape;
  cut(left: CadKernelShape, right: CadKernelShape): CadKernelShape;
  common(left: CadKernelShape, right: CadKernelShape): CadKernelShape;
  section(left: CadKernelShape, right: CadKernelShape): CadKernelShape;
  extrude(profile: CadKernelShape, distance: number, direction: CadKernelVector3): CadKernelShape;
  revolve(profile: CadKernelShape, axisOrigin: CadKernelVector3, axisDirection: CadKernelVector3, angle: number): CadKernelShape;
  sweep(profile: CadKernelShape, path: CadKernelShape): CadKernelShape;
  loft(sections: readonly CadKernelShape[], solid: boolean): CadKernelShape;
  fillet(shape: CadKernelShape, edgeIds: readonly string[], radius: number): CadKernelShape;
  chamfer(shape: CadKernelShape, edgeIds: readonly string[], distance: number): CadKernelShape;
  shell(shape: CadKernelShape, faceIds: readonly string[], thickness: number): CadKernelShape;
  draft(shape: CadKernelShape, faceIds: readonly string[], angle: number, direction: CadKernelVector3): CadKernelShape;
  offset(shape: CadKernelShape, distance: number): CadKernelShape;
  split(shape: CadKernelShape, tool: CadKernelShape): CadKernelShape[];
  tessellate(shape: CadKernelShape, options: CadKernelTessellationOptions): CadKernelMesh;
  volume(shape: CadKernelShape): number;
  area(shape: CadKernelShape): number;
  centerOfMass(shape: CadKernelShape): CadKernelVector3;
  bounds(shape: CadKernelShape): CadKernelShapeBounds;
  importStep(data: Uint8Array): CadKernelShape[];
  exportStep(shapes: readonly CadKernelShape[]): Uint8Array;
  importBrep(data: Uint8Array): CadKernelShape[];
  exportBrep(shapes: readonly CadKernelShape[]): Uint8Array;
  exportStl(shape: CadKernelShape, ascii: false): Uint8Array;
  exportStl(shape: CadKernelShape, ascii: true): string;
  exportGltf(shapes: readonly CadKernelShape[]): Uint8Array;
}

function validRevision(revision: number): boolean {
  return Number.isSafeInteger(revision) && revision >= 0;
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${label} must be an array of strings.`);
  }
}

function assertOperation(operation: CadKernelOperation): void {
  if (!operation || typeof operation !== 'object' || typeof operation.kind !== 'string') {
    throw new Error('Kernel operation must be an object with a kind.');
  }

  switch (operation.kind) {
    case 'rebuild':
      assertStringArray(operation.dirtyFeatureIds, 'Rebuild dirtyFeatureIds');
      return;
    case 'measure':
      assertStringArray(operation.targetIds, 'Measure targetIds');
      return;
    case 'export':
      if (!['step', 'brep', 'stl', 'gltf'].includes(operation.format)) {
        throw new Error(`Unsupported kernel export format '${String(operation.format)}'.`);
      }
      if (!operation.options || typeof operation.options !== 'object' || Array.isArray(operation.options)) {
        throw new Error('Kernel export options must be an object.');
      }
      return;
    case 'import':
      if (!['step', 'brep'].includes(operation.format)) {
        throw new Error(`Unsupported kernel import format '${String(operation.format)}'.`);
      }
      if (!(operation.data instanceof ArrayBuffer)) {
        throw new Error('Kernel import data must be an ArrayBuffer.');
      }
      return;
  }
}

export function assertKernelRequest(request: CadKernelRequest): CadKernelRequest {
  if (!request || typeof request !== 'object') throw new Error('Kernel request must be an object.');
  if (!validRevision(request.revision)) throw new Error('Kernel request revision must be a non-negative safe integer.');
  if (request.quality !== 'preview' && request.quality !== 'final') {
    throw new Error(`Kernel request quality '${String(request.quality)}' is unsupported.`);
  }
  if (!request.project || request.project.schemaVersion !== 1) {
    throw new Error('Kernel request must include a supported CAD project schema.');
  }
  assertOperation(request.operation);
  return request;
}

export function isCurrentKernelResponse(response: CadKernelResponse, latestRevision: number): boolean {
  if (!validRevision(latestRevision)) throw new Error('Latest kernel revision must be a non-negative safe integer.');
  return validRevision(response.revision) && response.revision === latestRevision;
}

export function createKernelFailure(
  revision: number,
  thrown: unknown,
  code: CadKernelErrorCode,
  recoverable: boolean,
  featureId?: string,
): CadKernelResponse {
  if (!validRevision(revision)) throw new Error('Kernel failure revision must be a non-negative safe integer.');
  const message = thrown instanceof Error
    ? thrown.message
    : typeof thrown === 'string'
      ? thrown
      : 'Unknown kernel failure.';
  return {
    revision,
    ok: false,
    error: {
      code,
      message,
      recoverable,
      ...(featureId ? { featureId } : {}),
    },
  };
}

function addBuffer(buffer: ArrayBufferLike, seen: Set<ArrayBuffer>, transferables: ArrayBuffer[]): void {
  if (buffer instanceof ArrayBuffer && !seen.has(buffer)) {
    seen.add(buffer);
    transferables.push(buffer);
  }
}

export function collectKernelTransferables(response: CadKernelResponse): ArrayBuffer[] {
  if (!response.ok) return [];
  const seen = new Set<ArrayBuffer>();
  const transferables: ArrayBuffer[] = [];

  if (response.payload.kind === 'rebuild' || response.payload.kind === 'import') {
    for (const body of response.payload.bodies) {
      addBuffer(body.mesh.positions.buffer, seen, transferables);
      addBuffer(body.mesh.normals.buffer, seen, transferables);
      addBuffer(body.mesh.indices.buffer, seen, transferables);
    }
  }

  if (response.payload.kind === 'export' && response.payload.data instanceof Uint8Array) {
    addBuffer(response.payload.data.buffer, seen, transferables);
  }

  return transferables;
}
