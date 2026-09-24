/** Deterministic, separable image resampling for final export resizing.
 *
 * `browser` keeps the canvas `drawImage` scaler (fast, implementation-defined). The other kernels
 * are computed here so the same input always produces the same bytes on every browser:
 * - `lanczos3`: windowed sinc, support 3 — sharpest, slight ringing on hard edges.
 * - `bicubic`: Catmull-Rom cubic (B = 0, C = 0.5) — crisp, mild overshoot.
 * - `mitchell`: Mitchell–Netravali cubic (B = C = 1/3) — balanced sharpness vs. ringing.
 * - `bilinear`: triangle filter — soft, no ringing.
 * When downscaling, each kernel is stretched by the scale factor so it also low-pass filters,
 * which prevents the aliasing a fixed-width kernel produces. Filtering runs on linear-light,
 * alpha-premultiplied values so dark fringes and transparent-edge halos do not appear. */

export type PhotoResamplingKernel = 'browser' | 'lanczos3' | 'bicubic' | 'mitchell' | 'bilinear';

export const PHOTO_RESAMPLING_KERNELS: Array<{ id: PhotoResamplingKernel; label: string; description: string }> = [
  { id: 'browser', label: 'Browser default', description: 'Fast; exact pixels can vary slightly between browsers.' },
  { id: 'lanczos3', label: 'Lanczos (sharpest)', description: 'Best detail when shrinking; may ring slightly on hard edges.' },
  { id: 'mitchell', label: 'Mitchell (balanced)', description: 'Sharp without visible halos. A good default for photos.' },
  { id: 'bicubic', label: 'Bicubic (crisp)', description: 'Classic Catmull-Rom cubic; a little crisper than Mitchell.' },
  { id: 'bilinear', label: 'Bilinear (soft)', description: 'Smooth result with no ringing at all.' },
];

export function normalizeResamplingKernel(value: unknown): PhotoResamplingKernel {
  return PHOTO_RESAMPLING_KERNELS.some((kernel) => kernel.id === value) ? value as PhotoResamplingKernel : 'browser';
}

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

/** Mitchell–Netravali family; (B, C) = (0, 0.5) is Catmull-Rom, (1/3, 1/3) is Mitchell. */
function cubic(x: number, b: number, c: number): number {
  const t = Math.abs(x);
  if (t < 1) return ((12 - 9 * b - 6 * c) * t ** 3 + (-18 + 12 * b + 6 * c) * t ** 2 + (6 - 2 * b)) / 6;
  if (t < 2) return ((-b - 6 * c) * t ** 3 + (6 * b + 30 * c) * t ** 2 + (-12 * b - 48 * c) * t + (8 * b + 24 * c)) / 6;
  return 0;
}

interface Kernel { support: number; weight: (x: number) => number }

function kernelFor(id: Exclude<PhotoResamplingKernel, 'browser'>): Kernel {
  if (id === 'lanczos3') return { support: 3, weight: (x) => (Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0) };
  if (id === 'bicubic') return { support: 2, weight: (x) => cubic(x, 0, 0.5) };
  if (id === 'mitchell') return { support: 2, weight: (x) => cubic(x, 1 / 3, 1 / 3) };
  return { support: 1, weight: (x) => Math.max(0, 1 - Math.abs(x)) };
}

interface Contributions { start: Int32Array; count: Int32Array; weights: Float32Array; stride: number }

/** Precomputes, for every output coordinate, which input samples contribute and with what
 * normalized weight (pixel-centre aligned: in = (out + 0.5) / scale − 0.5). */
function contributions(inSize: number, outSize: number, kernel: Kernel): Contributions {
  const scale = outSize / inSize;
  const stretch = scale < 1 ? 1 / scale : 1;
  const support = kernel.support * stretch;
  const stride = Math.ceil(support * 2) + 2;
  const start = new Int32Array(outSize);
  const count = new Int32Array(outSize);
  const weights = new Float32Array(outSize * stride);
  for (let out = 0; out < outSize; out += 1) {
    const centre = (out + 0.5) / scale - 0.5;
    const first = Math.max(0, Math.ceil(centre - support));
    const last = Math.min(inSize - 1, Math.floor(centre + support));
    let total = 0;
    let n = 0;
    for (let i = first; i <= last && n < stride; i += 1) {
      const w = kernel.weight((i - centre) / stretch);
      weights[out * stride + n] = w;
      total += w;
      n += 1;
    }
    if (n === 0) {
      // Degenerate edge case (tiny inputs): take the nearest sample.
      start[out] = Math.min(inSize - 1, Math.max(0, Math.round(centre)));
      weights[out * stride] = 1;
      count[out] = 1;
      continue;
    }
    if (total !== 0) for (let k = 0; k < n; k += 1) weights[out * stride + k] /= total;
    start[out] = first;
    count[out] = n;
  }
  return { start, count, weights, stride };
}

const SRGB_TO_LINEAR = (() => {
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) {
    const v = i / 255;
    table[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }
  return table;
})();

function linearToSrgbByte(value: number): number {
  const v = value <= 0 ? 0 : value >= 1 ? 1 : value;
  const encoded = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

/** Resizes RGBA8 pixels to `outWidth × outHeight` with the chosen kernel. */
export function resamplePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  outWidth: number,
  outHeight: number,
  kernelId: Exclude<PhotoResamplingKernel, 'browser'>,
): Uint8ClampedArray<ArrayBuffer> {
  if (!(width > 0 && height > 0 && outWidth > 0 && outHeight > 0)) throw new Error('Resampling needs positive dimensions.');
  if (pixels.length < width * height * 4) throw new Error('Resampling input is smaller than its dimensions.');
  const kernel = kernelFor(kernelId);
  const horizontal = contributions(width, outWidth, kernel);
  const vertical = contributions(height, outHeight, kernel);

  // Pass 1 (horizontal): source rows → linear premultiplied float rows of the output width.
  const intermediate = new Float32Array(outWidth * height * 4);
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < outWidth; x += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      const base = x * horizontal.stride;
      const first = horizontal.start[x];
      for (let k = 0; k < horizontal.count[x]; k += 1) {
        const w = horizontal.weights[base + k];
        const o = row + (first + k) * 4;
        const alpha = pixels[o + 3] / 255;
        r += w * SRGB_TO_LINEAR[pixels[o]] * alpha;
        g += w * SRGB_TO_LINEAR[pixels[o + 1]] * alpha;
        b += w * SRGB_TO_LINEAR[pixels[o + 2]] * alpha;
        a += w * alpha;
      }
      const t = (y * outWidth + x) * 4;
      intermediate[t] = r; intermediate[t + 1] = g; intermediate[t + 2] = b; intermediate[t + 3] = a;
    }
  }

  // Pass 2 (vertical): float rows → output bytes, un-premultiplied and re-encoded to sRGB.
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y += 1) {
    const base = y * vertical.stride;
    const first = vertical.start[y];
    for (let x = 0; x < outWidth; x += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let k = 0; k < vertical.count[y]; k += 1) {
        const w = vertical.weights[base + k];
        const t = ((first + k) * outWidth + x) * 4;
        r += w * intermediate[t]; g += w * intermediate[t + 1]; b += w * intermediate[t + 2]; a += w * intermediate[t + 3];
      }
      const o = (y * outWidth + x) * 4;
      const alpha = a <= 0 ? 0 : a >= 1 ? 1 : a;
      if (alpha > 0) {
        out[o] = linearToSrgbByte(r / alpha);
        out[o + 1] = linearToSrgbByte(g / alpha);
        out[o + 2] = linearToSrgbByte(b / alpha);
      }
      out[o + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}
