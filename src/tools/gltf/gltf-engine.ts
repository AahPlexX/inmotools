import { WebIO, type Document, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

export type GltfTextureFormat = 'preserve' | 'webp';
export type GltfOptimizeOptions = { targetRatio: number; maxTextureDimension: number; textureFormat: GltfTextureFormat };
/** What the run actually achieved. Simplification is lossy and best-effort, so the requested ratio is never reported as the outcome. */
export type GltfGeometryOutcome = { targetRatio: number; measuredRatio: number | null; targetReached: boolean; reductionApplied: boolean; note: string };
export type GltfStats = { meshes: number; primitives: number; vertices: number | null; triangles: number | null; textures: number; cameras: number; animations: number };
/** Statistics read from a decoded document, where geometry counts are always known. */
export type GltfDecodedStats = Omit<GltfStats, 'vertices' | 'triangles'> & { vertices: number; triangles: number };
export type GltfExtensionReport = {
  used: string[];
  required: string[];
  supported: string[];
  unsupported: string[];
  policy: 'registered-preservation' | 'blocked-unknown-extension';
};
export type GltfInspection = {
  stats: GltfStats;
  inputBytes: number;
  extensionsUsed: string[];
  extensionsRequired: string[];
  extensionReport: GltfExtensionReport;
  transformBlockers: string[];
  previewBlockers: string[];
  textureFormats: string[];
};
export type GltfOptimizeReport = {
  resizedTextures: number;
  convertedTextures: number;
  skippedTextures: string[];
  preservedTextureFormats: boolean;
  cameraCountPreserved: boolean;
  animationCountPreserved: boolean;
  animationsPreserved: boolean;
  geometry: GltfGeometryOutcome;
  extensionPreservation: GltfExtensionReport;
  stages: string[];
};
export type GltfOptimizeResult = { bytes: Uint8Array; inputBytes: number; outputBytes: number; before: GltfDecodedStats; after: GltfDecodedStats; options: GltfOptimizeOptions; report: GltfOptimizeReport };
export type GltfRunControl = { signal?: AbortSignal; onProgress?: (progress: number, stage: string) => void };

const REGISTERED_EXTENSION_NAMES = new Set<string>(ALL_EXTENSIONS
  .map((Extension) => String((Extension as unknown as { EXTENSION_NAME?: string }).EXTENSION_NAME ?? ''))
  .filter(Boolean));

export function clampGltfOptions(options: Partial<GltfOptimizeOptions>): GltfOptimizeOptions {
  return {
    targetRatio: Number.isFinite(options.targetRatio) ? Math.max(.05, Math.min(1, Number(options.targetRatio))) : .6,
    maxTextureDimension: Number.isFinite(options.maxTextureDimension) ? Math.max(64, Math.min(8192, Math.round(Number(options.maxTextureDimension)))) : 2048,
    // Converting formats is opt-in: it changes what viewers must support, so the default preserves the source.
    textureFormat: options.textureFormat === 'webp' ? 'webp' : 'preserve',
  };
}

function primitiveElementCount(primitive: Primitive) { return primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0; }
function primitiveTriangleCount(primitive: Primitive) { const count = primitiveElementCount(primitive), mode = Number(primitive.getMode()); if (mode === 4) return Math.floor(count / 3); if (mode === 5 || mode === 6) return Math.max(0, count - 2); return 0; }
function collectStats(document: Document): GltfDecodedStats {
  const root = document.getRoot();
  let primitives = 0, vertices = 0, triangles = 0;
  for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    primitives += 1;
    vertices += primitive.getAttribute('POSITION')?.getCount() ?? 0;
    triangles += primitiveTriangleCount(primitive);
  }
  return { meshes: root.listMeshes().length, primitives, vertices, triangles, textures: root.listTextures().length, cameras: root.listCameras().length, animations: root.listAnimations().length };
}
function collectRawStats(json: Record<string, any>): GltfStats {
  return {
    meshes: (json.meshes ?? []).length,
    primitives: (json.meshes ?? []).reduce((sum: number, mesh: any) => sum + (mesh.primitives?.length ?? 0), 0),
    // Geometry is not decoded on the preflight-blocked path, so these counts are unknown, not zero.
    vertices: null,
    triangles: null,
    textures: (json.textures ?? []).length,
    cameras: (json.cameras ?? []).length,
    animations: (json.animations ?? []).length,
  };
}
function createIo() { return new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }); }
function throwIfAborted(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException('Optimization canceled.', 'AbortError'); }

