const EPSILON = 1e-7;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function safeDenominator(value: number): number {
  if (Math.abs(value) >= 0.15) return value;
  return value < 0 ? -0.15 : 0.15;
}

/**
 * Maps a normalized output coordinate back into normalized source space.
 * This inverse mapping avoids forward-warp holes and is shared by preview/export.
 */
export function mapPhotoGeometryPoint(
  x: number,
  y: number,
  lensDistortion: number,
  perspectiveHorizontal: number,
  perspectiveVertical: number,
): { x: number; y: number } {
  const lens = clamp(lensDistortion, -1, 1);
  const horizontal = clamp(perspectiveHorizontal, -1, 1);
  const vertical = clamp(perspectiveVertical, -1, 1);
  if (Math.abs(lens) < EPSILON && Math.abs(horizontal) < EPSILON && Math.abs(vertical) < EPSILON) {
    return { x, y };
  }

  let nx = x * 2 - 1;
  let ny = y * 2 - 1;

  // Inverse keystone projection. The bounded coefficient keeps the transform
  // useful at the public ±1 range without creating singularities.
  const sourceX = nx / safeDenominator(1 + horizontal * 0.55 * ny);
  const sourceY = ny / safeDenominator(1 + vertical * 0.55 * nx);
  nx = sourceX;
  ny = sourceY;

  // Radial correction around the optical center. Positive values sample
  // farther from center; negative values sample inward.
  const radiusSquared = nx * nx + ny * ny;
  const radial = Math.max(0.05, 1 + lens * 0.35 * radiusSquared);
  nx *= radial;
  ny *= radial;

  return { x: (nx + 1) / 2, y: (ny + 1) / 2 };
}

function sampleBilinear(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  sourceX: number,
  sourceY: number,
  output: Uint8ClampedArray,
  targetOffset: number,
): void {
  if (sourceX < 0 || sourceY < 0 || sourceX > width - 1 || sourceY > height - 1) {
    output[targetOffset] = 0;
    output[targetOffset + 1] = 0;
    output[targetOffset + 2] = 0;
    output[targetOffset + 3] = 0;
    return;
  }

  const x0 = Math.floor(sourceX);
  const y0 = Math.floor(sourceY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = sourceX - x0;
  const ty = sourceY - y0;

  const offset00 = (y0 * width + x0) * 4;
  const offset10 = (y0 * width + x1) * 4;
  const offset01 = (y1 * width + x0) * 4;
  const offset11 = (y1 * width + x1) * 4;

  for (let channel = 0; channel < 4; channel += 1) {
    const top = source[offset00 + channel] * (1 - tx) + source[offset10 + channel] * tx;
    const bottom = source[offset01 + channel] * (1 - tx) + source[offset11 + channel] * tx;
    output[targetOffset + channel] = Math.round(top * (1 - ty) + bottom * ty);
  }
}

export function warpPhotoGeometryPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  lensDistortion: number,
  perspectiveHorizontal: number,
  perspectiveVertical: number,
): Uint8ClampedArray {
  if (width < 1 || height < 1 || pixels.length !== width * height * 4) {
    throw new Error('Photo geometry received invalid pixel dimensions.');
  }

  const lens = clamp(lensDistortion, -1, 1);
  const horizontal = clamp(perspectiveHorizontal, -1, 1);
  const vertical = clamp(perspectiveVertical, -1, 1);
  if (Math.abs(lens) < EPSILON && Math.abs(horizontal) < EPSILON && Math.abs(vertical) < EPSILON) {
    return new Uint8ClampedArray(pixels);
  }

  const output = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const normalizedX = width === 1 ? 0.5 : x / (width - 1);
      const normalizedY = height === 1 ? 0.5 : y / (height - 1);
      const mapped = mapPhotoGeometryPoint(normalizedX, normalizedY, lens, horizontal, vertical);
      const sourceX = mapped.x * Math.max(0, width - 1);
      const sourceY = mapped.y * Math.max(0, height - 1);
      const targetOffset = (y * width + x) * 4;
      sampleBilinear(pixels, width, height, sourceX, sourceY, output, targetOffset);
    }
  }
  return output;
}
