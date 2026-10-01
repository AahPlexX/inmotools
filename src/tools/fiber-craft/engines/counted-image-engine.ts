import type { ColorSlot, CountedThreadCell, FiberCraftDocument } from '../fiber-craft-types';

type Rgb = readonly [number, number, number];

export interface CountedImageQuantizationInput {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  readonly rows: number;
  readonly cols: number;
  readonly maxColors: number;
  readonly dither: boolean;
}

export interface CountedImageQuantizationResult {
  readonly rows: number;
  readonly cols: number;
  readonly palette: readonly ColorSlot[];
  readonly cells: readonly CountedThreadCell[];
}

const distanceSq = (a: Rgb, b: Rgb) => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
};
const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
const rgbKey = (rgb: Rgb) => `${rgb[0]},${rgb[1]},${rgb[2]}`;
const toHex = (rgb: Rgb) => `#${rgb.map((value) => clampChannel(value).toString(16).padStart(2, '0')).join('')}`;

const validateInput = (input: CountedImageQuantizationInput) => {
  if (!Number.isInteger(input.width) || input.width < 1 || !Number.isInteger(input.height) || input.height < 1) {
    throw new Error('Image dimensions must be positive integers.');
  }
  if (input.pixels.length !== input.width * input.height * 4) {
    throw new Error('Image pixel buffer does not match its dimensions.');
  }
  if (!Number.isInteger(input.rows) || input.rows < 1 || input.rows > 300
    || !Number.isInteger(input.cols) || input.cols < 1 || input.cols > 300) {
    throw new Error('Counted chart dimensions must be between 1 and 300.');
  }
  if (!Number.isInteger(input.maxColors) || input.maxColors < 1 || input.maxColors > 64) {
    throw new Error('Color limit must be between 1 and 64.');
  }
};

const sampleTargetCells = (input: CountedImageQuantizationInput): Rgb[] => {
  const samples: Rgb[] = [];
  for (let row = 0; row < input.rows; row += 1) {
    const y0 = Math.floor((row * input.height) / input.rows);
    const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * input.height) / input.rows));    for (let col = 0; col < input.cols; col += 1) {
      const x0 = Math.floor((col * input.width) / input.cols);
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * input.width) / input.cols));
      let r = 0; let g = 0; let b = 0; let count = 0;
      for (let y = y0; y < Math.min(y1, input.height); y += 1) {
        for (let x = x0; x < Math.min(x1, input.width); x += 1) {
          const index = (y * input.width + x) * 4;
          const alpha = input.pixels[index + 3] / 255;
          r += input.pixels[index] * alpha + 255 * (1 - alpha);
          g += input.pixels[index + 1] * alpha + 255 * (1 - alpha);
          b += input.pixels[index + 2] * alpha + 255 * (1 - alpha);
          count += 1;
        }
      }
      samples.push([clampChannel(r / count), clampChannel(g / count), clampChannel(b / count)]);
    }
  }
  return samples;
};

const buildPalette = (samples: readonly Rgb[], maxColors: number): Rgb[] => {
  const counts = new Map<string, { rgb: Rgb; count: number }>();
  for (const rgb of samples) {
    const key = rgbKey(rgb);
    const existing = counts.get(key);
    counts.set(key, existing ? { rgb, count: existing.count + 1 } : { rgb, count: 1 });
  }
  const unique = [...counts.values()].sort((a, b) => b.count - a.count || rgbKey(a.rgb).localeCompare(rgbKey(b.rgb)));
  if (unique.length <= maxColors) return unique.map((entry) => entry.rgb);  const centroids: Rgb[] = [unique[0].rgb];
  while (centroids.length < maxColors) {
    let candidate = unique[0].rgb;
    let bestDistance = -1;
    for (const entry of unique) {
      const nearestDistance = Math.min(...centroids.map((centroid) => distanceSq(entry.rgb, centroid)));
      const weighted = nearestDistance * entry.count;
      if (weighted > bestDistance) {
        bestDistance = weighted;
        candidate = entry.rgb;
      }
    }
    if (centroids.some((centroid) => rgbKey(centroid) === rgbKey(candidate))) break;
    centroids.push(candidate);
  }

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (const entry of unique) {
      let bestIndex = 0;
      for (let index = 1; index < centroids.length; index += 1) {
        if (distanceSq(entry.rgb, centroids[index]) < distanceSq(entry.rgb, centroids[bestIndex])) bestIndex = index;
      }
      const bucket = sums[bestIndex];
      bucket.r += entry.rgb[0] * entry.count;
      bucket.g += entry.rgb[1] * entry.count;
      bucket.b += entry.rgb[2] * entry.count;
      bucket.count += entry.count;
    }    for (let index = 0; index < centroids.length; index += 1) {
      const bucket = sums[index];
      if (!bucket.count) continue;
      centroids[index] = [
        clampChannel(bucket.r / bucket.count),
        clampChannel(bucket.g / bucket.count),
        clampChannel(bucket.b / bucket.count),
      ];
    }
  }

  return [...new Map(centroids.map((rgb) => [rgbKey(rgb), rgb])).values()];
};

