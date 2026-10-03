import { compareTools, type ToolMeta, type ToolSlug } from './tool-meta';

export { compareTools, TOOL_CATEGORIES } from './tool-meta';
export type { ToolCategory, ToolDefinition, ToolMeta, ToolSlug } from './tool-meta';

// Every tool registers itself with a `src/tools/<folder>/<slug>.meta.ts` file.
const modules = import.meta.glob<{ default: ToolMeta }>('./tools/*/*.meta.ts', { eager: true });

export const TOOLS: ToolMeta[] = Object.values(modules).map((module) => module.default).sort(compareTools);
export const TOOL_BY_SLUG = new Map<ToolSlug, ToolMeta>(TOOLS.map((tool) => [tool.slug, tool]));
/** Legacy hash routes, e.g. `#/regex-matrix` → the RegexMatrix tool. */
export const TOOL_BY_ALIAS = new Map<string, ToolMeta>(TOOLS.flatMap((tool) => (tool.aliases ?? []).map((alias) => [alias, tool] as const)));
