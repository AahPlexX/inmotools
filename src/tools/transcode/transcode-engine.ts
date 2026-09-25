// Conversion dispatcher for the Transcode Workstation.
// Converters register themselves per (source -> target) pair. The workspace
// derives its offered target list from this registry, so only implemented
// paths are ever presented to the user.

import type { AnyFormatId, FormatId } from './formats';

export interface ConversionArtifact {
  /** Suggested file name for the artifact. */
  name: string;
  mime: string;
  bytes: Uint8Array;
  /** Preview text for text-like artifacts (optional). */
  preview?: string;
}

export interface ConversionInput {
  sourceId: FormatId;
  fileName: string;
  bytes: Uint8Array;
  text: () => string;
}

export type ConversionOptions = Record<string, unknown>;

export type ConverterFn = (input: ConversionInput, options: ConversionOptions) => Promise<ConversionArtifact[]>;

interface ConverterEntry {
  target: AnyFormatId;
  /** Human description shown as a tooltip/help text. */
  description: string;
  convert: ConverterFn;
}

const registry = new Map<FormatId, Map<AnyFormatId, ConverterEntry>>();

export function registerConverter(source: FormatId, target: AnyFormatId, description: string, convert: ConverterFn): void {
  let targets = registry.get(source);
  if (!targets) {
    targets = new Map();
    registry.set(source, targets);
  }
  targets.set(target, { target, description, convert });
}

export function availableTargets(source: FormatId): ConverterEntry[] {
  const targets = registry.get(source);
  return targets ? [...targets.values()] : [];
}

export function getConverter(source: FormatId, target: AnyFormatId): ConverterEntry | undefined {
  return registry.get(source)?.get(target);
}

export async function runConversion(
  source: FormatId,
  target: AnyFormatId,
  input: ConversionInput,
  options: ConversionOptions,
): Promise<ConversionArtifact[]> {
  const entry = getConverter(source, target);
  if (!entry) throw new Error('This conversion is not implemented yet.');
  return entry.convert(input, options);
}

export function baseName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.tar.gz')) return fileName.slice(0, -7);
  if (lower.endsWith('.tar.bz2')) return fileName.slice(0, -8);
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

export function textArtifact(name: string, text: string, mime: string): ConversionArtifact {
  return { name, mime, bytes: new TextEncoder().encode(text), preview: text.length > 20000 ? `${text.slice(0, 20000)}…` : text };
}

export function bytesArtifact(name: string, bytes: Uint8Array, mime: string): ConversionArtifact {
  return { name, mime, bytes };
}

export function swapExtension(fileName: string, extension: string): string {
  return `${baseName(fileName)}.${extension}`;
}
