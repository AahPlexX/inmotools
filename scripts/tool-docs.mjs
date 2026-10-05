// Finds and parses one tool's standard documents (spec and tracker) by their
// header block (`tool: <slug>`, `doc: spec|tracker`). Shared by tool-check and docs-sync.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const STATUSES = ['verified', 'implemented', 'partial', 'missing', 'prohibited'];
/** Notes-column flag for criteria only a person with real hardware can check. */
export const HUMAN_FLAG = '[awaiting physical testing by human]';
const REQ_ROW = /^\| ([A-Z][A-Z0-9]*-R\d+) \|/;

export function trackedFiles(pattern, root = process.cwd()) {
  return execFileSync('git', ['ls-files', pattern], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
}

/** `{ field: value }` from a leading `---` header block, or null. */
export function readHeader(text) {
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) return null;
  return Object.fromEntries(match[1].split('\n').map((line) => /^([a-z]+): *(.*?)(?: +#.*)?$/.exec(line)).filter(Boolean).map(([, k, v]) => [k, v]));
}

/** Every standard document, as `{ path, header, text }`. */
export function standardDocs(root = process.cwd()) {
  return trackedFiles('*.md', root).flatMap((path) => {
    const text = readFileSync(`${root}/${path}`, 'utf8');
    const header = readHeader(text);
    return header?.tool && header.doc ? [{ path, header, text }] : [];
  });
}

export function docsForTool(slug, docs = standardDocs()) {
  const mine = docs.filter((doc) => doc.header.tool === slug);
  return { specs: mine.filter((doc) => doc.header.doc === 'spec'), trackers: mine.filter((doc) => doc.header.doc === 'tracker') };
}

/** Requirement IDs in spec tables, in order of first appearance. */
export function specRequirementIds(text) {
  return [...new Set(text.split('\n').map((line) => REQ_ROW.exec(line)?.[1]).filter(Boolean))];
}

/** Tracker rows `| ID | Status | Evidence | Notes |` → `{ id, status, evidence }`. */
export function trackerRows(text) {
  return text.split('\n').flatMap((line) => {
    if (!REQ_ROW.test(line)) return [];
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    return [{ id: cells[0], status: cells[1], evidence: cells[2] ?? '', notes: cells[3] ?? '' }];
  });
}
