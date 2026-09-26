export interface PhotoColorReadout {
  r: number;
  g: number;
  b: number;
  a: number;
  hue: number;
  saturation: number;
  lightness: number;
  hex: string;
  xyz: { x: number; y: number; z: number };
  lab: { l: number; a: number; b: number };
}

export type PhotoClippingKind = 'shadow' | 'highlight' | null;

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = clampByte(r) / 255;
  const green = clampByte(g) / 255;
  const blue = clampByte(b) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];

  const delta = max - min;
  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min);
  let hue = 0;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return [hue * 60, saturation, lightness];
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function rgbToXyzLab(r: number, g: number, b: number): Pick<PhotoColorReadout, 'xyz' | 'lab'> {
  const linear = [r, g, b].map((value) => {
    const channel = clampByte(value) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const x = (linear[0] * 0.4124564 + linear[1] * 0.3575761 + linear[2] * 0.1804375) * 100;
  const y = (linear[0] * 0.2126729 + linear[1] * 0.7151522 + linear[2] * 0.072175) * 100;
  const z = (linear[0] * 0.0193339 + linear[1] * 0.119192 + linear[2] * 0.9503041) * 100;
  const labCurve = (value: number) => value > 216 / 24389
    ? Math.cbrt(value)
    : (24389 / 27 * value + 16) / 116;
  const fx = labCurve(x / 95.047);
  const fy = labCurve(y / 100);
  const fz = labCurve(z / 108.883);
  return {
    xyz: { x: roundTwo(x), y: roundTwo(y), z: roundTwo(z) },
    lab: {
      l: roundTwo(116 * fy - 16),
      a: roundTwo(500 * (fx - fy)),
      b: roundTwo(200 * (fy - fz)),
    },
  };
}

export function photoColorReadout(r: number, g: number, b: number, a = 255): PhotoColorReadout {
  const red = clampByte(r);
  const green = clampByte(g);
  const blue = clampByte(b);
  const alpha = clampByte(a);
  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
  const colorimetric = rgbToXyzLab(red, green, blue);
  const hex = `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  return {
    r: red,
    g: green,
    b: blue,
    a: alpha,
    hue: Math.round(hue),
    saturation: Math.round(saturation * 100),
    lightness: Math.round(lightness * 100),
    hex,
    ...colorimetric,
  };
}

export function classifyPhotoClipping(
  r: number,
  g: number,
  b: number,
  shadowThreshold = 5,
  highlightThreshold = 250,
): PhotoClippingKind {
  const red = clampByte(r);
  const green = clampByte(g);
  const blue = clampByte(b);
  if (Math.max(red, green, blue) <= shadowThreshold) return 'shadow';
  if (Math.max(red, green, blue) >= highlightThreshold) return 'highlight';
  return null;
}
