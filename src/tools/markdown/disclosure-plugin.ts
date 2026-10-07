import type { Parent, Root, RootContent, PhrasingContent, Html, Nodes } from 'mdast';
import type { Plugin } from 'unified';
type Position = NonNullable<RootContent['position']>;
type Point = Position['start'];

interface Disclosure extends Parent { type: 'workbenchDisclosure'; children: RootContent[] }
interface Summary extends Parent { type: 'workbenchSummary'; children: PhrasingContent[] }
declare module 'mdast' {
  interface Data { proseAuthored?: boolean }
  interface BlockContentMap { workbenchDisclosure: Disclosure; workbenchSummary: Summary }
  interface RootContentMap { workbenchDisclosure: Disclosure; workbenchSummary: Summary }
  interface CodeData { disclosureFallback?: boolean }
}

type Boundary = { kind: 'open' | 'close' | 'summary'; node: RootContent; position?: Position; open?: boolean; name?: string };
type Piece = RootContent | Boundary;
const isBoundary = (piece: Piece): piece is Boundary => 'kind' in piece;
const blockParents = new Set(['root', 'blockquote', 'listItem', 'defListDescription', 'workbenchDisclosure']);

/** Only owned wrapper syntax becomes elements; arbitrary source HTML stays disabled. */
const remarkDisclosures: Plugin<[], Root> = function () {
  const processor = this;
  return (tree, file) => {
    const source = String(file);
    const lineStarts = [0];
    for (const match of source.matchAll(/\r\n|\r|\n/g)) lineStarts.push(match.index + match[0].length);
    const point = (offset: number): Point => {
      let low = 0; let high = lineStarts.length;
      while (low + 1 < high) {
        const mid = (low + high) >>> 1;
        if (lineStarts[mid] <= offset) low = mid; else high = mid;
      }
      return { line: low + 1, column: offset - lineStarts[low] + 1, offset };
    };
    const fallback = (value: string, position?: Position): RootContent => ({
      type: 'code', value, position, data: { disclosureFallback: true },
    });
    const plain = (nodes: readonly Nodes[]): string => nodes.map(node => {
      if ('value' in node) return node.type === 'html' ? '' : String(node.value);
      if (node.type === 'image') return node.alt ?? '';
      return 'children' in node ? plain(node.children as Nodes[]) : '';
    }).join('');
    const inline = (value: string): { children: PhrasingContent[]; authored: boolean } => {
      const parsed = processor.parse(value) as Root;
      const first = parsed.children[0];
      const clean = (nodes: PhrasingContent[]): PhrasingContent[] => nodes.flatMap(node => {
        if (node.type === 'html') return [];
        if (node.type === 'image') return [{ type: 'text', value: node.alt ?? '' }];
        if (node.type === 'link' || node.type === 'linkReference') return clean(node.children);
        if ('children' in node) return [{ ...node, children: clean(node.children as PhrasingContent[]) } as PhrasingContent];
        return [node];
      });
      const children = first?.type === 'paragraph' && parsed.children.length === 1 ? clean(first.children) : [{ type: 'text' as const, value }];
      const authored = Boolean(plain(children as Nodes[]).trim());
      return { children: authored ? children : [{ type: 'text', value: 'Details' }], authored };
    };
    const attrs = (value: string): { open: boolean; name?: string } | null => {
      let rest = value; let open = false; let name: string | undefined;
      const seen = new Set<string>();
      while (rest.trim()) {
        const match = /^[ \t]+(open|name)(?:[ \t]*=[ \t]*(?:"([^"<>]*)"|'([^'<>]*)'|([^\s"'=<>`]+)))?(?=[ \t]|$)/i.exec(rest);
        if (!match || seen.has(match[1].toLowerCase())) return null;
        const key = match[1].toLowerCase(); seen.add(key);
        if (key === 'open') open = true;
        else {
          const raw = match[2] ?? match[3] ?? match[4];
          if (raw === undefined) return null;
          // Escaping Markdown punctuation leaves character references to the
          // parser's standard string decoder, without interpreting HTML.
          name = plain((processor.parse(raw.replace(/[\\`*_{}[\]()#+.!<>~^$:-]/g, '\\$&')) as Root).children as Nodes[]);
        }
        rest = rest.slice(match[0].length);
      }
      return { open, ...(name ? { name } : {}) };
    };
    const expandHtml = (node: Html, depth: number): Piece[] => {
      if (depth > 256) return [fallback(node.value, node.position)];
      const open = /^[ \t]{0,3}<details\b([^>]*)>/i.exec(node.value);
      const close = /^[ \t]{0,3}<\/details[ \t]*>/i.exec(node.value);
      const summary = /^[ \t]{0,3}<summary[ \t]*>([\s\S]*?)<\/summary[ \t]*>/i.exec(node.value);
      if (!open && !close && !summary) {
        return /^[ \t]{0,3}<\/?(?:details|summary)\b/i.test(node.value) ? [fallback(node.value, node.position)] : [node];
      }
      const properties = open ? attrs(open[1]) : null;
      if (open && !properties) return [fallback(node.value, node.position)];
      const from = node.position?.start.offset; const to = node.position?.end.offset;
      if (from === undefined || to === undefined) return [fallback(node.value, node.position)];
      const originalLines = [...source.slice(from, to).matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)].filter(match => match[0]);
      const valueLines = [...node.value.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)].filter(match => match[0]);
      if (originalLines.length !== valueLines.length) return [fallback(node.value, node.position)];
      if (valueLines.some((line, index) => !originalLines[index][1].endsWith(line[1]))) return [fallback(node.value, node.position)];
      const segments = valueLines.map((line, index) => {
        const raw = originalLines[index];
        return { start: line.index, end: line.index + line[0].length, offset: from + raw.index + raw[1].length - line[1].length, width: line[1].length };
      });
      const mapped = (offset: number) => {
        if (offset === node.value.length) return to;
        const segment = segments.find(segment => offset >= segment.start && offset < segment.end);
        if (!segment) return undefined;
        return segment.offset + Math.min(offset - segment.start, segment.width);
      };
      const matched = (open ?? close ?? summary)!;
      const length = matched[0].length;
      const endOffset = mapped(length);
      if (endOffset === undefined) return [fallback(node.value, node.position)];
      const position = { start: node.position!.start, end: point(endOffset) };
      const caption = summary ? inline(summary[1]) : { children: [], authored: false };
      // Inline caption positions belong to a separately parsed string. The
      // containing summary supplies the original source position instead.
      const removePositions = (child: Nodes) => {
        delete child.position;
        if ('children' in child) child.children.forEach(removePositions);
      };
      caption.children.forEach(removePositions);
      const boundary: Boundary = open ? { kind: 'open', node, position, ...properties! }
        : close ? { kind: 'close', node, position }
          : { kind: 'summary', node: { type: 'workbenchSummary', children: caption.children, data: { hName: 'summary', proseAuthored: caption.authored }, position }, position };
      const fragment = node.value.slice(length);
      if (!fragment.trim()) return [boundary];
      const parsed = processor.parse(fragment) as Root;
      let mappingFailed = false;
      const remap = (child: Nodes) => {
        if (child.position?.start.offset !== undefined && child.position.end.offset !== undefined) {
          const start = mapped(length + child.position.start.offset);
          const end = mapped(length + child.position.end.offset);
          if (start === undefined || end === undefined) mappingFailed = true;
          else child.position = { start: point(start), end: point(end) };
        }
        if ('children' in child) child.children.forEach(child => remap(child as Nodes));
      };
      parsed.children.forEach(remap);
      if (mappingFailed) return [fallback(node.value, node.position)];
      return [boundary, ...pieces(parsed.children, depth + 1)];
    };
    const pieces = (children: RootContent[], depth: number): Piece[] => children.flatMap(node => {
      if (node.type === 'html') return expandHtml(node, depth);
      if (node.type === 'paragraph') {
        const result: Piece[] = []; let group: PhrasingContent[] = [];
        const flush = () => {
          if (group.length) result.push({ ...node, children: group, position: group[0].position && group.at(-1)?.position ? { start: group[0].position!.start, end: group.at(-1)!.position!.end } : node.position });
          group = [];
        };
        for (const child of node.children) {
          if (child.type === 'html' && /^<\/details[ \t]*>$/i.test(child.value)) { flush(); result.push({ kind: 'close', node: child, position: child.position }); }
          else group.push(child);
        }
        flush(); return result;
      }
      return [node];
    });
    const process = (parent: Parent, depth: number) => {
      if (depth > 128) return;
      if (!blockParents.has(parent.type)) {
        for (const child of parent.children) if ('children' in child) process(child as Parent, depth + 1);
        return;
      }
      const output: RootContent[] = [];
      const stack: { node: Disclosure; header: Position | undefined; hasSummary: boolean }[] = [];
      const append = (node: RootContent) => (stack.at(-1)?.node.children ?? output).push(node);
      for (const piece of pieces(parent.children as RootContent[], 0)) {
        if (!isBoundary(piece)) {
          if ('children' in piece) process(piece, depth + 1);
          append(piece); continue;
        }
        if (piece.kind === 'open') {
          if (stack.length >= 64) {
            parent.children = [fallback(source.slice(parent.position?.start.offset, parent.position?.end.offset), parent.position)];
            return;
          }
          const node: Disclosure = { type: 'workbenchDisclosure', children: [], position: piece.position, data: { hName: 'details', hProperties: { className: ['markdown-disclosure'], open: piece.open, name: piece.name, dataDisclosureDefaultOpen: String(piece.open) } } };
          stack.push({ node, header: piece.position, hasSummary: false });
        } else if (piece.kind === 'summary' && stack.at(-1) && !stack.at(-1)!.hasSummary && !stack.at(-1)!.node.children.length) {
          stack.at(-1)!.node.children.push(piece.node); stack.at(-1)!.hasSummary = true;
        } else if (piece.kind === 'close' && stack.length) {
          const frame = stack.pop()!;
          if (!frame.hasSummary) frame.node.children.unshift({ type: 'workbenchSummary', children: [{ type: 'text', value: 'Details' }], data: { hName: 'summary' }, position: frame.header });
          if (frame.header && piece.position) frame.node.position = { start: frame.header.start, end: piece.position.end };
          append(frame.node);
        } else append(fallback(source.slice(piece.position?.start.offset, piece.position?.end.offset), piece.position));
      }
      while (stack.length) {
        const frame = stack.pop()!;
        const end = frame.node.children.at(-1)?.position?.end ?? frame.header?.end;
        const position = frame.header && end ? { start: frame.header.start, end } : frame.header;
        append(fallback(source.slice(position?.start.offset, position?.end.offset), position));
      }
      parent.children = output;
    };
    process(tree, 0);
    const openGroups = new Set<string>();
    const normalizeGroups = (node: Nodes, ancestorGroups: ReadonlySet<string>) => {
      let nestedGroups = ancestorGroups;
      if (node.type === 'workbenchDisclosure') {
        const properties = node.data?.hProperties;
        const name = properties?.name;
        if (properties && typeof name === 'string') {
          // Native HTML forbids nested members and multiple initially open
          // members of one exclusive group. Keep every body reachable.
          if (ancestorGroups.has(name)) delete properties.name;
          else {
            if (properties.open && openGroups.has(name)) properties.open = false;
            if (properties.open) openGroups.add(name);
            nestedGroups = new Set([...ancestorGroups, name]);
          }
        }
      }
      if ('children' in node) node.children.forEach(child => normalizeGroups(child, nestedGroups));
    };
    normalizeGroups(tree, new Set());
  };
};

export default remarkDisclosures;
