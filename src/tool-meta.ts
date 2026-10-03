import type { ComponentType } from 'react';

/** Home-page groups, in display order. Tools sort by this order, then by `shortTitle`. */
export const TOOL_CATEGORIES = [
  { id: 'documents', label: 'Documents & reading' },
  { id: 'data', label: 'Data & spreadsheets' },
  { id: 'developer', label: 'Developer & security' },
  { id: 'design', label: 'Design & web' },
  { id: 'media', label: 'Photo, video & 3D' },
  { id: 'audio', label: 'Audio & music' },
  { id: 'maps', label: 'Maps & environment' },
  { id: 'engineering', label: 'Engineering & science' },
  { id: 'everyday', label: 'Health, sport & hobbies' },
] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number]['id'];

/** A catalog slug: lowercase words joined by hyphens; also the meta file name. */
export type ToolSlug = string;

export interface ToolDefinition {
  slug: ToolSlug;
  shortTitle: string;
  title: string;
  audience: string;
  summary: string;
  privacy: string;
  accepts: string;
  outputs: string;
  steps: string[];
  hint: string;
  /** Opt-in: show a compact title, then the workspace, then the "How to use" guide, so an
   * interactive tool is usable in the first viewport instead of below the intro. */
  workspaceFirst?: boolean;
}

/**
 * One tool's catalog record. Each tool owns one `src/tools/<folder>/<slug>.meta.ts`
 * whose default export satisfies this type; `src/catalog.ts` collects them, so adding
 * a tool never edits a shared file.
 */
export interface ToolMeta extends ToolDefinition {
  category: ToolCategory;
  /** Legacy hash routes (e.g. `#/old-name`) that open this tool. */
  aliases?: string[];
  /** Lazy import of the tool's workspace component. */
  load: () => Promise<{ default: ComponentType }>;
}

const categoryRank = new Map<string, number>(TOOL_CATEGORIES.map(({ id }, index) => [id, index]));

/** Home-page order: category order, then short title. */
export function compareTools(a: Pick<ToolMeta, 'category' | 'shortTitle'>, b: Pick<ToolMeta, 'category' | 'shortTitle'>): number {
  const byCategory = (categoryRank.get(a.category) ?? TOOL_CATEGORIES.length) - (categoryRank.get(b.category) ?? TOOL_CATEGORIES.length);
  return byCategory || a.shortTitle.localeCompare(b.shortTitle, 'en', { sensitivity: 'base' });
}
