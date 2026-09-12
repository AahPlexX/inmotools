import type { InitOptions, OcctKernel, ShapeHandle } from 'occt-wasm';
import type {
  CadExactKernel,
  CadKernelMesh,
  CadKernelShape,
  CadKernelShapeBounds,
  CadKernelTessellationOptions,
  CadKernelVector3,
} from './kernel-contract';

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

  fillet(_shape: CadKernelShape, _edgeIds: readonly string[], _radius: number): CadKernelShape {
    throw new Error('Fillet requires semantic topology IDs to be resolved to OCCT edge handles by the G6 feature evaluator.');
  }

  chamfer(_shape: CadKernelShape, _edgeIds: readonly string[], _distance: number): CadKernelShape {
    throw new Error('Chamfer requires semantic topology IDs to be resolved to OCCT edge handles by the G6 feature evaluator.');
  }

  shell(_shape: CadKernelShape, _faceIds: readonly string[], _thickness: number): CadKernelShape {
    throw new Error('Shell requires semantic topology IDs to be resolved to OCCT face handles by the G6 feature evaluator.');
  }

  draft(
    _shape: CadKernelShape,
    _faceIds: readonly string[],
    _angle: number,
    _direction: CadKernelVector3,
  ): CadKernelShape {
    throw new Error('Draft requires semantic topology IDs to be resolved to OCCT face handles by the G6 feature evaluator.');
  }

  offset(shape: CadKernelShape, distance: number): CadKernelShape {
    return this.#wrap(this.#kernel.offset(this.#unwrap(shape), distance, 1e-6));
  }

  split(shape: CadKernelShape, tool: CadKernelShape): CadKernelShape[] {
    return [this.#wrap(this.#kernel.split(this.#unwrap(shape), [this.#unwrap(tool)]))];
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
