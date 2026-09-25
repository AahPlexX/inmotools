import type { LayoutProject } from "./layout-engine";
export type Block = LayoutProject["blocks"][number];
export type BlockStyle = {
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  borderWidth: number;
  radius: number;
  grow: number;
  shrink: number;
  basis: number;
};
export const DEFAULT_BLOCK_STYLE: BlockStyle = {
  paddingTop: 24,
  paddingRight: 24,
  paddingBottom: 24,
  paddingLeft: 24,
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
  borderWidth: 1,
  radius: 16,
  grow: 1,
  shrink: 1,
  basis: 220,
};
export function parseBlockStyle(input: unknown): BlockStyle {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid block style.");
  const record = input as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(DEFAULT_BLOCK_STYLE).map((key) => {
      const n = record[key];
      const max =
        key === "basis" ? 1200 : key === "grow" || key === "shrink" ? 20 : 120;
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > max)
        throw new Error(`${key} must be a number from 0 to ${max}.`);
      return [key, n];
    }),
  ) as BlockStyle;
}
export function validateTree(blocks: Block[]): void {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  for (const block of blocks) {
    const seen = new Set([block.id]);
    let current = block;
    while (current.parentId) {
      const parent = byId.get(current.parentId);
      if (!parent || !["card", "notice"].includes(parent.kind))
        throw new Error("A parent must be an existing card or notice.");
      if (seen.has(parent.id))
        throw new Error("A block cannot contain itself or an ancestor.");
      seen.add(parent.id);
      if (seen.size > 5) throw new Error("Use at most five nesting levels.");
      current = parent;
    }
  }
}
export function orderedBlocks(
  blocks: Block[],
  parentId = "",
  depth = 0,
): { block: Block; depth: number }[] {
  return blocks
    .filter((b) => (b.parentId || "") === parentId)
    .flatMap((block) => [
      { block, depth },
      ...orderedBlocks(blocks, block.id, depth + 1),
    ]);
}
export function reparentBlock(
  blocks: Block[],
  id: string,
  parentId: string,
): Block[] {
  const next = blocks.map((b) => (b.id === id ? { ...b, parentId } : b));
  validateTree(next);
  return next;
}
export function moveBlock(
  blocks: Block[],
  id: string,
  offset: number,
): Block[] {
  const current = blocks.find((b) => b.id === id);
  if (!current) return blocks;
  const siblings = blocks.filter(
    (b) => (b.parentId || "") === (current.parentId || ""),
  );
  const neighbor = siblings[siblings.findIndex((b) => b.id === id) + offset];
  if (!neighbor) return blocks;
  const next = [...blocks];
  const a = next.findIndex((b) => b.id === id),
    b = next.findIndex((b) => b.id === neighbor.id);
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
export function removeBlock(blocks: Block[], id: string): Block[] {
  const parentId = blocks.find((b) => b.id === id)?.parentId || "";
  return orderedBlocks(blocks)
    .map((entry) => entry.block)
    .filter((b) => b.id !== id)
    .map((b) => (b.parentId === id ? { ...b, parentId } : b));
}
export function duplicateBlock(blocks: Block[], id: string): Block[] {
  const source = blocks.find((b) => b.id === id);
  if (!source) return blocks;
  const subtree = [
    source,
    ...orderedBlocks(blocks, id).map((entry) => entry.block),
  ];
  if (blocks.length + subtree.length > 100)
    throw new Error("Duplicating this group would exceed 100 blocks.");
  const ids = new Map(
    subtree.map((b) => [b.id, `block-${crypto.randomUUID()}`]),
  );
  const copies = subtree.map((b) => ({
    ...b,
    id: ids.get(b.id)!,
    ...(b.parentId ? { parentId: ids.get(b.parentId) || b.parentId } : {}),
  }));
  const index = blocks.findIndex((b) => b.id === id);
  return [...blocks.slice(0, index + 1), ...copies, ...blocks.slice(index + 1)];
}
export function blockCss(block: Block): string {
  if (!block.style) return "";
  const s = block.style;
  return `#${block.id}{padding:${s.paddingTop}px min(${s.paddingRight}px,10%) ${s.paddingBottom}px min(${s.paddingLeft}px,10%);margin:${s.marginTop}px min(${s.marginRight}px,5%) ${s.marginBottom}px min(${s.marginLeft}px,5%);border-width:${s.borderWidth}px;border-radius:${s.radius}px;flex:${s.grow} ${s.shrink} ${s.basis}px}`;
}
