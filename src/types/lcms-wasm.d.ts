declare module 'lcms-wasm' {
  export interface LcmsModule {
    cmsOpenProfileFromMem(bytes: Uint8Array, length: number): number;
    cmsCloseProfile(profile: number): void;
    cmsCreate_sRGBProfile(): number;
    cmsGetProfileInfoASCII(profile: number, info: number, language: string, country: string): string;
    cmsGetColorSpaceASCII(profile: number): string | null;
    cmsCreateTransform(input: number, inputFormat: number, output: number, outputFormat: number, intent: number, flags: number): number;
    cmsCreateProofingTransform(input: number, inputFormat: number, output: number, outputFormat: number, proof: number, intent: number, proofIntent: number, flags: number): number;
    cmsDeleteTransform(transform: number): void;
    cmsDoTransform(transform: number, input: Uint8Array, size: number): Uint8Array;
  }

  export interface LcmsInstantiateOptions {
    locateFile?: (name: string) => string;
  }

  export function instantiate(options?: LcmsInstantiateOptions): Promise<LcmsModule>;
  export const LCMS_VERSION: number;
  export const TYPE_RGB_8: number;
  export const cmsInfoDescription: number;
  export const INTENT_PERCEPTUAL: number;
  export const INTENT_RELATIVE_COLORIMETRIC: number;
  export const INTENT_SATURATION: number;
  export const INTENT_ABSOLUTE_COLORIMETRIC: number;
  export const cmsFLAGS_NOCACHE: number;
  export const cmsFLAGS_GAMUTCHECK: number;
  export const cmsFLAGS_SOFTPROOFING: number;
  export const cmsFLAGS_BLACKPOINTCOMPENSATION: number;
}
