declare module 'apca-w3' {
  export function calcAPCA(
    textColor: string | number | number[] | Record<string, unknown>,
    backgroundColor: string | number | number[] | Record<string, unknown>,
  ): number | string;
}

declare module 'culori' {
  export type CuloriColor = {
    mode: string;
    alpha?: number;
    [key: string]: unknown;
  };

  export type RgbColor = CuloriColor & {
    mode: 'rgb';
    r: number;
    g: number;
    b: number;
  };

  export function parse(value: string): CuloriColor | undefined;
  export function formatHex(color: CuloriColor | string): string;
  export function converter(mode: 'rgb'): (color: CuloriColor | string) => RgbColor | undefined;
  /** Perceptual interpolation between two or more colours. */
  export function interpolate(
    colors: readonly (string | CuloriColor)[],
    mode?: string,
  ): (position: number) => CuloriColor;
  /** WCAG 2 contrast ratio between two colours, from 1 to 21. */
  export function wcagContrast(first: string | CuloriColor, second: string | CuloriColor): number;
}
