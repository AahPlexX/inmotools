/**
 * Binary GLB builders for browser tests.
 *
 * Kept out of the spec file so every glTF test loads the same shapes, and so a fixture defect is
 * fixed in one place. These are structurally valid GLB 2 containers: 12-byte header, JSON chunk
 * first, 4-byte aligned chunk padding, optional single BIN chunk.
 */

const BIN_CHUNK = 0x004e4942;
const JSON_CHUNK = 0x4e4f534a;

type Chunk = { type: number; data: Uint8Array };

/** Builds a GLB from an explicit chunk list so framing defects can be expressed exactly. */
export function makeGlb(chunks: Chunk[], options: { declaredLength?: number; version?: number } = {}): Buffer {
  const body = chunks.reduce((sum, chunk) => sum + 8 + chunk.data.byteLength, 0);
  const totalLength = 12 + body;
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, options.version ?? 2, true);
  view.setUint32(8, options.declaredLength ?? totalLength, true);
  let offset = 12;
  for (const chunk of chunks) {
    view.setUint32(offset, chunk.data.byteLength, true);
    view.setUint32(offset + 4, chunk.type, true);
    output.set(chunk.data, offset + 8);
    offset += 8 + chunk.data.byteLength;
  }
  return Buffer.from(output);
}

/** Pads to the 4-byte boundary the GLB spec requires and fills with spaces, as JSON chunks demand. */
function pad(text: string): Uint8Array {
  const bytes = new TextEncoder().encode(text);
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4).fill(0x20);
  padded.set(bytes);
  return padded;
}

const jsonChunk = (json: unknown) => pad(JSON.stringify(json));

export function makeTriangleGlb(extra: Record<string, unknown> = {}): Buffer {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const binary = new Uint8Array(44);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), 36);
  return makeGlb([{ type: JSON_CHUNK, data: jsonChunk({
    asset: { version: '2.0', generator: 'InmoTools browser fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Triangle' }],
    meshes: [{ name: 'TriangleMesh', primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR', min: [0], max: [2] },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
    ],
    buffers: [{ byteLength: 44 }],
    ...extra,
  }) }, { type: BIN_CHUNK, data: binary }]);
}

/** A tessellated grid, so a 50% target is a real, measurable reduction rather than a no-op. */
export function makeGridGlb(segments: number): Buffer {
  const side = segments + 1;
  const positions = new Float32Array(side * side * 3);
  const indices = new Uint32Array(segments * segments * 6);
  for (let y = 0; y < side; y += 1) for (let x = 0; x < side; x += 1) {
    const index = y * side + x;
    positions[index * 3] = x / segments;
    positions[index * 3 + 1] = y / segments;
  }
  let cursor = 0;
  for (let y = 0; y < segments; y += 1) for (let x = 0; x < segments; x += 1) {
    const a = y * side + x, b = a + 1, c = a + side, d = c + 1;
    indices[cursor] = a; indices[cursor + 1] = c; indices[cursor + 2] = b;
    indices[cursor + 3] = b; indices[cursor + 4] = c; indices[cursor + 5] = d;
    cursor += 6;
  }
  const positionBytes = new Uint8Array(positions.buffer);
  const indexBytes = new Uint8Array(indices.buffer);
  const binary = new Uint8Array(positionBytes.byteLength + indexBytes.byteLength);
  binary.set(positionBytes, 0);
  binary.set(indexBytes, positionBytes.byteLength);
  return makeGlb([{ type: JSON_CHUNK, data: jsonChunk({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Grid' }],
    meshes: [{ name: 'GridMesh', primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: side * side, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5125, count: segments * segments * 6, type: 'SCALAR', min: [0], max: [side * side - 1] },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positionBytes.byteLength, byteLength: indexBytes.byteLength, target: 34963 },
    ],
    buffers: [{ byteLength: binary.byteLength }],
  }) }, { type: BIN_CHUNK, data: binary }]);
}

/** A model with a real camera and a non-empty animation, so preservation claims are provable. */
export function makeAnimatedGlb(): Buffer {
  const times = new Float32Array([0, 1]);
  const rotations = new Float32Array([0, 0, 0, 1, 0, 0, 0.7071, 0.7071]);
  const timeBytes = new Uint8Array(times.buffer);
  const rotationBytes = new Uint8Array(rotations.buffer);
  const binary = new Uint8Array(timeBytes.byteLength + rotationBytes.byteLength);
  binary.set(timeBytes, 0);
  binary.set(rotationBytes, timeBytes.byteLength);
  return makeGlb([{ type: JSON_CHUNK, data: jsonChunk({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [{ mesh: 0, name: 'Spinning' }, { camera: 0, name: 'Camera' }],
    meshes: [{ name: 'Mesh', primitives: [{ attributes: { POSITION: 0 } }] }],
    cameras: [{ type: 'perspective', perspective: { yfov: 0.8, znear: 0.1, zfar: 100 } }],
    animations: [{ name: 'Spin', samplers: [{ input: 1, output: 2, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
      { bufferView: 2, componentType: 5126, count: 2, type: 'VEC4', min: [0, 0, 0, 0.7], max: [0.71, 0.71, 1, 1] },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: timeBytes.byteLength, target: 34962 },
      { buffer: 0, byteOffset: timeBytes.byteLength, byteLength: timeBytes.byteLength },
      { buffer: 0, byteOffset: timeBytes.byteLength, byteLength: rotationBytes.byteLength },
    ],
    buffers: [{ byteLength: binary.byteLength }],
  }) }, { type: BIN_CHUNK, data: binary }]);
}

/** A model with one embedded image, so texture format policy is exercised end to end. */
export function makeTexturedGlb(mimeType = 'image/png', imageBytes?: Uint8Array): Buffer {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const positionBytes = new Uint8Array(positions.buffer);
  const image = imageBytes ?? new Uint8Array(64).fill(0x42);
  const binary = new Uint8Array(positionBytes.byteLength + image.byteLength);
  binary.set(positionBytes, 0);
  binary.set(image, positionBytes.byteLength);
  return makeGlb([{ type: JSON_CHUNK, data: jsonChunk({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Quad' }],
    meshes: [{ name: 'Mesh', primitives: [{ attributes: { POSITION: 0 } }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }],
    images: [{ bufferView: 1, mimeType }],
    samplers: [{}],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positionBytes.byteLength, byteLength: image.byteLength },
    ],
    buffers: [{ byteLength: binary.byteLength }],
  }) }, { type: BIN_CHUNK, data: binary }]);
}

/** Reads a GLB container back, so a test can assert the downloaded bytes are a usable model. */
export function readGlbSummary(bytes: Buffer): { version: number; declaredLength: number; chunkTypes: string[]; json: Record<string, unknown> } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb container');
  const declaredLength = view.getUint32(8, true);
  const chunkTypes: string[] = [];
  let offset = 12;
  let json: Record<string, unknown> = {};
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(bytes.subarray(offset + 8, offset + 8 + length)).trim());
    chunkTypes.push(type.toString(16).padStart(8, '0'));
    offset += 8 + length;
  }
  return { version: view.getUint32(4, true), declaredLength, chunkTypes, json };
}
