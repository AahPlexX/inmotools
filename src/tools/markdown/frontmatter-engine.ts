import YAML from 'yaml';
import { parse as parseToml } from 'smol-toml';
import type { FrontmatterFormat, FrontmatterResult } from './markdown-types';

// Recognizes a frontmatter block at the very start of a document: a fenced
// block using --- (yaml), +++ (toml), or {  } (json) delimiters on their own
// lines. Returns the parsed data plus the 1-indexed line the document body
// starts on, so callers can offset source-line math for the rest of the
// document consistently.

const YAML_FENCE = '---';
const TOML_FENCE = '+++';

const emptyResult = (raw = ''): FrontmatterResult => ({
  format: null,
  data: {},
  raw,
  bodyStartLine: 1,
});

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseFenced = (
  lines: string[],
  fence: string,
  format: FrontmatterFormat,
): FrontmatterResult | null => {
  if (lines[0]?.trim() !== fence) return null;
  const closingIndex = lines.slice(1).findIndex((line) => line.trim() === fence);
  if (closingIndex === -1) return null;

  const contentLines = lines.slice(1, closingIndex + 1);
  const raw = contentLines.join('\n');
  let data: unknown;
  try {
    data = format === 'yaml' ? YAML.parse(raw) : parseToml(raw);
  } catch {
    // A malformed frontmatter block should not stop the rest of the document
    // from rendering; treat it as absent rather than throwing.
    return null;
  }

  return {
    format,
    data: isPlainRecord(data) ? data : {},
    raw,
    // closingIndex is 0-indexed within contentLines' following lines; the
    // body starts after the closing fence line.
    bodyStartLine: closingIndex + 3,
  };
};

const parseJsonBlock = (lines: string[]): FrontmatterResult | null => {
  if (lines[0]?.trim() !== '{') return null;
  let depth = 0;
  let endIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    for (const char of lines[index]) {
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
    }
    if (depth === 0) {
      endIndex = index;
      break;
    }
  }
  if (endIndex === -1) return null;

  const raw = lines.slice(0, endIndex + 1).join('\n');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  return {
    format: 'json',
    data: isPlainRecord(data) ? data : {},
    raw,
    bodyStartLine: endIndex + 2,
  };
};

export const parseFrontmatter = (source: string): FrontmatterResult => {
  if (!source) return emptyResult();
  const lines = source.split('\n');

  const yamlResult = parseFenced(lines, YAML_FENCE, 'yaml');
  if (yamlResult) return yamlResult;

  const tomlResult = parseFenced(lines, TOML_FENCE, 'toml');
  if (tomlResult) return tomlResult;

  const jsonResult = parseJsonBlock(lines);
  if (jsonResult) return jsonResult;

  return emptyResult();
};

export const stripFrontmatter = (source: string): string => {
  const result = parseFrontmatter(source);
  if (result.format === null) return source;
  const lines = source.split('\n');
  return lines.slice(result.bodyStartLine - 1).join('\n');
};
