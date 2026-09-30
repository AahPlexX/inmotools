import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampGltfOptions, classifyGltfExtensions, inspectGlb, optimizeGlb, readGlbJson } from '../../src/tools/gltf/gltf-engine';

afterEach(() => { vi.unstubAllGlobals(); });

function makeTriangleGlb(extra: Record<string, unknown> = {}): Uint8Array {
  const positions = new Float32Array([0,0,0,1,0,0,0,1,0]); const indices = new Uint16Array([0,1,2]); const binary = new Uint8Array(44); binary.set(new Uint8Array(positions.buffer),0); binary.set(new Uint8Array(indices.buffer),36);
  const json = JSON.stringify({ asset:{version:'2.0',generator:'InmoTools unit fixture'}, scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0,name:'Triangle'}], meshes:[{name:'TriangleMesh',primitives:[{attributes:{POSITION:0},indices:1}]}], accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:'SCALAR',min:[0],max:[2]}], bufferViews:[{buffer:0,byteOffset:0,byteLength:36,target:34962},{buffer:0,byteOffset:36,byteLength:6,target:34963}], buffers:[{byteLength:44}], ...extra });
  const rawJson=new TextEncoder().encode(json),jsonLength=Math.ceil(rawJson.length/4)*4,totalLength=12+8+jsonLength+8+binary.length,output=new Uint8Array(totalLength),view=new DataView(output.buffer);view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,totalLength,true);view.setUint32(12,jsonLength,true);view.setUint32(16,0x4e4f534a,true);output.fill(0x20,20,20+jsonLength);output.set(rawJson,20);const binHeader=20+jsonLength;view.setUint32(binHeader,binary.length,true);view.setUint32(binHeader+4,0x004e4942,true);output.set(binary,binHeader+8);return output;
}

/** Builds a GLB from an explicit chunk list so framing defects can be expressed exactly. */
function makeGlb(chunks: Array<{ type: number; data: Uint8Array }>, options: { declaredLength?: number; version?: number } = {}): Uint8Array {
  const body = chunks.reduce((sum, chunk) => sum + 8 + chunk.data.byteLength, 0);
  const totalLength = 12 + body, output = new Uint8Array(totalLength), view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, options.version ?? 2, true); view.setUint32(8, options.declaredLength ?? totalLength, true);
  let offset = 12;
  for (const chunk of chunks) { view.setUint32(offset, chunk.data.byteLength, true); view.setUint32(offset + 4, chunk.type, true); output.set(chunk.data, offset + 8); offset += 8 + chunk.data.byteLength; }
  return output;
}

const pad = (text: string) => { const bytes = new TextEncoder().encode(text); const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4).fill(0x20); padded.set(bytes); return padded; };
const jsonChunk = (json: unknown) => pad(JSON.stringify(json));
const BIN_CHUNK = 0x004e4942, JSON_CHUNK = 0x4e4f534a, VENDOR_CHUNK = 0x00000001;
const MINIMAL_JSON = { asset: { version: '2.0' } };

