export interface PhotoColorReadout {
  r: number;
  g: number;
  b: number;
  a: number;
  hue: number;
  saturation: number;
  lightness: number;
  hex: string;
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

export function photoColorReadout(r: number, g: number, b: number, a = 255): PhotoColorReadout {
  const red = clampByte(r);
  const green = clampByte(g);
  const blue = clampByte(b);
  const alpha = clampByte(a);
  const [hue, saturation, lightness] = rgbToHsl(red, green, blue);
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
