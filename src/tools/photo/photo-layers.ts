import { clonePhotoMask } from './photo-mask';
import type { PhotoBlendMode, PhotoLayer } from './photo-types';

export const PHOTO_BLEND_MODES: PhotoBlendMode[] = [
  'normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light',
  'darken', 'lighten', 'color', 'luminosity', 'hue', 'saturation',
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function softLightChannel(base: number, top: number): number {
  // W3C compositing-and-blending soft-light formula.
  if (top <= 0.5) return base - (1 - 2 * top) * base * (1 - base);
  const d = base <= 0.25 ? ((16 * base - 12) * base + 4) * base : Math.sqrt(base);
  return base + (2 * top - 1) * (d - base);
}

function separableChannel(mode: PhotoBlendMode, base: number, top: number): number {
  switch (mode) {
    case 'normal': return top;
    case 'multiply': return base * top;
    case 'screen': return 1 - (1 - base) * (1 - top);
    case 'overlay': return separableChannel('hard-light', top, base);
    case 'hard-light': return top <= 0.5 ? 2 * base * top : 1 - 2 * (1 - base) * (1 - top);
    case 'soft-light': return softLightChannel(base, top);
    case 'darken': return Math.min(base, top);
    case 'lighten': return Math.max(base, top);
    default: return top;
  }
}

const NON_SEPARABLE: ReadonlySet<PhotoBlendMode> = new Set(['color', 'luminosity', 'hue', 'saturation']);

function luminance([r, g, b]: readonly [number, number, number]): number {
  return 0.3 * r + 0.59 * g + 0.11 * b;
}

function clipColor(c: [number, number, number]): [number, number, number] {
  const l = luminance(c);
  const n = Math.min(c[0], c[1], c[2]);
  const x = Math.max(c[0], c[1], c[2]);
  const result: [number, number, number] = [...c];
  if (n < 0) for (let i = 0; i < 3; i += 1) result[i] = l + ((result[i] - l) * l) / (l - n);
  if (x > 1) for (let i = 0; i < 3; i += 1) result[i] = l + ((result[i] - l) * (1 - l)) / (x - l);
  return result;
}

function setLum(c: [number, number, number], l: number): [number, number, number] {
  const d = l - luminance(c);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
}

function saturationSpread([r, g, b]: readonly [number, number, number]): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function setSat(c: [number, number, number], s: number): [number, number, number] {
  const order = [0, 1, 2].sort((a, b) => c[a] - c[b]);
  const [minIndex, midIndex, maxIndex] = order;
  const result: [number, number, number] = [0, 0, 0];
  if (c[maxIndex] > c[minIndex]) {
    result[midIndex] = ((c[midIndex] - c[minIndex]) * s) / (c[maxIndex] - c[minIndex]);
    result[maxIndex] = s;
  }
  result[minIndex] = 0;
  return result;
}

/** Blends one top-layer pixel over a base pixel, both normalized [0,1] RGB, per the selected mode. */
export function blendChannels(mode: PhotoBlendMode, base: readonly [number, number, number], top: readonly [number, number, number]): [number, number, number] {
  if (!NON_SEPARABLE.has(mode)) {
    return [
      separableChannel(mode, base[0], top[0]),
      separableChannel(mode, base[1], top[1]),
      separableChannel(mode, base[2], top[2]),
    ];
  }
  const baseArr: [number, number, number] = [base[0], base[1], base[2]];
  const topArr: [number, number, number] = [top[0], top[1], top[2]];
  if (mode === 'hue') return setLum(setSat(topArr, saturationSpread(baseArr)), luminance(baseArr));
  if (mode === 'saturation') return setLum(setSat(baseArr, saturationSpread(topArr)), luminance(baseArr));
  if (mode === 'color') return setLum(topArr, luminance(baseArr));
  return setLum(baseArr, luminance(topArr)); // luminosity
}

export function cloneLayer(layer: PhotoLayer): PhotoLayer {
  return {
    ...layer,
    transform: { ...layer.transform },
    mask: layer.mask ? clonePhotoMask(layer.mask) : layer.mask,
  };
}

export function createLayer(id: string, name: string, sourceDataUrl: string, sourceWidth: number, sourceHeight: number): PhotoLayer {
  return {
    id,
    name,
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
    mask: null,
    sourceDataUrl,
    sourceWidth,
    sourceHeight,
  };
}

export function normalizeLayerFields(layer: {
  id?: unknown; name?: unknown; visible?: unknown; opacity?: unknown; blendMode?: unknown;
  transform?: { x?: unknown; y?: unknown; scale?: unknown; rotation?: unknown };
  sourceDataUrl?: unknown; sourceWidth?: unknown; sourceHeight?: unknown;
}): Pick<PhotoLayer, 'id' | 'name' | 'visible' | 'opacity' | 'blendMode' | 'transform' | 'sourceDataUrl' | 'sourceWidth' | 'sourceHeight'> {
  const blendMode = typeof layer.blendMode === 'string' && (PHOTO_BLEND_MODES as string[]).includes(layer.blendMode)
    ? layer.blendMode as PhotoBlendMode
    : 'normal';
  return {
    id: typeof layer.id === 'string' && layer.id ? layer.id : 'layer',
    name: typeof layer.name === 'string' && layer.name ? layer.name.slice(0, 80) : 'Layer',
    visible: layer.visible === undefined ? true : Boolean(layer.visible),
    opacity: clamp01(Number(layer.opacity ?? 1)),
    blendMode,
    transform: {
      x: clamp01(Number(layer.transform?.x ?? 0.5)),
      y: clamp01(Number(layer.transform?.y ?? 0.5)),
      scale: Math.min(20, Math.max(0.01, Number(layer.transform?.scale ?? 1) || 1)),
      rotation: Number.isFinite(Number(layer.transform?.rotation)) ? Number(layer.transform?.rotation) % 360 : 0,
    },
    sourceDataUrl: typeof layer.sourceDataUrl === 'string' ? layer.sourceDataUrl : '',
    sourceWidth: Math.max(1, Math.round(Number(layer.sourceWidth) || 1)),
    sourceHeight: Math.max(1, Math.round(Number(layer.sourceHeight) || 1)),
  };
}