/** A tessellated grid: enough triangles that a 50% target is a real, measurable reduction. */
function makeGridGlb(segments: number): Uint8Array {
  const side = segments + 1, positions = new Float32Array(side * side * 3), indices = new Uint32Array(segments * segments * 6);
  for (let y = 0; y < side; y += 1) for (let x = 0; x < side; x += 1) { const index = y * side + x; positions[index * 3] = x / segments; positions[index * 3 + 1] = y / segments; }
  let cursor = 0;
  for (let y = 0; y < segments; y += 1) for (let x = 0; x < segments; x += 1) {
    const a = y * side + x, b = a + 1, c = a + side, d = c + 1;
    indices[cursor] = a; indices[cursor + 1] = c; indices[cursor + 2] = b; indices[cursor + 3] = b; indices[cursor + 4] = c; indices[cursor + 5] = d; cursor += 6;
  }
  const positionBytes = new Uint8Array(positions.buffer), indexBytes = new Uint8Array(indices.buffer);
  const binary = new Uint8Array(positionBytes.byteLength + indexBytes.byteLength); binary.set(positionBytes, 0); binary.set(indexBytes, positionBytes.byteLength);
  const positionOffset = 0, indexOffset = positionBytes.byteLength;
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'Grid' }], meshes: [{ name: 'GridMesh', primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], accessors: [{ bufferView: 0, componentType: 5126, count: side * side, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5125, count: segments * segments * 6, type: 'SCALAR', min: [0], max: [side * side - 1] }], bufferViews: [{ buffer: 0, byteOffset: positionOffset, byteLength: positionBytes.byteLength, target: 34962 }, { buffer: 0, byteOffset: indexOffset, byteLength: indexBytes.byteLength, target: 34963 }], buffers: [{ byteLength: binary.byteLength }] };
  return makeGlb([{ type: JSON_CHUNK, data: jsonChunk(json) }, { type: BIN_CHUNK, data: binary }]);
}

/** A model with a real camera and a non-empty animation so preservation is provable, not vacuous. */
function makeAnimatedGlb(): Uint8Array {
  const times = new Float32Array([0, 1]), rotations = new Float32Array([0, 0, 0, 1, 0, 0, 0.7071, 0.7071]);
  const timeBytes = new Uint8Array(times.buffer), rotationBytes = new Uint8Array(rotations.buffer);
  const binary = new Uint8Array(timeBytes.byteLength + rotationBytes.byteLength); binary.set(timeBytes, 0); binary.set(rotationBytes, timeBytes.byteLength);
  const rotationOffset = timeBytes.byteLength;
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0, 1] }], nodes: [{ mesh: 0, name: 'Spinning' }, { camera: 0, name: 'Camera' }],
    meshes: [{ name: 'Mesh', primitives: [{ attributes: { POSITION: 0 } }] }],
    cameras: [{ type: 'perspective', perspective: { yfov: .8, znear: .1, zfar: 100 } }],
    animations: [{ name: 'Spin', samplers: [{ input: 1, output: 2, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] }, { bufferView: 2, componentType: 5126, count: 2, type: 'VEC4', min: [0, 0, 0, 0.7], max: [0.71, 0.71, 1, 1] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: timeBytes.byteLength, target: 34962 }, { buffer: 0, byteOffset: timeBytes.byteLength, byteLength: timeBytes.byteLength }, { buffer: 0, byteOffset: rotationOffset, byteLength: rotationBytes.byteLength }],
    buffers: [{ byteLength: binary.byteLength }],
  };
  return makeGlb([{ type: JSON_CHUNK, data: jsonChunk(json) }, { type: BIN_CHUNK, data: binary }]);
}

/** A model with one embedded image, so texture policy is exercised end to end. */
function makeTexturedGlb(mimeType: string): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), positionBytes = new Uint8Array(positions.buffer);
  const image = new Uint8Array(64).fill(0x42), binary = new Uint8Array(positionBytes.byteLength + image.byteLength);
  binary.set(positionBytes, 0); binary.set(image, positionBytes.byteLength);
  const imageOffset = positionBytes.byteLength;
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'Quad' }],
    meshes: [{ name: 'Mesh', primitives: [{ attributes: { POSITION: 0 } }] }], materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }], images: [{ bufferView: 1, mimeType }], samplers: [{}],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength, target: 34962 }, { buffer: 0, byteOffset: imageOffset, byteLength: image.byteLength }],
    buffers: [{ byteLength: binary.byteLength }],
  };
  return makeGlb([{ type: JSON_CHUNK, data: jsonChunk(json) }, { type: BIN_CHUNK, data: binary }]);
}

/** Replaces the browser image/canvas seam so texture policy is testable without platform codecs. */
function installCodecStub(options: { image: [number, number]; encodeAs?: string }) {
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: options.image[0], height: options.image[1], close: vi.fn() })));
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) {}
    getContext() { return { drawImage: vi.fn() }; }
    async convertToBlob() { const type = options.encodeAs ?? 'image/png'; return { type, size: 16, arrayBuffer: async () => new Uint8Array(16).fill(1).buffer }; }
  });
}

