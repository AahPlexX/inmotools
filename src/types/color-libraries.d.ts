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

  export type CuloriColorInput = CuloriColor | string;
  export function parse(value: string): CuloriColor | undefined;
  export function formatHex(color: CuloriColor): string;
  export function converter(mode: 'rgb'): (color: CuloriColorInput) => RgbColor | undefined;
  export function differenceCiede2000(
    Kl?: number, Kc?: number, Kh?: number,
  ): (color1: CuloriColorInput, color2: CuloriColorInput) => number;
}