const GLB_MAGIC = 0x46546c67, GLB_VERSION = 2, GLB_HEADER_BYTES = 12, GLB_CHUNK_HEADER_BYTES = 8;
const GLB_JSON_CHUNK = 0x4e4f534a, GLB_BIN_CHUNK = 0x004e4942;
export type GltfContainer = { json: Record<string, any>; unknownChunkTypes: number[]; hasBinaryChunk: boolean };

/** Validates the GLB 2 container framing described in the glTF 2.0 specification, then returns the JSON chunk. */
export function readGlbContainer(input: Uint8Array): GltfContainer {
  if (input.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES) throw new Error('The selected file is too small to be a GLB document.');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('File is not a binary GLB document.');
  if (view.getUint32(4, true) !== GLB_VERSION) throw new Error('Only glTF 2.0 GLB files are supported.');
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== input.byteLength) throw new Error(`GLB header length declares a ${declaredLength.toLocaleString()} byte file but this file is ${input.byteLength.toLocaleString()} bytes, so the container is truncated or padded.`);

  const unknownChunkTypes: number[] = []; let json: Record<string, any> | null = null, hasBinaryChunk = false, binaryChunkAllowed = true;
  for (let offset = GLB_HEADER_BYTES; offset < declaredLength;) {
    if (offset + GLB_CHUNK_HEADER_BYTES > declaredLength) throw new Error('A GLB chunk header is truncated.');
    const chunkLength = view.getUint32(offset, true), chunkType = view.getUint32(offset + 4, true);
    if (chunkLength % 4 !== 0) throw new Error(`A GLB chunk declares a ${chunkLength} byte length that is not four-byte aligned.`);
    if (offset + GLB_CHUNK_HEADER_BYTES + chunkLength > declaredLength) throw new Error('A GLB chunk payload extends past the declared file length.');
    if (json === null && chunkType !== GLB_JSON_CHUNK) throw new Error('The first GLB chunk must be the JSON chunk.');
    if (chunkType === GLB_JSON_CHUNK) {
      if (json !== null) throw new Error('A GLB file must contain exactly one JSON chunk.');
      json = JSON.parse(new TextDecoder().decode(input.subarray(offset + GLB_CHUNK_HEADER_BYTES, offset + GLB_CHUNK_HEADER_BYTES + chunkLength)).trim());
    } else if (chunkType === GLB_BIN_CHUNK) {
      if (!binaryChunkAllowed || hasBinaryChunk) throw new Error('A GLB file may contain at most one binary chunk, and it must follow the JSON chunk.');
      hasBinaryChunk = true; binaryChunkAllowed = false;
    } else if (!unknownChunkTypes.includes(chunkType)) unknownChunkTypes.push(chunkType);
    offset += GLB_CHUNK_HEADER_BYTES + chunkLength;
  }

  if (!json) throw new Error('GLB JSON chunk is missing or invalid.');
  if (String(json?.asset?.version ?? '') !== '2.0') throw new Error(`Unsupported glTF asset version ${String(json?.asset?.version ?? 'missing')}; this tool reads glTF 2.0 assets.`);
  const embeddedFirstBuffer = (json.buffers as any[] | undefined)?.[0];
  if (embeddedFirstBuffer && embeddedFirstBuffer.uri === undefined && !hasBinaryChunk) throw new Error('The JSON references an embedded binary buffer but this GLB has no binary chunk.');
  return { json, unknownChunkTypes, hasBinaryChunk };
}

export function readGlbJson(input: Uint8Array): Record<string, any> {
  return readGlbContainer(input).json;
}

export function classifyGltfExtensions(extensionsUsed: readonly string[], extensionsRequired: readonly string[]): GltfExtensionReport {
  const used = [...new Set(extensionsUsed.map(String))];
  const required = [...new Set(extensionsRequired.map(String))];
  const unsupported = used.filter((name) => !REGISTERED_EXTENSION_NAMES.has(name));
  const supported = used.filter((name) => REGISTERED_EXTENSION_NAMES.has(name));
  return {
    used,
    required,
    supported,
    unsupported,
    policy: unsupported.length ? 'blocked-unknown-extension' : 'registered-preservation',
  };
}

