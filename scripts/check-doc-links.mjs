// Checks that every relative link in the standard documents points to an existing file.
// Standard documents: AGENTS.md, docs/TOOL_INDEX.md, docs/DOCUMENTATION_STANDARD.md,
// and any Markdown file that starts with the standard header block (`tool:` or `doc:`).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const fixed = new Set(['AGENTS.md', 'docs/TOOL_INDEX.md', 'docs/DOCUMENTATION_STANDARD.md']);
const tracked = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const standard = tracked.filter((file) => {
  if (fixed.has(file)) return true;
  const head = readFileSync(file, 'utf8').slice(0, 400);
  return /^---\n(?:[\s\S]*?\n)?(?:tool|doc): /.test(head);
});

const broken = [];
for (const file of standard) {
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    if (!existsSync(resolve(dirname(file), decodeURI(target)))) broken.push(`${file} -> ${match[1]}`);
  }
}

if (broken.length) {
  console.error(`Broken links in standard documents:\n${broken.join('\n')}`);
  process.exit(1);
}
console.log(`Checked ${standard.length} standard documents; all relative links resolve.`);
