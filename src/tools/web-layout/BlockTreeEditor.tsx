import { useRef, useState } from "react";
import { NumberInput } from "./NumberInput";
import type { LayoutProject } from "./layout-engine";
import {
  DEFAULT_BLOCK_STYLE,
  duplicateBlock,
  moveBlock,
  orderedBlocks,
  reparentBlock,
  removeBlock,
  type Block,
  type BlockStyle,
} from "./block-tree";

function StyleEditor({
  block,
  onChange,
}: {
  block: Block;
  onChange: (style: BlockStyle | undefined) => void;
}) {
  const style = block.style ?? DEFAULT_BLOCK_STYLE;
  const [draft, setDraft] = useState(style);
  return (
    <details>
      <summary>Spacing, border and Flexbox sizing</summary>
      <p>
        Horizontal spacing contracts in narrow containers. Rem readouts assume a
        16px root; the browser’s root size can differ.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onChange(draft);
        }}
      >
        <div className="wl-fields">
          {Object.entries(draft).map(([key, value]) => (
            <div key={key}>
              <NumberInput
                label={`${block.id} ${key}`}
                value={value}
                min={0}
                max={
                  key === "basis"
                    ? 1200
                    : key === "grow" || key === "shrink"
                      ? 20
                      : 120
                }
                onChange={(value) => setDraft({ ...draft, [key]: value })}
              />
              {!["grow", "shrink"].includes(key) && (
                <small>{(value / 16).toFixed(3)} rem at 16px</small>
              )}
            </div>
          ))}
        </div>
        <div className="button-row">
          <button type="submit">Apply block style</button>
          <button
            type="button"
            onClick={() => {
              setDraft(DEFAULT_BLOCK_STYLE);
              onChange(undefined);
            }}
          >
            Use shared style
          </button>
        </div>
      </form>
    </details>
  );
}
export function BlockTreeEditor({
  blocks,
  onChange,
}: {
  blocks: LayoutProject["blocks"];
  onChange: (blocks: Block[], group?: string) => void;
}) {
  const [error, setError] = useState("");
  const dragging = useRef("");
  const host = useRef<HTMLOListElement>(null);
  function update(action: () => Block[], group = "") {
    try {
      onChange(action(), group);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to change blocks.");
    }
  }
  function edit(id: string, patch: Partial<Block>) {
    const keys = Object.keys(patch);
    const group =
      keys.length === 1 && ["title", "text"].includes(keys[0])
        ? `block:${id}:${keys[0]}`
        : "";
    update(
      () => blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      group,
    );
  }

  return (
    <>
      <ol ref={host} className="wl-blocks">
        {orderedBlocks(blocks).map(({ block, depth }, index) => {
          const siblings = blocks.filter(
            (b) => (b.parentId || "") === (block.parentId || ""),
          );
          const siblingIndex = siblings.findIndex((b) => b.id === block.id);
          return (
            <li
              key={block.id}
              data-block-id={block.id}
              style={{ marginInlineStart: `${depth * 8}px` }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const source = blocks.find((b) => b.id === dragging.current);
                dragging.current = "";
                if (!source || source.id === block.id) return;
                update(() => {
                  const moved = reparentBlock(
                    blocks,
                    source.id,
                    block.parentId || "",
                  );
                  const without = moved.filter((b) => b.id !== source.id);
                  const target = without.findIndex((b) => b.id === block.id);
                  without.splice(
                    target,
                    0,
                    moved.find((b) => b.id === source.id)!,
                  );
                  return without;
                });
              }}
            >
              <details>
                <summary
                  draggable
                  onDragStart={() => {
                    dragging.current = block.id;
                  }}
                  onDragEnd={() => {
                    dragging.current = "";
                  }}
                >
                  {index + 1}. {block.title || "Untitled block"} · {block.kind}
                  {depth > 0 ? ` · nested level ${depth + 1}` : ""}
                </summary>
                <label className="wl-field">
                  Block title
                  <input
                    value={block.title}
                    maxLength={200}
                    onChange={(e) => edit(block.id, { title: e.target.value })}
                  />
                </label>
                <label className="wl-field">
                  Block text
                  <textarea
                    value={block.text}
                    maxLength={2000}
                    onChange={(e) => edit(block.id, { text: e.target.value })}
                  />
                </label>
                <label className="wl-field">
                  Parent block
                  <select
                    aria-label={`Parent of ${block.title || block.id}`}
                    value={block.parentId || ""}
                    onChange={(e) =>
                      update(() =>
                        reparentBlock(blocks, block.id, e.target.value),
                      )
                    }
                  >
                    <option value="">Page root</option>
                    {blocks
                      .filter(
                        (b) =>
                          b.id !== block.id &&
                          ["card", "notice"].includes(b.kind),
                      )
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title || b.id}
                        </option>
                      ))}
                  </select>
                </label>
                {["card", "notice"].includes(block.kind) && (
                  <label className="wl-field">
                    Semantic tag
                    <select
                      aria-label={`Tag for ${block.title || block.id}`}
                      value={
                        block.tag ||
                        (block.kind === "card" ? "article" : "aside")
                      }
                      onChange={(e) =>
                        edit(block.id, { tag: e.target.value as Block["tag"] })
                      }
                    >
                      {["article", "section", "aside", "div"].map((tag) => (
                        <option key={tag}>{tag}</option>
                      ))}
                    </select>
                  </label>
                )}
                <StyleEditor
                  key={JSON.stringify(block.style)}
                  block={block}
                  onChange={(style) => edit(block.id, { style })}
                />
                <div className="button-row">
                  <button
                    type="button"
                    disabled={siblingIndex === 0}
                    onClick={() =>
                      update(() => moveBlock(blocks, block.id, -1))
                    }
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={siblingIndex === siblings.length - 1}
                    onClick={() => update(() => moveBlock(blocks, block.id, 1))}
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    disabled={blocks.length >= 100}
                    onClick={() =>
                      update(() => duplicateBlock(blocks, block.id))
                    }
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      update(() => removeBlock(blocks, block.id));
                      requestAnimationFrame(() =>
                        host.current
                          ?.querySelector<HTMLElement>("summary")
                          ?.focus(),
                      );
                    }}
                  >
                    Remove
                  </button>
                </div>
                <p className="help-text">
                  Move buttons reorder siblings. Drag a summary onto a block to
                  place it before that block. Parent selection supports nesting
                  without dragging. Removing a parent keeps its children.
                </p>
              </details>
            </li>
          );
        })}
      </ol>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
