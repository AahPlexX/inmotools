declare module 'topojson-server' { export function topology(objects: Record<string, unknown>, quantization?: number): any; }
declare module 'topojson-client' { export function feature(topology: any, object: any): unknown; }
declare module 'topojson-simplify' { export function presimplify(topology: any): any; export function quantile(topology: any, p: number): number; export function simplify(topology: any, minWeight: number): any; }