describe('glTF optimizer engine',()=>{
 it('clamps lossy controls to supported bounds',()=>{expect(clampGltfOptions({targetRatio:4,maxTextureDimension:16})).toEqual({targetRatio:1,maxTextureDimension:64,textureFormat:'preserve'});expect(clampGltfOptions({targetRatio:-1,maxTextureDimension:99999})).toEqual({targetRatio:.05,maxTextureDimension:8192,textureFormat:'preserve'});});
 it('inspects original GLB bytes without invoking a transform or rewriting them',async()=>{const input=makeTriangleGlb();const before=input.slice();const inspection=await inspectGlb(input);expect(input).toEqual(before);expect(inspection.stats.meshes).toBe(1);expect(inspection.stats.triangles).toBe(1);expect(inspection.inputBytes).toBe(input.byteLength);expect(inspection.extensionReport.policy).toBe('registered-preservation');});
 it('blocks unknown optional extensions before a read/write cycle can silently discard their payload',async()=>{const input=makeTriangleGlb({extensionsUsed:['VENDOR_unknown_payload'],extensions:{VENDOR_unknown_payload:{importantId:'00123'}}});const inspection=await inspectGlb(input);expect(inspection.extensionReport.unsupported).toEqual(['VENDOR_unknown_payload']);expect(inspection.extensionReport.policy).toBe('blocked-unknown-extension');expect(inspection.transformBlockers.join(' ')).toMatch(/unknown|unregistered|preserv/i);expect(readGlbJson(input).extensions.VENDOR_unknown_payload.importantId).toBe('00123');await expect(optimizeGlb(input,{targetRatio:1,maxTextureDimension:1024})).rejects.toThrow(/VENDOR_unknown_payload|unregistered|preserv/i);});
 it('classifies registered Khronos extensions separately from unknown payloads',()=>{const report=classifyGltfExtensions(['KHR_materials_unlit','VENDOR_custom'],[]);expect(report.supported).toContain('KHR_materials_unlit');expect(report.unsupported).toContain('VENDOR_custom');});
 it('preflights Draco as unsupported rather than trying to transform undecodable geometry',async()=>{const input=makeTriangleGlb({extensionsUsed:['KHR_draco_mesh_compression'],extensionsRequired:['KHR_draco_mesh_compression']});const inspection=await inspectGlb(input);expect(inspection.transformBlockers.join(' ')).toMatch(/Draco decoder/i);await expect(optimizeGlb(input,{targetRatio:.5,maxTextureDimension:1024})).rejects.toThrow(/Draco decoder/i);});
 it('round-trips an uncompressed triangle while preserving cameras and source texture formats policy',async()=>{const input=makeTriangleGlb({cameras:[{type:'perspective',perspective:{yfov:.8,znear:.1}}]});const result=await optimizeGlb(input,{targetRatio:1,maxTextureDimension:1024});expect(new DataView(result.bytes.buffer,result.bytes.byteOffset,result.bytes.byteLength).getUint32(0,true)).toBe(0x46546c67);expect(result.before.meshes).toBe(1);expect(result.after.meshes).toBe(1);expect(result.before.triangles).toBe(1);expect(result.after.triangles).toBe(1);expect(result.report.preservedTextureFormats).toBe(true);expect(result.report.cameraCountPreserved).toBe(true);expect(result.report.animationCountPreserved).toBe(true);expect(result.report.extensionPreservation.unsupported).toEqual([]);});
 it('parses only a valid glTF 2.0 JSON chunk',()=>{expect(readGlbJson(makeTriangleGlb()).asset.version).toBe('2.0');expect(()=>readGlbJson(new Uint8Array(24))).toThrow(/GLB|glTF/i);});
 it('rejects a header whose declared total length disagrees with the file size',()=>{const truncated=makeTriangleGlb().slice(0,-4);expect(()=>readGlbJson(truncated)).toThrow(/length|truncat/i);expect(()=>readGlbJson(makeGlb([{type:JSON_CHUNK,data:jsonChunk(MINIMAL_JSON)}],{declaredLength:9999}))).toThrow(/length/i);});
 it('rejects a document whose first chunk is not JSON',()=>{expect(()=>readGlbJson(makeGlb([{type:BIN_CHUNK,data:pad('payload')}]))).toThrow(/JSON/i);});
 it('rejects a truncated chunk header and a chunk payload that runs past the declared length',()=>{const short=makeTriangleGlb().slice(0,19);expect(()=>readGlbJson(short)).toThrow(/small|length|truncat/i);const glb=makeTriangleGlb(),view=new DataView(glb.buffer,glb.byteOffset,glb.byteLength),binHeader=20+view.getUint32(12,true);view.setUint32(binHeader,glb.byteLength,true);expect(()=>readGlbJson(glb)).toThrow(/chunk|length|truncat/i);});
 it('rejects a chunk length that is not four-byte aligned',()=>{const glb=makeGlb([{type:JSON_CHUNK,data:new Uint8Array(21).fill(0x20)}]);expect(()=>readGlbJson(glb)).toThrow(/align/i);});
 it('rejects invalid JSON and any asset version other than 2.0',()=>{
  expect(()=>readGlbJson(makeGlb([{type:JSON_CHUNK,data:pad('{ not json')}]))).toThrow(/JSON/i);
  expect(()=>readGlbJson(makeGlb([{type:JSON_CHUNK,data:jsonChunk({asset:{version:'1.0'}})}]))).toThrow(/2\.0|version/i);
  expect(()=>readGlbJson(makeGlb([{type:JSON_CHUNK,data:jsonChunk({scenes:[]})}]))).toThrow(/asset|version/i);
 });
 it('rejects a second JSON chunk and a BIN chunk that appears twice or before the JSON chunk',()=>{expect(()=>readGlbJson(makeGlb([{type:JSON_CHUNK,data:jsonChunk(MINIMAL_JSON)},{type:JSON_CHUNK,data:jsonChunk(MINIMAL_JSON)}]))).toThrow(/JSON/i);expect(()=>readGlbJson(makeGlb([{type:JSON_CHUNK,data:jsonChunk(MINIMAL_JSON)},{type:BIN_CHUNK,data:pad('a')},{type:BIN_CHUNK,data:pad('b')}]))).toThrow(/BIN/i);expect(()=>readGlbJson(makeGlb([{type:BIN_CHUNK,data:pad('a')},{type:JSON_CHUNK,data:jsonChunk(MINIMAL_JSON)}]))).toThrow(/JSON/i);});
 it('requires a BIN chunk when the JSON declares an embedded first buffer without a URI',()=>{const embedded={asset:{version:'2.0'},buffers:[{byteLength:4}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],accessors:[{bufferView:0,componentType:5126,count:1,type:'VEC3'}]};expect(()=>readGlbJson(makeGlb([{type:JSON_CHUNK,data:jsonChunk(embedded)}]))).toThrow(/BIN|buffer/i);expect(()=>readGlbJson(makeGlb([{type:JSON_CHUNK,data:jsonChunk(embedded)},{type:BIN_CHUNK,data:new Uint8Array(4)}]))).not.toThrow();});
 it('inspects an unknown chunk but blocks rewriting because its payload cannot be guaranteed to survive',async()=>{const input=makeGlb([{type:JSON_CHUNK,data:jsonChunk(MINIMAL_JSON)},{type:VENDOR_CHUNK,data:new Uint8Array(4).fill(7)}]);const before=input.slice();const inspection=await inspectGlb(input);expect(input).toEqual(before);expect(inspection.transformBlockers.join(' ')).toMatch(/unknown chunk|unregistered chunk|preserv/i);await expect(optimizeGlb(input,{targetRatio:1,maxTextureDimension:1024})).rejects.toThrow(/unknown chunk|preserv/i);});
 it('reports blocked geometry counts as unavailable rather than a misleading zero',async()=>{const input=makeTriangleGlb({extensionsUsed:['VENDOR_unknown_payload'],extensions:{VENDOR_unknown_payload:{importantId:'00123'}}});const inspection=await inspectGlb(input);expect(inspection.stats.vertices).toBeNull();expect(inspection.stats.triangles).toBeNull();expect(inspection.stats.meshes).toBe(1);expect(inspection.stats.primitives).toBe(1);expect(inspection.stats.textures).toBe(0);});
 it('still reports real geometry counts for a readable model',async()=>{const inspection=await inspectGlb(makeTriangleGlb());expect(inspection.stats.vertices).toBe(3);expect(inspection.stats.triangles).toBe(1);const result=await optimizeGlb(makeTriangleGlb(),{targetRatio:1,maxTextureDimension:1024});expect(result.before.triangles).toBe(1);expect(result.after.triangles).toBe(1);});
 it('measures real polygon reduction and reports the achieved ratio',async()=>{const input=makeGridGlb(16);const original=input.slice();const result=await optimizeGlb(input,{targetRatio:.5,maxTextureDimension:1024});expect(input).toEqual(original);expect(result.before.triangles).toBeGreaterThan(500);expect(result.after.triangles).toBeLessThan(result.before.triangles);expect(result.report.geometry.targetRatio).toBe(.5);expect(result.report.geometry.measuredRatio).toBeGreaterThan(0);expect(result.report.geometry.measuredRatio).toBeLessThanOrEqual(1);expect(result.report.geometry.targetReached).toBe(result.after.triangles <= Math.ceil(result.before.triangles * .5));expect(result.report.geometry.reductionApplied).toBe(true);});
 it('does not claim a reduction that the simplifier could not achieve',async()=>{const input=makeGridGlb(4);const result=await optimizeGlb(input,{targetRatio:.05,maxTextureDimension:1024});expect(result.report.geometry.targetRatio).toBe(.05);if(!result.report.geometry.targetReached)expect(result.report.geometry.measuredRatio).toBeGreaterThan(.05);expect(result.report.geometry.note).toMatch(/lossy|best.effort|not.*exact|topology/i);});
 it('leaves geometry untouched and says so at a 100% target',async()=>{const result=await optimizeGlb(makeGridGlb(8),{targetRatio:1,maxTextureDimension:1024});expect(result.after.triangles).toBe(result.before.triangles);expect(result.report.geometry.reductionApplied).toBe(false);expect(result.report.geometry.targetReached).toBe(true);});
 it('re-reads its own output as a valid GLB built from the current source',async()=>{const result=await optimizeGlb(makeTriangleGlb({cameras:[{type:'perspective',perspective:{yfov:.8,znear:.1}}]}),{targetRatio:1,maxTextureDimension:1024});const view=new DataView(result.bytes.buffer,result.bytes.byteOffset,result.bytes.byteLength);expect(view.getUint32(0,true)).toBe(0x46546c67);expect(view.getUint32(8,true)).toBe(result.bytes.byteLength);expect(readGlbJson(result.bytes).asset.version).toBe('2.0');const reinspection=await inspectGlb(result.bytes);expect(reinspection.transformBlockers).toEqual([]);expect(reinspection.stats.meshes).toBe(1);});
 it('preserves a non-empty animation and its camera through the read/write cycle',async()=>{const input=makeAnimatedGlb();const result=await optimizeGlb(input,{targetRatio:1,maxTextureDimension:1024});const before=await inspectGlb(input),after=await inspectGlb(result.bytes);expect(before.stats.animations).toBe(1);expect(after.stats.animations).toBe(1);expect(after.stats.cameras).toBe(1);expect(result.report.animationCountPreserved).toBe(true);expect(result.report.cameraCountPreserved).toBe(true);expect(result.report.animationsPreserved).toBe(true);const readBack=readGlbJson(result.bytes);expect(readBack.animations[0].name).toBe('Spin');expect(readBack.animations[0].channels[0].target.path).toBe('rotation');expect(readBack.animations[0].channels.length).toBe(1);expect(readBack.animations[0].samplers[0].interpolation).toBe('LINEAR');});
 it('defaults to preserving source texture formats and never converts by default',async()=>{expect(clampGltfOptions({targetRatio:1,maxTextureDimension:1024}).textureFormat).toBe('preserve');expect(clampGltfOptions({targetRatio:1,maxTextureDimension:1024,textureFormat:'nonsense' as any}).textureFormat).toBe('preserve');});
 it('resizes a texture only in its own MIME format and reports the count',async()=>{installCodecStub({image:[2048,1024]});try{const result=await optimizeGlb(makeTexturedGlb('image/png'),{targetRatio:1,maxTextureDimension:1024});expect(result.report.resizedTextures).toBe(1);expect(result.report.convertedTextures).toBe(0);expect(result.report.preservedTextureFormats).toBe(true);const json=readGlbJson(result.bytes);expect(json.images[0].mimeType).toBe('image/png');expect(json.extensionsUsed ?? []).not.toContain('EXT_texture_webp');}finally{vi.unstubAllGlobals();}});
 it('keeps the original texture and reports a skip when the browser cannot re-encode the source format',async()=>{installCodecStub({image:[2048,1024],encodeAs:'image/webp'});try{const input=makeTexturedGlb('image/png');const original=input.slice();const result=await optimizeGlb(input,{targetRatio:1,maxTextureDimension:1024});expect(input).toEqual(original);expect(result.report.resizedTextures).toBe(0);expect(result.report.skippedTextures.join(' ')).toMatch(/re-encode|format/i);expect(readGlbJson(result.bytes).images[0].mimeType).toBe('image/png');}finally{vi.unstubAllGlobals();}});
 it('reports a skip instead of failing when browser image APIs are missing',async()=>{vi.stubGlobal('createImageBitmap',undefined);vi.stubGlobal('OffscreenCanvas',undefined);try{const result=await optimizeGlb(makeTexturedGlb('image/png'),{targetRatio:1,maxTextureDimension:1024});expect(result.report.resizedTextures).toBe(0);expect(result.report.skippedTextures.join(' ')).toMatch(/unavailable|missing|api/i);expect(readGlbJson(result.bytes).images[0].mimeType).toBe('image/png');}finally{vi.unstubAllGlobals();}});
 it('converts to WebP only on explicit opt-in and requires EXT_texture_webp only when it converted something',async()=>{installCodecStub({image:[2048,1024],encodeAs:'image/webp'});try{const converted=await optimizeGlb(makeTexturedGlb('image/png'),{targetRatio:1,maxTextureDimension:1024,textureFormat:'webp'});expect(converted.report.convertedTextures).toBe(1);const json=readGlbJson(converted.bytes);expect(json.images[0].mimeType).toBe('image/webp');expect(json.extensionsUsed).toContain('EXT_texture_webp');expect(json.extensionsRequired).toContain('EXT_texture_webp');expect(json.textures[0].extensions.EXT_texture_webp).toBeDefined();expect(json.textures[0].source).toBeUndefined();}finally{vi.unstubAllGlobals();}});
 it('does not add a required extension when an opted-in WebP conversion produced nothing',async()=>{vi.stubGlobal('createImageBitmap',undefined);vi.stubGlobal('OffscreenCanvas',undefined);try{const result=await optimizeGlb(makeTexturedGlb('image/png'),{targetRatio:1,maxTextureDimension:1024,textureFormat:'webp'});expect(result.report.convertedTextures).toBe(0);const json=readGlbJson(result.bytes);expect(json.images[0].mimeType).toBe('image/png');expect(json.extensionsUsed ?? []).not.toContain('EXT_texture_webp');expect(json.extensionsRequired ?? []).not.toContain('EXT_texture_webp');}finally{vi.unstubAllGlobals();}});
});