const nearestPaletteIndex = (rgb: Rgb, palette: readonly Rgb[]) => {
  let best = 0;
  for (let index = 1; index < palette.length; index += 1) {
    if (distanceSq(rgb, palette[index]) < distanceSq(rgb, palette[best])) best = index;
  }
  return best;
};

const assignPalette = (samples: readonly Rgb[], palette: readonly Rgb[], rows: number, cols: number, dither: boolean) => {
  if (!dither) return samples.map((rgb) => nearestPaletteIndex(rgb, palette));
  const work = samples.map((rgb) => [rgb[0], rgb[1], rgb[2]] as [number, number, number]);
  const assignments = Array<number>(samples.length).fill(0);
  const spread = (index: number, error: readonly number[], weight: number) => {
    if (index < 0 || index >= work.length) return;
    for (let channel = 0; channel < 3; channel += 1) work[index][channel] += error[channel] * weight;
  };  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const current = work[index] as Rgb;
      const paletteIndex = nearestPaletteIndex(current, palette);
      assignments[index] = paletteIndex;
      const chosen = palette[paletteIndex];
      const error = [current[0] - chosen[0], current[1] - chosen[1], current[2] - chosen[2]];
      if (col + 1 < cols) spread(index + 1, error, 7 / 16);
      if (row + 1 < rows) {
        if (col > 0) spread(index + cols - 1, error, 3 / 16);
        spread(index + cols, error, 5 / 16);
        if (col + 1 < cols) spread(index + cols + 1, error, 1 / 16);
      }
    }
  }
  return assignments;
};

export const quantizeCountedImage = (
  input: CountedImageQuantizationInput,
): CountedImageQuantizationResult => {
  validateInput(input);
  const samples = sampleTargetCells(input);
  const rgbPalette = buildPalette(samples, Math.min(input.maxColors, samples.length));
  const assignments = assignPalette(samples, rgbPalette, input.rows, input.cols, input.dither);  const palette: readonly ColorSlot[] = rgbPalette.map((rgb, index) => ({
    id: `image-${index + 1}`,
    label: `Image color ${index + 1}`,
    hex: toHex(rgb),
  }));
  const cells: readonly CountedThreadCell[] = assignments.map((paletteIndex, index) => ({
    row: Math.floor(index / input.cols),
    col: index % input.cols,
    stitchKind: 'full-cross',
    colorId: palette[paletteIndex].id,
  }));
  return { rows: input.rows, cols: input.cols, palette, cells };
};

export const applyCountedImageResult = (
  document: FiberCraftDocument,
  result: CountedImageQuantizationResult,
  now = new Date().toISOString(),
): FiberCraftDocument => {
  if (result.cells.length !== result.rows * result.cols || result.palette.length === 0) {
    throw new Error('Quantized counted-thread result is incomplete.');
  }
  const paletteIds = new Set(result.palette.map((color) => color.id));
  if (result.cells.some((cell) => !cell.colorId || !paletteIds.has(cell.colorId))) {
    throw new Error('Quantized counted-thread cells reference an unknown color.');
  }
  return {
    ...document,
    metadata: { ...document.metadata, discipline: 'cross-stitch', updatedAt: now },
    palette: result.palette,
    chart: {
      kind: 'counted-thread',
      rows: result.rows,
      cols: result.cols,
      cells: result.cells,
      knots: [],
      backstitches: [],
    },
  };
};