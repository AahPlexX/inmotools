import type { Nodes, Root } from 'mdast';
import { isEscaped, mapCitationProse } from './citation-source';
import { stripFrontmatter } from './frontmatter-engine';
import { parseMarkdown } from './parse-engine';

const simpleKey = /[\p{L}\p{N}_]+(?:[:.#$%&+?<>~\/-](?=[\p{L}\p{N}_])[\p{L}\p{N}_]+|[:/](?=\/))*/uy;
const exampleMarker = /(?:^|[\r\n])[ \t]{0,3}\(?([0-9]*)@([_-]?[\p{L}\p{N}]+(?:[_-][\p{L}\p{N}]+)*)?[.)][ \t]+/gu;
const proseBlocks = new Set(['paragraph', 'heading', 'tableCell', 'workbenchSummary']);
const keyContinuation = /^(?:[\p{L}\p{N}_]|[:.#$%&+?<>~\/-](?=[\p{L}\p{N}_])|[:/](?=\/))/u;
const literalStart = new Set(['`', '$', '<', '~', '^', '[', '!', '\\']);

function previousCharacter(source: string, offset: number): string {
  const last = source.charCodeAt(offset - 1);
  return source.slice(last >= 0xdc00 && last <= 0xdfff ? Math.max(0, offset - 2) : Math.max(0, offset - 1), offset);
}

function exampleNumber(digits: string, fallback: bigint): bigint {
  if (digits === '') return fallback;
  let number = 0n;
  for (let i = 0; i < digits.length; i += 15) {
    const chunk = digits.slice(i, i + 15);
    number = BigInt.asIntN(64, number * 10n ** BigInt(chunk.length) + BigInt(chunk));
  }
  return number;
}

/** Export-only keys; the preview's bracketed citation contract is independent. */
export function extractPandocCitationKeys(source: string): { keys: string[]; unsupported: boolean } {
  if (!source.includes('@')) return { keys: [], unsupported: false };
  const parsed = parseMarkdown(source);
  const bodyOffset = parsed.frontmatter.format === null ? 0 : source.length - stripFrontmatter(source).length;
  const examples = new Map<string, bigint>();
  const exampleBlocks: { start: number; end: number; listItem: boolean }[] = [];
  const blocks: { start: number; end: number }[] = [];
  const stack: { node: Nodes; listItem: boolean }[] = [{ node: parsed.tree as Root, listItem: false }];
  while (stack.length) {
    const { node, listItem } = stack.pop()!;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) {
      if (proseBlocks.has(node.type)) blocks.push({ start: bodyOffset + start, end: bodyOffset + end });
      if (node.type === 'paragraph') exampleBlocks.push({ start: bodyOffset + start, end: bodyOffset + end, listItem });
    }
    if ('children' in node) for (const child of node.children) stack.push({ node: child as Nodes, listItem: listItem || node.type === 'listItem' });
  }
  let nextExample = 1n;
  exampleBlocks.sort((a, b) => a.start - b.start);
  for (const block of exampleBlocks) {
    for (const match of source.slice(block.start, block.end).matchAll(exampleMarker)) {
      const label = match[2] ?? '';
      const assigned = exampleNumber(match[1], nextExample);
      const number = examples.get(label) ?? assigned;
      if (block.listItem && number !== 1n) continue;
      nextExample = examples.has(label) ? assigned : BigInt.asIntN(64, number + 1n);
      if (label !== '') examples.set(label, number);
    }
  }
  blocks.sort((a, b) => a.start - b.start || a.end - b.end);
  const keys = new Set<string>();
  let unsupported = false;
  let blockIndex = -1; let owner = -1;
  let brackets: boolean[] = [];
  mapCitationProse(source, (segment, range) => {
    while (blockIndex + 1 < blocks.length && blocks[blockIndex + 1].start <= range.start) blockIndex++;
    const block = blocks[blockIndex];
    const nextOwner = block && block.end >= range.end ? block.start : range.start;
    if (owner !== nextOwner) { brackets = []; owner = nextOwner; }
    // Precompute balanced braces and whitespace counts so malformed nested
    // keys cannot repeatedly scan the same remaining source.
    const closes = new Map<number, number>(); const opens: number[] = [];
    const whitespace = new Uint32Array(segment.length + 1);
    for (let i = 0; i < segment.length; i++) {
      whitespace[i + 1] = whitespace[i] + Number(/\s/u.test(segment[i]));
      if (segment[i] === '{') opens.push(i);
      else if (segment[i] === '}' && opens.length) closes.set(opens.pop()!, i);
    }
    for (let i = 0; i < segment.length; i++) {
      if (segment[i] !== '[' && segment[i] !== ']' && segment[i] !== ';' && segment[i] !== '@') continue;
      if (isEscaped(segment, i)) continue;
      if (segment[i] === '[') { brackets.push(false); continue; }
      if (segment[i] === ']') { brackets.pop(); continue; }
      if (segment[i] === ';' && brackets.length) { brackets[brackets.length - 1] = false; continue; }
      if (segment[i] !== '@') continue;
      const absolute = range.start + i;
      const preceding = previousCharacter(source, absolute);
      if (/[\p{L}\p{N}]/u.test(preceding) || (preceding === '.' && !isEscaped(source, absolute - 1)) || range.emphasisEnds.has(absolute)) continue;
      let key: string | undefined; let end = i + 1;
      if (segment[end] === '{') {
        const close = closes.get(end);
        if (close !== undefined && close > end + 1 && whitespace[close] === whitespace[end + 1]) {
          key = segment.slice(end + 1, close); end = close + 1;
        } else if (close === undefined && whitespace[segment.length] === whitespace[end + 1] && literalStart.has(source[range.end])) {
          unsupported = true;
        }
      } else {
        simpleKey.lastIndex = end;
        const match = simpleKey.exec(segment);
        if (match) { key = match[0]; end = simpleKey.lastIndex; }
      }
      if (key === undefined) continue;
      if (end === segment.length && keyContinuation.test(source.slice(range.start + end, range.start + end + 3))) {
        unsupported = true;
        continue;
      }
      const normal = brackets.length > 0 && !brackets[brackets.length - 1];
      if (brackets.length) brackets[brackets.length - 1] = true;
      if (normal || !examples.has(key)) keys.add(key);
      i = end - 1;
    }
    return segment;
  }, parsed);
  return { keys: [...keys], unsupported };
}
