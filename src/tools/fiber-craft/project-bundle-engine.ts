import { isRestorableCrochetDocument } from './persistence-engine';
import type { FiberCraftDocument } from './fiber-craft-types';

export const FIBER_CRAFT_PROJECT_KIND = 'inmotools-fiber-craft-project';
export const FIBER_CRAFT_PROJECT_BUNDLE_VERSION = 1;

export interface FiberCraftProjectBundle {
  readonly kind: typeof FIBER_CRAFT_PROJECT_KIND;
  readonly bundleVersion: typeof FIBER_CRAFT_PROJECT_BUNDLE_VERSION;
  readonly document: FiberCraftDocument;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function serializeFiberCraftProject(document: FiberCraftDocument): string {
  const bundle: FiberCraftProjectBundle = {
    kind: FIBER_CRAFT_PROJECT_KIND,
    bundleVersion: FIBER_CRAFT_PROJECT_BUNDLE_VERSION,
    document,
  };
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function parseFiberCraftProject(text: string): FiberCraftDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This project file is not valid JSON.');
  }
  if (!isRecord(parsed) || parsed.kind !== FIBER_CRAFT_PROJECT_KIND) {
    throw new Error('This file is not an InmoTools Fiber Craft project.');
  }
  if (parsed.bundleVersion !== FIBER_CRAFT_PROJECT_BUNDLE_VERSION) {
    throw new Error('This Fiber Craft project version is not supported yet.');
  }
  if (!isRestorableCrochetDocument(parsed.document)) {
    throw new Error('This Fiber Craft project contains invalid or unsupported crochet data.');
  }
  return parsed.document;
}

export function fiberCraftProjectFilename(title: string): string {
  const stem = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${stem || 'fiber-craft-project'}.craftproj`;
}