export async function inspectGlb(input: Uint8Array): Promise<GltfInspection> {
  const container = readGlbContainer(input);
  const json = container.json;
  const extensionsUsed: string[] = Array.isArray(json.extensionsUsed) ? (json.extensionsUsed as unknown[]).map((value) => String(value)) : [];
  const extensionsRequired: string[] = Array.isArray(json.extensionsRequired) ? (json.extensionsRequired as unknown[]).map((value) => String(value)) : [];
  const extensionReport = classifyGltfExtensions(extensionsUsed, extensionsRequired);
  const transformBlockers: string[] = [], previewBlockers: string[] = [];

  if (container.unknownChunkTypes.length) {
    const types = container.unknownChunkTypes.map((type) => `0x${type.toString(16).padStart(8, '0')}`).join(', ');
    transformBlockers.push(`Transformation is blocked because this GLB contains unknown chunk type${container.unknownChunkTypes.length === 1 ? '' : 's'} ${types}. Unknown chunk payloads cannot be guaranteed to survive a glTF Transform read/write cycle, so the original bytes are preserved instead of producing lossy output.`);
  }
  if (extensionReport.unsupported.length) {
    transformBlockers.push(`Transformation is blocked because this GLB uses unregistered extension${extensionReport.unsupported.length === 1 ? '' : 's'} ${extensionReport.unsupported.join(', ')}. Unknown extension payloads cannot be guaranteed to survive a glTF Transform read/write cycle, so the original bytes are preserved instead of producing lossy output.`);
  }
  if (extensionsUsed.includes('KHR_draco_mesh_compression')) {
    const message = 'KHR_draco_mesh_compression requires a Draco decoder, which this build does not bundle.';
    transformBlockers.push(`${message} Transformation is disabled to avoid corrupt output.`);
    previewBlockers.push(`${message} Preview is disabled instead of rendering an incomplete model.`);
  }
  if (extensionsUsed.includes('KHR_texture_basisu')) previewBlockers.push('KHR_texture_basisu preview requires a KTX2 transcoder, which this build does not bundle. Optimization can preserve the texture unchanged.');

  const textureFormats: string[] = [...new Set<string>(((json.images ?? []) as unknown[]).map((image: any) => String(image?.mimeType ?? 'unknown')))];
  if (transformBlockers.length) return { stats: collectRawStats(json), inputBytes: input.byteLength, extensionsUsed, extensionsRequired, extensionReport, transformBlockers, previewBlockers, textureFormats };

  await MeshoptDecoder.ready;
  const document = await createIo().readBinary(input);
  return { stats: collectStats(document), inputBytes: input.byteLength, extensionsUsed, extensionsRequired, extensionReport, transformBlockers, previewBlockers, textureFormats };
}

async function resizeBrowserTextures(document: Document, maximumDimension: number, textureFormat: GltfTextureFormat, control: GltfRunControl, report: GltfOptimizeReport) {
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    report.skippedTextures.push('Texture resize unavailable: browser image/canvas APIs are missing.');
    return;
  }
  const textures = document.getRoot().listTextures();
  for (let index = 0; index < textures.length; index += 1) {
    throwIfAborted(control.signal);
    const texture = textures[index], image = texture.getImage(), mimeType = texture.getMimeType();
    control.onProgress?.(.45 + .35 * (index / Math.max(1, textures.length)), `Inspecting texture ${index + 1} of ${textures.length}`);
    if (!image || !mimeType || !/^image\/(png|jpeg|webp)$/i.test(mimeType)) {
      report.skippedTextures.push(`${texture.getName() || `Texture ${index + 1}`}: unsupported or unknown image format.`);
      continue;
    }
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(new Blob([image.slice().buffer], { type: mimeType }));
      const longest = Math.max(bitmap.width, bitmap.height);
      if (longest <= maximumDimension) continue;
      const scale = maximumDimension / longest, width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d');
      if (!context) { report.skippedTextures.push(`${texture.getName() || `Texture ${index + 1}`}: 2D canvas unavailable.`); continue; }
      context.drawImage(bitmap, 0, 0, width, height);
      // Preserve mode re-encodes in place. Opt-in WebP asks for a different format and is verified before use.
      const targetMimeType = textureFormat === 'webp' ? 'image/webp' : mimeType;
      const quality = targetMimeType === 'image/jpeg' || targetMimeType === 'image/webp' ? .9 : undefined;
      const encoded = await canvas.convertToBlob(quality === undefined ? { type: targetMimeType } : { type: targetMimeType, quality });
      if (encoded.type !== targetMimeType || !encoded.size) {
        const reason = textureFormat === 'webp' ? 'the browser could not encode WebP' : `the browser could not re-encode ${mimeType} without changing format`;
        report.skippedTextures.push(`${texture.getName() || `Texture ${index + 1}`}: ${reason}; the original texture and format were preserved.`);
        continue;
      }
      texture.setImage(new Uint8Array(await encoded.arrayBuffer()));
      texture.setMimeType(targetMimeType);
      report.resizedTextures += 1;
      if (targetMimeType !== mimeType) report.convertedTextures += 1;
    } catch {
      report.skippedTextures.push(`${texture.getName() || `Texture ${index + 1}`}: decode/resize failed; original preserved.`);
    } finally { bitmap?.close(); }
  }
}

