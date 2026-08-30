import { describe, expect, it } from 'vitest';
import { clampGltfOptions, optimizeGlb } from '../../src/tools/gltf/gltf-engine';

function makeTriangleGlb(): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const binary = new Uint8Array(44);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), 36);

  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'InmoTools unit fixture' },
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
  });
  const encoder = new TextEncoder();
  const rawJson = encoder.encode(json);
  const jsonLength = Math.ceil(rawJson.length / 4) * 4;
  const totalLength = 12 + 8 + jsonLength + 8 + binary.length;
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20, 20 + jsonLength);
  output.set(rawJson, 20);
  const binHeader = 20 + jsonLength;
  view.setUint32(binHeader, binary.length, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  output.set(binary, binHeader + 8);
  return output;
}

describe('glTF optimizer engine', () => {
  it('clamps lossy controls to safe supported bounds', () => {
    expect(clampGltfOptions({ targetRatio: 4, maxTextureDimension: 16 })).toEqual({
      targetRatio: 1,
      maxTextureDimension: 64,
    });
    expect(clampGltfOptions({ targetRatio: -1, maxTextureDimension: 99_999 })).toEqual({
      targetRatio: 0.05,
      maxTextureDimension: 8192,
    });
  });

  it('round-trips a generated triangle GLB with stable scene structure', async () => {
    const input = makeTriangleGlb();
    const result = await optimizeGlb(input, { targetRatio: 1, maxTextureDimension: 1024 });

    expect(new DataView(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength).getUint32(0, true)).toBe(0x46546c67);
    expect(result.inputBytes).toBe(input.byteLength);
    expect(result.outputBytes).toBe(result.bytes.byteLength);
    expect(result.before.meshes).toBe(1);
    expect(result.after.meshes).toBe(1);
    expect(result.before.triangles).toBe(1);
    expect(result.after.triangles).toBe(1);
  });
});
