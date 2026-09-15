import type { InitOptions, OcctKernel, ShapeHandle } from 'occt-wasm';
import type {
  CadExactKernel,
  CadHelixDefinition,
  CadKernelMesh,
  CadKernelShape,
  CadKernelShapeBounds,
  CadKernelTessellationOptions,
  CadKernelVector3,
} from './kernel-contract';
import type { CadSketchProfile3d, CadSketchWire3d } from './sketch-profile';
import type { TopologyCandidate, TopologyKind } from './topology-ref';

export interface OcctCadKernelAdapterOptions {
  wasm?: InitOptions['wasm'];
}

type ShapeToken = Readonly<{ kind: 'occt-shape' }>;

function vectorLength([x, y, z]: CadKernelVector3): number {
  return Math.hypot(x, y, z);
}

function asVec3([x, y, z]: CadKernelVector3): { x: number; y: number; z: number } {
  return { x, y, z };
}

function fromVec3(value: { x: number; y: number; z: number }): CadKernelVector3 {
  return [value.x, value.y, value.z];
}

/**
 * Exact worker-side adapter over occt-wasm. Native shape handles never cross
 * this boundary: callers receive opaque tokens that are resolved only inside
 * this adapter and are invalid once the adapter is disposed.
 */
export class OcctCadKernelAdapter implements CadExactKernel {
  readonly #kernel: OcctKernel;
  readonly #handles = new WeakMap<object, ShapeHandle>();
  #disposed = false;

  constructor(kernel: OcctKernel) {
    this.#kernel = kernel;
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('The OCCT CAD kernel adapter has been disposed.');
  }

