// Type shims for vendor packages that ship no (or undiscoverable) typings.
// Surface kept intentionally narrow: only the APIs the Transcode Workstation
// consumes are declared.

declare module 'upng-js' {
  interface UpngFrame {
    delay: number;
  }
  interface UpngImage {
    width: number;
    height: number;
    depth: number;
    frames?: UpngFrame[];
    data: ArrayBuffer;
  }
  const UPNG: {
    decode: (buffer: ArrayBuffer) => UpngImage;
    toRGBA8: (image: UpngImage) => ArrayBuffer[];
    encode: (images: ArrayBuffer[], width: number, height: number, cnum: number, delays?: number[]) => ArrayBuffer;
    encodeLL: (images: ArrayBuffer[], width: number, height: number, la: number, i: number, depth: number, dels?: number[]) => ArrayBuffer;
  };
  export default UPNG;
}

declare module 'utif2' {
  interface UtifIfd {
    width?: number;
    height?: number;
    data?: Uint8Array;
    [tag: string]: unknown;
  }
  const UTIF: {
    decode: (buffer: ArrayBuffer) => UtifIfd[];
    decodeImage: (buffer: ArrayBuffer, ifd: UtifIfd) => void;
    toRGBA8: (ifd: UtifIfd) => Uint8Array;
    encodeImage: (rgba: Uint8Array | ArrayBuffer, width: number, height: number, metadata?: Record<string, unknown>) => ArrayBuffer;
  };
  export default UTIF;
}

declare module 'imagetracerjs' {
  const ImageTracer: {
    imagedataToSVG: (imageData: ImageData, options?: Record<string, unknown>) => string;
    imagedataToTracedata: (imageData: ImageData, options?: Record<string, unknown>) => unknown;
    imageToSVG: (url: string, callback: (svg: string) => void, options?: Record<string, unknown>) => void;
  };
  export default ImageTracer;
}

declare module 'gifenc' {
  interface GifEncoderInstance {
    writeFrame: (index: Uint8Array, width: number, height: number, options?: Record<string, unknown>) => void;
    finish: () => void;
    bytes: () => Uint8Array;
    reset: () => void;
  }
  export function GIFEncoder(options?: Record<string, unknown>): GifEncoderInstance;
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: Record<string, unknown>): number[][];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
}

declare module 'libarchive.js' {
  interface LibarchiveEntry {
    path: string;
    file?: File;
  }
  interface LibarchiveHandle {
    extractFiles: (callback?: (entry: LibarchiveEntry) => void) => Promise<unknown>;
    getFilesObject: () => Record<string, LibarchiveEntry>;
    getFilesArray: () => LibarchiveEntry[];
  }
  export const Archive: {
    init: (options: { workerUrl: string }) => void;
    open: (file: File | Blob) => Promise<LibarchiveHandle>;
  };
}

declare module 'piexifjs' {
  type ExifValue = string | number | number[][] | number[];
  const piexif: {
    load: (jpegData: string) => Record<string, Record<string, ExifValue>>;
    dump: (exif: Record<string, Record<string, ExifValue>>) => string;
    insert: (exifBytes: string, jpegData: string) => string;
    remove: (jpegData: string) => string;
    TAGS: Record<string, Record<number, { name: string }>>;
    ImageIFD: Record<string, number>;
    ExifIFD: Record<string, number>;
    GPSIFD: Record<string, number>;
  };
  export default piexif;
}