/** Animation identity that geometry and texture work must not alter: names, targets, and sampler shape. */
function animationSignatures(document: Document) {
  return document.getRoot().listAnimations().map((animation) => JSON.stringify({
    name: animation.getName(),
    channels: animation.listChannels().map((channel) => {
      const targetNode = channel.getTargetNode();
      return { path: channel.getTargetPath(), node: targetNode ? document.getRoot().listNodes().indexOf(targetNode) : -1, interpolation: channel.getSampler()?.getInterpolation() ?? 'LINEAR' };
    }),
    samplerCount: animation.listSamplers().length,
  }));
}

export async function optimizeGlb(input: Uint8Array, requestedOptions: GltfOptimizeOptions, control: GltfRunControl = {}): Promise<GltfOptimizeResult> {
  const inspection = await inspectGlb(input);
  if (inspection.transformBlockers.length) throw new Error(inspection.transformBlockers.join(' '));
  throwIfAborted(control.signal);
  const options = clampGltfOptions(requestedOptions);
  control.onProgress?.(.08, 'Reading GLB without modifying source');
  await MeshoptDecoder.ready;
  const io = createIo(), document = await io.readBinary(input), before = collectStats(document);
  const animationsBefore = animationSignatures(document);
  const report: GltfOptimizeReport = {
    resizedTextures: 0,
    convertedTextures: 0,
    skippedTextures: [],
    preservedTextureFormats: true,
    cameraCountPreserved: true,
    animationCountPreserved: true,
    animationsPreserved: true,
    geometry: { targetRatio: options.targetRatio, measuredRatio: null, targetReached: true, reductionApplied: false, note: '' },
    extensionPreservation: inspection.extensionReport,
    stages: [],
  };

  if (options.targetRatio < .999 && before.triangles > 1) {
    throwIfAborted(control.signal);
    control.onProgress?.(.2, 'Simplifying mesh geometry');
    await MeshoptSimplifier.ready;
    await document.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: options.targetRatio, error: .01 }), dedup());
    report.stages.push('Mesh simplification');
  } else report.stages.push('Geometry unchanged (100% target)');

  throwIfAborted(control.signal);
  await resizeBrowserTextures(document, options.maxTextureDimension, options.textureFormat, control, report);
  report.preservedTextureFormats = report.convertedTextures === 0;
  report.stages.push(report.convertedTextures ? 'Texture resize with opt-in WebP conversion' : 'Texture resize with original MIME formats preserved');
  const after = collectStats(document);
  report.cameraCountPreserved = after.cameras === before.cameras;
  report.animationCountPreserved = after.animations === before.animations;
  report.animationsPreserved = JSON.stringify(animationSignatures(document)) === JSON.stringify(animationsBefore);
  report.geometry = describeGeometryOutcome(before.triangles, after.triangles, options.targetRatio);
  if (!report.cameraCountPreserved) throw new Error('Optimization unexpectedly changed the camera count; output was not written.');
  if (!report.animationCountPreserved) throw new Error('Optimization unexpectedly changed the animation count; output was not written.');
  if (!report.animationsPreserved) throw new Error('Optimization unexpectedly changed animation targets or samplers; output was not written.');
  throwIfAborted(control.signal);
  // The bundled writer cannot emit a PNG/JPEG fallback beside a WebP image, so the extension is required.
  if (report.convertedTextures > 0) document.createExtension(EXTTextureWebP).setRequired(true);
  control.onProgress?.(.88, 'Writing optimized GLB');
  const bytes = await io.writeBinary(document);
  throwIfAborted(control.signal);
  control.onProgress?.(1, 'Optimization complete');
  return { bytes, inputBytes: input.byteLength, outputBytes: bytes.byteLength, before, after, options, report };
}

/** Reports what simplification actually achieved, which may be short of the requested target. */
function describeGeometryOutcome(beforeTriangles: number, afterTriangles: number, targetRatio: number): GltfGeometryOutcome {
  const measuredRatio = beforeTriangles > 0 ? afterTriangles / beforeTriangles : null;
  const reductionApplied = afterTriangles < beforeTriangles;
  const targetReached = beforeTriangles === 0 || afterTriangles <= Math.ceil(beforeTriangles * targetRatio);
  const note = targetReached
    ? `Simplification is lossy and best-effort; the measured result reached the ${Math.round(targetRatio * 100)}% target.`
    : `Simplification is lossy and best-effort, and mesh topology or error limits left the result above the ${Math.round(targetRatio * 100)}% target.`;
  return { targetRatio, measuredRatio, targetReached, reductionApplied, note };
}
