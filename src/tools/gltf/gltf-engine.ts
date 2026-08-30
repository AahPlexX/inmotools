import { WebIO, type Document, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

export type GltfOptimizeOptions = {
  targetRatio: number;
  maxTextureDimension: number;
};

export type GltfStats = {
  meshes: number;
  primitives: number;
  vertices: number;
  triangles: number;
  textures: number;
};

export type GltfOptimizeResult = {
  bytes: Uint8Array;
  inputBytes: number;
  outputBytes: number;
  before: GltfStats;
  after: GltfStats;
  options: GltfOptimizeOptions;
};

export function clampGltfOptions(options: Partial<GltfOptimizeOptions>): GltfOptimizeOptions {
  const targetRatio = Number.isFinite(options.targetRatio)
    ? Math.max(0.05, Math.min(1, Number(options.targetRatio)))
    : 0.6;
  const maxTextureDimension = Number.isFinite(options.maxTextureDimension)
    ? Math.max(64, Math.min(8192, Math.round(Number(options.maxTextureDimension))))
    : 2048;
  return { targetRatio, maxTextureDimension };
}

function primitiveElementCount(primitive: Primitive): number {
  return primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0;
}

function primitiveTriangleCount(primitive: Primitive): number {
  const count = primitiveElementCount(primitive);
  const mode = Number(primitive.getMode());
  if (mode === 4) return Math.floor(count / 3); // TRIANGLES
  if (mode === 5 || mode === 6) return Math.max(0, count - 2); // STRIP / FAN
  return 0;
}

function collectStats(document: Document): GltfStats {
  const root = document.getRoot();
  const meshes = root.listMeshes();
  let primitives = 0;
  let vertices = 0;
  let triangles = 0;
  for (const mesh of meshes) {
    for (const primitive of mesh.listPrimitives()) {
      primitives += 1;
      vertices += primitive.getAttribute('POSITION')?.getCount() ?? 0;
      triangles += primitiveTriangleCount(primitive);
    }
  }
  return {
    meshes: meshes.length,
    primitives,
    vertices,
    triangles,
    textures: root.listTextures().length,
  };
}

function createIo(): WebIO {
  return new WebIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}


async function resizeBrowserTextures(document: Document, maximumDimension: number): Promise<void> {
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') return;
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    const mimeType = texture.getMimeType();
    if (!image || !mimeType || !/^image\/(png|jpeg|webp)$/i.test(mimeType)) continue;
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(new Blob([image.slice().buffer], { type: mimeType }));
      const longest = Math.max(bitmap.width, bitmap.height);
      const scale = Math.min(1, maximumDimension / Math.max(1, longest));
      if (scale >= 1 && mimeType === 'image/webp') continue;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.drawImage(bitmap, 0, 0, width, height);
      const encoded = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
      if (encoded.type !== 'image/webp' || !encoded.size) continue;
      texture.setImage(new Uint8Array(await encoded.arrayBuffer()));
      texture.setMimeType('image/webp');
    } catch {
      // Browser decoder/encoder support is optional. Preserve the original texture on failure.
    } finally {
      bitmap?.close();
    }
  }
}

export async function optimizeGlb(
  input: Uint8Array,
  requestedOptions: GltfOptimizeOptions,
): Promise<GltfOptimizeResult> {
  if (input.byteLength < 12) throw new Error('The selected file is too small to be a GLB document.');
  const options = clampGltfOptions(requestedOptions);
  await MeshoptDecoder.ready;
  const io = createIo();
  const document = await io.readBinary(input);
  const before = collectStats(document);

  if (options.targetRatio < 0.999 && before.triangles > 1) {
    await MeshoptSimplifier.ready;
    await document.transform(
      weld(),
      simplify({
        simplifier: MeshoptSimplifier,
        ratio: options.targetRatio,
        error: 0.01,
      }),
      dedup(),
      prune(),
    );
  } else {
    await document.transform(dedup(), prune());
  }

  await resizeBrowserTextures(document, options.maxTextureDimension);
  const after = collectStats(document);
  const bytes = await io.writeBinary(document);
  return {
    bytes,
    inputBytes: input.byteLength,
    outputBytes: bytes.byteLength,
    before,
    after,
    options,
  };
}
