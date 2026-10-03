#!/usr/bin/env node
// pnpm tool:check <slug> [--strict] [--base <ref>] | --all
// Computes a tool's completion from its spec and tracker instead of trusting a typed
// summary. A requirement counts as verified only when its tracker row is `verified` and
// the evidence resolves: a test whose source contains the requirement ID, or every quoted
// test title in the evidence cell found in a test file ("…" or `<name>` marks an elision).
// Exit 1 on any error. Without --strict a tool with no standard spec/tracker yet is
// reported as pending and passes; --strict (used for new tools) requires both.
// --base <ref> also fails if a requirement verified on <ref> is no longer verified,
// so a checkpoint merge of an expansion cannot regress finished work.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { docsForTool, specRequirementIds, standardDocs, STATUSES, trackedFiles, trackerRows } from './tool-docs.mjs';
import { loadTools } from './tool-registry.mjs';

const testSources = () => trackedFiles('tests/**').filter((path) => /\.(ts|tsx|mjs|js)$/.test(path)).map((path) => readFileSync(path, 'utf8'));

// Typographic and straight apostrophes match each other; `<name>` stands for a
// template value in a parameterised test title and is treated like "…".
const normalize = (text) => text.replace(/[‘’]/g, "'");

function citationResolves(quote, sources) {
  const fragments = normalize(quote).split(/…|<[^>]+>/).map((part) => part.replace(/^[\s.]+|[\s.]+$/g, '')).filter((part) => part.length >= 6);
  return fragments.length > 0 && sources.some((source) => fragments.every((fragment) => normalize(source).includes(fragment)));
}

export function checkTool(slug, { strict = false, docs = standardDocs(), sources = testSources() } = {}) {
  const errors = [];
  const { specs, trackers } = docsForTool(slug, docs);
  if (!specs.length || !trackers.length) {
    const missing = [!specs.length && 'spec', !trackers.length && 'tracker'].filter(Boolean).join(' and ');
    return { slug, pending: true, missing, errors: strict ? [`no standard ${missing} (header "tool: ${slug}")`] : [], counts: {}, total: 0, complete: 0 };
  }
  const specIds = specs.flatMap((spec) => specRequirementIds(spec.text));
  const rows = trackers.flatMap((tracker) => trackerRows(tracker.text).map((row) => ({ ...row, file: tracker.path })));
  const rowById = new Map();
  for (const row of rows) {
    if (rowById.has(row.id)) errors.push(`${row.id}: listed twice in trackers`);
    rowById.set(row.id, row);
    if (!STATUSES.includes(row.status)) errors.push(`${row.id}: status "${row.status}" is not one of ${STATUSES.join(', ')}`);
    if (!specIds.includes(row.id)) errors.push(`${row.id}: in ${row.file} but not in the spec`);
  }
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const id of specIds) {
    const row = rowById.get(id);
    if (!row) { errors.push(`${id}: in the spec but has no tracker row`); continue; }
    if (!STATUSES.includes(row.status)) continue;
    if (row.status === 'verified') {
      const quotes = [...row.evidence.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
      const byId = sources.some((source) => new RegExp(`\\b${id}\\b`).test(source));
      const byTitle = quotes.length > 0 && quotes.every((quote) => citationResolves(quote, sources));
      const recorded = !quotes.length && row.evidence && row.evidence !== '—';
      if (!byId && !byTitle && !recorded) {
        errors.push(`${id}: verified, but ${quotes.length ? 'a cited test title was not found in tests/' : 'no evidence is cited'}`);
      }
    }
    counts[row.status] += 1;
  }
  const complete = counts.verified + counts['not planned'];
  const verified = specIds.filter((id) => rowById.get(id)?.status === 'verified');
  return { slug, pending: false, errors, counts, total: specIds.length, complete, verified };
}

/** IDs marked verified in the tool's trackers as they are on a git ref. */
export function verifiedOn(ref, slug) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const paths = git('ls-tree', '-r', '--name-only', ref, 'src/tools').split('\n').filter((path) => /TRACKER\.md$/.test(path));
  return paths.flatMap((path) => {
    const text = git('show', `${ref}:${path}`);
    return new RegExp(`^tool: ${slug}$`, 'm').test(text.slice(0, 400)) ? trackerRows(text).filter((row) => row.status === 'verified').map((row) => row.id) : [];
  });
}

function report(result) {
  if (result.pending) return `${result.slug}: pending (no standard ${result.missing})${result.errors.length ? `\n  error: ${result.errors.join('\n  error: ')}` : ''}`;
  const parts = Object.entries(result.counts).filter(([, n]) => n).map(([status, n]) => `${status} ${n}`).join(', ');
  const state = result.total && result.complete === result.total ? 'complete' : 'incomplete';
  return [`${result.slug}: ${state}, ${result.complete}/${result.total} requirements verified or not planned (${parts})`, ...result.errors.map((error) => `  error: ${error}`)].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : null;
  const slugs = (await loadTools()).map((tool) => tool.slug);
  const wanted = args.includes('--all') ? slugs : args.filter((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--base');
  if (!wanted.length) { console.error('usage: pnpm tool:check <slug> [--strict] [--base <ref>] | --all'); process.exit(2); }
  const docs = standardDocs();
  const sources = testSources();
  let failed = false;
  for (const slug of wanted) {
    if (!slugs.includes(slug)) { console.error(`${slug}: not in the catalog (no src/tools/*/${slug}.meta.ts)`); failed = true; continue; }
    const result = checkTool(slug, { strict, docs, sources });
    if (base) {
      const lost = verifiedOn(base, slug).filter((id) => !(result.verified ?? []).includes(id));
      for (const id of lost) result.errors.push(`${id}: verified on ${base} but not here (regression)`);
    }
    console.log(report(result));
    failed ||= result.errors.length > 0;
  }
  process.exit(failed ? 1 : 0);
}