  #wrap(handle: ShapeHandle): CadKernelShape {
    this.#assertActive();
    const token: ShapeToken = Object.freeze({ kind: 'occt-shape' });
    this.#handles.set(token, handle);
    return token as unknown as CadKernelShape;
  }

  #unwrap(shape: CadKernelShape): ShapeHandle {
    this.#assertActive();
    const handle = this.#handles.get(shape as object);
    if (handle === undefined) throw new Error('CAD kernel shape is foreign, released, or belongs to another kernel instance.');
    return handle;
  }

  #unwrapMany(shapes: readonly CadKernelShape[]): ShapeHandle[] {
    return shapes.map((shape) => this.#unwrap(shape));
  }

  #withExportShape<T>(shapes: readonly CadKernelShape[], exportShape: (shape: ShapeHandle) => T): T {
    const handles = this.#unwrapMany(shapes);
    if (handles.length === 0) throw new Error('At least one exact shape is required for export.');
    if (handles.length === 1) return exportShape(handles[0]!);

    const compound = this.#kernel.makeCompound(handles);
    try {
      return exportShape(compound);
    } finally {
      this.#kernel.release(compound);
    }
  }

  #makeWire(definition: CadSketchWire3d): ShapeHandle {
    if (definition.edges.length === 0) throw new Error('Exact wire requires at least one edge.');
    const edgeHandles: ShapeHandle[] = [];
    try {
      for (const edge of definition.edges) {
        switch (edge.kind) {
          case 'line':
            edgeHandles.push(this.#kernel.makeLineEdge(asVec3(edge.start), asVec3(edge.end)));
            break;
          case 'arc':
            edgeHandles.push(this.#kernel.makeArcEdge(asVec3(edge.start), asVec3(edge.mid), asVec3(edge.end)));
            break;
          case 'circle':
            edgeHandles.push(this.#kernel.makeCircleEdge(asVec3(edge.center), asVec3(edge.normal), edge.radius));
            break;
          case 'spline': {
            const points = edge.points.map(asVec3);
            if ((edge.startTangent === undefined) !== (edge.endTangent === undefined)) {
              throw new Error('Spline profile tangency requires both start and end tangents.');
            }
            if (edge.startTangent && edge.endTangent && !edge.periodic) {
              edgeHandles.push(this.#kernel.interpolatePointsWithTangents(
                points,
                asVec3(edge.startTangent),
                asVec3(edge.endTangent),
              ));
            } else {
              edgeHandles.push(this.#kernel.interpolatePoints(points, edge.periodic));
            }
            break;
          }
        }
      }
      return this.#kernel.makeWire(edgeHandles);
    } finally {
      for (const edge of edgeHandles) this.#kernel.release(edge);
    }
  }

  #candidateBounds(handle: ShapeHandle): CadKernelShapeBounds {
    const bounds = this.#kernel.getBoundingBox(handle, false);
    return {
      min: [bounds.xmin, bounds.ymin, bounds.zmin],
      max: [bounds.xmax, bounds.ymax, bounds.zmax],
    };
  }

  #topologyCandidate(
    handle: ShapeHandle,
    producerFeatureId: string,
    kind: TopologyKind,
    index: number,
  ): TopologyCandidate {
    const base = {
      id: `topo:${kind}:${index}`,
      producerFeatureId,
      kind,
      bounds: this.#candidateBounds(handle),
    } as const;

    if (kind === 'vertex') {
      return {
        ...base,
        centroid: fromVec3(this.#kernel.vertexPosition(handle)),
      };
    }

    if (kind === 'edge') {
      const curveType = this.#kernel.curveType(handle);
      const candidate: TopologyCandidate = {
        ...base,
        curveType,
        centroid: fromVec3(this.#kernel.getLinearCenterOfMass(handle)),
        length: this.#kernel.curveLength(handle),
      };
      if (curveType === 'line') {
        const { first, last } = this.#kernel.curveParameters(handle);
        candidate.axis = fromVec3(this.#kernel.curveTangent(handle, (first + last) / 2));
      }
      return candidate;
    }

    const surfaceType = this.#kernel.surfaceType(handle);
    const candidate: TopologyCandidate = {
      ...base,
      surfaceType,
      centroid: fromVec3(this.#kernel.getSurfaceCenterOfMass(handle)),
      area: this.#kernel.getSurfaceArea(handle),
    };
    const uv = this.#kernel.uvBounds(handle);
    if ([uv.uMin, uv.uMax, uv.vMin, uv.vMax].every(Number.isFinite)) {
      candidate.normal = fromVec3(this.#kernel.surfaceNormal(
        handle,
        (uv.uMin + uv.uMax) / 2,
        (uv.vMin + uv.vMax) / 2,
      ));
    }
    return candidate;
  }

  #resolvedSubshapeIndex(id: string, kind: TopologyKind, count: number): number {
    const match = /^topo:(vertex|edge|face):(\d+)$/.exec(id);
    if (!match || match[1] !== kind) {
      throw new Error(`Resolved topology id '${id}' is not an ephemeral ${kind} candidate id.`);
    }
    const index = Number(match[2]);
    if (!Number.isSafeInteger(index) || index < 0 || index >= count) {
      throw new Error(`Resolved topology id '${id}' is outside the current ${kind} candidate range.`);
    }
    return index;
  }

  #withResolvedSubshapes<T>(
    shape: CadKernelShape,
    kind: TopologyKind,
    ids: readonly string[],
    operation: (handles: ShapeHandle[]) => T,
  ): T {
    if (ids.length === 0) throw new Error(`At least one resolved ${kind} candidate is required.`);
    const subshapes = this.#kernel.getSubShapes(this.#unwrap(shape), kind);
    try {
      const indices = ids.map((id) => this.#resolvedSubshapeIndex(id, kind, subshapes.length));
      if (new Set(indices).size !== indices.length) throw new Error(`Resolved ${kind} candidates must be unique.`);
      return operation(indices.map((index) => subshapes[index]!));
    } finally {
      for (const subshape of subshapes) this.#kernel.release(subshape);
    }
  }

  box(width: number, depth: number, height: number): CadKernelShape {
    return this.#wrap(this.#kernel.makeBox(width, depth, height));
  }

  cylinder(radius: number, height: number): CadKernelShape {
    return this.#wrap(this.#kernel.makeCylinder(radius, height));
  }

  sphere(radius: number): CadKernelShape {
    return this.#wrap(this.#kernel.makeSphere(radius));
  }

  cone(radius1: number, radius2: number, height: number): CadKernelShape {
    return this.#wrap(this.#kernel.makeCone(radius1, radius2, height));
  }

  torus(majorRadius: number, minorRadius: number): CadKernelShape {
    return this.#wrap(this.#kernel.makeTorus(majorRadius, minorRadius));
  }

  fuse(left: CadKernelShape, right: CadKernelShape): CadKernelShape {
    return this.#wrap(this.#kernel.fuse(this.#unwrap(left), this.#unwrap(right)));
  }

  cut(left: CadKernelShape, right: CadKernelShape): CadKernelShape {
    return this.#wrap(this.#kernel.cut(this.#unwrap(left), this.#unwrap(right)));
  }

  common(left: CadKernelShape, right: CadKernelShape): CadKernelShape {
    return this.#wrap(this.#kernel.common(this.#unwrap(left), this.#unwrap(right)));
  }

  section(left: CadKernelShape, right: CadKernelShape): CadKernelShape {
    return this.#wrap(this.#kernel.section(this.#unwrap(left), this.#unwrap(right)));
  }

  /** Build an exact wire from already solved and 3D-mapped sketch curves. */
  profileWire(definition: CadSketchWire3d): CadKernelShape {
    return this.#wrap(this.#makeWire(definition));
  }

  helixWire(definition: CadHelixDefinition): CadKernelShape {
    if (!Number.isFinite(definition.pitch) || definition.pitch <= 0) throw new Error('Helix pitch must be a finite positive number.');
    if (!Number.isFinite(definition.height) || definition.height <= 0) throw new Error('Helix height must be a finite positive number.');
    if (!Number.isFinite(definition.radius) || definition.radius <= 0) throw new Error('Helix radius must be a finite positive number.');
    const magnitude = vectorLength(definition.axis);
    if (!Number.isFinite(magnitude) || magnitude <= 0) throw new Error('Helix axis must be a finite non-zero vector.');
    return this.#wrap(this.#kernel.makeHelixWireHanded(
      asVec3(definition.origin),
      asVec3(definition.axis),
      definition.pitch,
      definition.height,
      definition.radius,
      definition.leftHanded ?? false,
    ));
  }

  /**
   * Build a planar exact face from an already solved and 3D-mapped sketch
   * profile. The temporary wire is deterministically released after OCCT has
   * copied it into the returned face.
   */
  profileFace(profile: CadSketchProfile3d): CadKernelShape {
    const wire = this.#makeWire(profile);
    try {
      return this.#wrap(this.#kernel.makeFace(wire));
    } finally {
      this.#kernel.release(wire);
    }
  }

  extrude(profile: CadKernelShape, distance: number, direction: CadKernelVector3): CadKernelShape {
    const magnitude = vectorLength(direction);
    if (!Number.isFinite(magnitude) || magnitude <= 0) throw new Error('Extrusion direction must be a finite non-zero vector.');
    const scale = distance / magnitude;
    return this.#wrap(this.#kernel.extrude(
      this.#unwrap(profile),
      direction[0] * scale,
      direction[1] * scale,
      direction[2] * scale,
    ));
  }

  revolve(
    profile: CadKernelShape,
    axisOrigin: CadKernelVector3,
    axisDirection: CadKernelVector3,
    angle: number,
  ): CadKernelShape {
    return this.#wrap(this.#kernel.revolve(
      this.#unwrap(profile),
      { point: asVec3(axisOrigin), direction: asVec3(axisDirection) },
      angle,
    ));
  }

  sweep(profile: CadKernelShape, path: CadKernelShape): CadKernelShape {
    return this.#wrap(this.#kernel.sweep(this.#unwrap(profile), this.#unwrap(path)));
  }

  loft(sections: readonly CadKernelShape[], solid: boolean): CadKernelShape {
    if (sections.length < 2) throw new Error('A loft requires at least two sections.');
    return this.#wrap(this.#kernel.loft(this.#unwrapMany(sections), solid, false));
  }

  topologyCandidates(
    shape: CadKernelShape,
    producerFeatureId: string,
    kind: TopologyKind,
  ): TopologyCandidate[] {
    const subshapes = this.#kernel.getSubShapes(this.#unwrap(shape), kind);
    try {
      return subshapes.map((subshape, index) => this.#topologyCandidate(subshape, producerFeatureId, kind, index));
    } finally {
      for (const subshape of subshapes) this.#kernel.release(subshape);
    }
  }

  fillet(shape: CadKernelShape, edgeIds: readonly string[], radius: number): CadKernelShape {
    return this.#withResolvedSubshapes(shape, 'edge', edgeIds, (edges) => (
      this.#wrap(this.#kernel.fillet(this.#unwrap(shape), edges, radius))
    ));
  }

  chamfer(shape: CadKernelShape, edgeIds: readonly string[], distance: number): CadKernelShape {
    return this.#withResolvedSubshapes(shape, 'edge', edgeIds, (edges) => (
      this.#wrap(this.#kernel.chamfer(this.#unwrap(shape), edges, distance))
    ));
  }

  shell(shape: CadKernelShape, faceIds: readonly string[], thickness: number): CadKernelShape {
    return this.#withResolvedSubshapes(shape, 'face', faceIds, (faces) => (
      this.#wrap(this.#kernel.shell(this.#unwrap(shape), faces, thickness, 1e-6))
    ));
  }

  draft(shape: CadKernelShape, faceIds: readonly string[], angle: number, direction: CadKernelVector3): CadKernelShape {
    if (faceIds.length !== 1) throw new Error('Draft resolves exactly one face; occt-wasm\'s underlying draft() takes a single face handle.');
    return this.#withResolvedSubshapes(shape, 'face', faceIds, (faces) => (
      this.#wrap(this.#kernel.draft(this.#unwrap(shape), faces[0]!, angle, asVec3(direction)))
    ));
  }

  offset(shape: CadKernelShape, distance: number): CadKernelShape {
    return this.#wrap(this.#kernel.offset(this.#unwrap(shape), distance, 1e-6));
  }

  split(shape: CadKernelShape, tool: CadKernelShape): CadKernelShape[] {
    return [this.#wrap(this.#kernel.split(this.#unwrap(shape), [this.#unwrap(tool)]))];
  }

  mirror(shape: CadKernelShape, planeOrigin: CadKernelVector3, planeNormal: CadKernelVector3): CadKernelShape {
    const magnitude = vectorLength(planeNormal);
    if (!Number.isFinite(magnitude) || magnitude <= 0) throw new Error('Mirror plane normal must be a finite non-zero vector.');
    return this.#wrap(this.#kernel.mirror(this.#unwrap(shape), asVec3(planeOrigin), asVec3(planeNormal)));
  }

  thicken(shape: CadKernelShape, thickness: number): CadKernelShape {
    if (!Number.isFinite(thickness) || thickness === 0) throw new Error('Thicken thickness must be a finite non-zero number.');
    return this.#wrap(this.#kernel.thicken(this.#unwrap(shape), thickness, 1e-6));
  }

  defeature(shape: CadKernelShape, faceIds: readonly string[]): CadKernelShape {
    return this.#withResolvedSubshapes(shape, 'face', faceIds, (faces) => (
      this.#wrap(this.#kernel.defeature(this.#unwrap(shape), faces, 0))
    ));
  }

  heal(shape: CadKernelShape): CadKernelShape {
    return this.#wrap(this.#kernel.healSolid(this.#unwrap(shape)));
  }

  tessellate(shape: CadKernelShape, options: CadKernelTessellationOptions): CadKernelMesh {
    const mesh = this.#kernel.tessellate(this.#unwrap(shape), options);
    return {
      positions: mesh.positions,
      normals: mesh.normals,
      indices: mesh.indices,
    };
  }

  volume(shape: CadKernelShape): number {
    return this.#kernel.getVolume(this.#unwrap(shape));
  }

  area(shape: CadKernelShape): number {
    return this.#kernel.getSurfaceArea(this.#unwrap(shape));
  }

  centerOfMass(shape: CadKernelShape): CadKernelVector3 {
    const center = this.#kernel.getCenterOfMass(this.#unwrap(shape));
    return [center.x, center.y, center.z];
  }

  bounds(shape: CadKernelShape): CadKernelShapeBounds {
    const bounds = this.#kernel.getBoundingBox(this.#unwrap(shape), false);
    return {
      min: [bounds.xmin, bounds.ymin, bounds.zmin],
      max: [bounds.xmax, bounds.ymax, bounds.zmax],
    };
  }

  importStep(data: Uint8Array): CadKernelShape[] {
    const text = new TextDecoder().decode(data);
    return [this.#wrap(this.#kernel.importStep(text))];
  }

  exportStep(shapes: readonly CadKernelShape[]): Uint8Array {
    return this.#withExportShape(shapes, (shape) => new TextEncoder().encode(this.#kernel.exportStep(shape)));
  }

  importBrep(data: Uint8Array): CadKernelShape[] {
    return [this.#wrap(this.#kernel.fromBREPBinary(data))];
  }

  exportBrep(shapes: readonly CadKernelShape[]): Uint8Array {
    return this.#withExportShape(shapes, (shape) => this.#kernel.toBREPBinary(shape));
  }

  exportStl(shape: CadKernelShape, ascii: false): Uint8Array;
  exportStl(shape: CadKernelShape, ascii: true): string;
  exportStl(shape: CadKernelShape, ascii: boolean): string | Uint8Array {
    const handle = this.#unwrap(shape);
    return ascii
      ? this.#kernel.exportStl(handle, undefined, true)
      : this.#kernel.exportStl(handle, undefined, false);
  }

  exportGltf(_shapes: readonly CadKernelShape[]): Uint8Array {
    throw new Error('glTF assembly export is implemented through the XCAF export layer in the G9 export workbench.');
  }

  /** Releases one worker-owned native shape and permanently invalidates its token. */
  release(shape: CadKernelShape): void {
    const token = shape as object;
    const handle = this.#unwrap(shape);
    this.#kernel.release(handle);
    this.#handles.delete(token);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#kernel[Symbol.dispose]();
  }
}

/**
 * Route-lazy exact-kernel factory. The runtime occt-wasm import occurs only
 * when CAD geometry is requested; type-only imports above are erased.
 */
export async function createOcctCadKernelAdapter(
  options: OcctCadKernelAdapterOptions = {},
): Promise<OcctCadKernelAdapter> {
  const { OcctKernel } = await import('occt-wasm');
  const kernel = await OcctKernel.init(options.wasm === undefined ? undefined : { wasm: options.wasm });
  return new OcctCadKernelAdapter(kernel);
}
