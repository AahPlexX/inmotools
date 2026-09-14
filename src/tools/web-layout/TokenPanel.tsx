import { useEffect, useMemo, useRef, useState } from "react";
import { downloadText } from "../../lib/download";
import { buildTokens, type LayoutProject } from "./layout-engine";
import {
  inspectTokens,
  removeToken,
  setToken,
  tokenCss,
  tokenMappings,
  TOKEN_TYPES,
  type TokenDocument,
  type TokenType,
} from "./token-engine";

function simpleValue(type: TokenType, input: string): unknown {
  if (
    [
      "strokeStyle",
      "border",
      "transition",
      "shadow",
      "gradient",
      "typography",
    ].includes(type)
  )
    return JSON.parse(input);
  if (!input.trim()) throw new Error("Enter a value.");
  if (type === "number") return Number(input);
  if (type === "fontWeight")
    return Number.isFinite(Number(input)) ? Number(input) : input;
  if (type === "fontFamily") return input.split(",").map((s) => s.trim());
  if (type === "cubicBezier")
    return input.split(",").map((s) => Number(s.trim()));
  if (type === "color") {
    if (!/^#[0-9a-f]{6}$/i.test(input))
      throw new Error(
        "Use a six-digit hex color, or select JSON for other color spaces.",
      );
    return {
      colorSpace: "srgb",
      components: [1, 3, 5].map(
        (i) => parseInt(input.slice(i, i + 2), 16) / 255,
      ),
      hex: input,
    };
  }
  const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(px|rem|ms|s)$/.exec(
    input.trim(),
  );
  if (!match)
    throw new Error(
      type === "dimension"
        ? "Use a size such as 16px or 1.5rem."
        : "Use a time such as 200ms or 0.3s.",
    );
  return { value: Number(match[1]), unit: match[2] };
}
const black = { colorSpace: "srgb", components: [0, 0, 0] };
const px = (value: number) => ({ value, unit: "px" });
const composites: Partial<Record<TokenType, unknown>> = {
  strokeStyle: "solid",
  border: { color: black, width: px(1), style: "solid" },
  transition: {
    duration: { value: 200, unit: "ms" },
    delay: { value: 0, unit: "ms" },
    timingFunction: [0.25, 0.1, 0.25, 1],
  },
  shadow: {
    color: { ...black, alpha: 0.2 },
    offsetX: px(0),
    offsetY: px(8),
    blur: px(24),
    spread: px(0),
  },
  gradient: [
    { color: black, position: 0 },
    { color: { colorSpace: "srgb", components: [1, 1, 1] }, position: 1 },
  ],
  typography: {
    fontFamily: ["system-ui", "sans-serif"],
    fontSize: px(16),
    fontWeight: 400,
    letterSpacing: px(0),
    lineHeight: 1.6,
  },
};
const examples: Record<TokenType, string> = {
  color: "#2563eb",
  dimension: "16px",
  fontFamily: "system-ui, sans-serif",
  fontWeight: "400",
  duration: "200ms",
  cubicBezier: "0.25, 0.1, 0.25, 1",
  number: "1.6",
  ...Object.fromEntries(
    Object.entries(composites).map(([key, value]) => [
      key,
      JSON.stringify(value, null, 2),
    ]),
  ),
} as Record<TokenType, string>;

export function TokenPanel({
  project,
  onChange,
}: {
  project: LayoutProject;
  onChange: (tokens: TokenDocument) => boolean;
}) {
  const committed = JSON.stringify(project.tokens ?? null);
  const [draft, setDraft] = useState<TokenDocument>(() =>
    JSON.parse(buildTokens(project)),
  );
  const [source, setSource] = useState("");
  const [path, setPath] = useState("spacing.custom");
  const [type, setType] = useState<TokenType>("dimension");
  const [value, setValue] = useState("16px");
  const [mode, setMode] = useState<"simple" | "alias" | "json">("simple");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(30);
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    if (project.tokens) setDraft(project.tokens);
    else setDraft(JSON.parse(buildTokens(project)));
  }, [committed]);
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );
  const entries = useMemo(() => inspectTokens(draft).entries, [draft]);
  function change(doc: TokenDocument) {
    revision.current++;
    setDraft(doc);
  }
  function action(fn: () => void) {
    try {
      fn();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Unable to update tokens.");
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    const current = ++revision.current;
    try {
      if (file.size > 250000)
        throw new Error("Choose a token JSON file no larger than 250 KB.");
      const text = await file.text();
      if (current !== revision.current) return;
      const parsed = inspectTokens(JSON.parse(text));
      change(parsed.document);
      setSource(text);
      setStatus(
        "Token file loaded into draft. Apply the library to update your project.",
      );
    } catch (e) {
      if (current === revision.current)
        setStatus(e instanceof Error ? e.message : "Unable to read file.");
    }
  }
  return (
    <details className="wl-advanced wl-token-panel">
      <summary>Design-token library</summary>
      <p>
        Keep named design values in groups, reuse them through aliases, and
        export them for your own components. Applied tokens become CSS variables
        in previews and downloads. Use the listed variable in your code or theme
        expressions to connect it to a style.
      </p>
      <p>
        Supports all thirteen DTCG value types, group types and local JSON
        Pointer references. Group extensions are not supported yet; imports
        using them are rejected without replacing your draft. Custom stroke
        patterns export as dashed CSS borders, gradient tokens use a 90-degree
        linear presentation, and typography exports its letter spacing
        separately.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action(() => {
            const next =
              mode === "alias"
                ? `{${value.trim()}}`
                : mode === "json"
                  ? JSON.parse(value)
                  : simpleValue(type, value);
            change(setToken(draft, path, type, next, description));
            setStatus(
              "Token saved in library draft. Apply the library when ready.",
            );
          });
        }}
      >
        <label className="wl-field">
          Token path
          <input
            aria-label="Token path"
            value={path}
            maxLength={500}
            onChange={(e) => setPath(e.target.value)}
            required
            placeholder="spacing.card.gap"
          />
        </label>
        <p className="help-text">
          Separate groups with dots. Saving an existing path replaces that
          token. Existing aliases must still resolve.
        </p>
        <label className="wl-field">
          Token type
          <select
            aria-label="Token type"
            value={type}
            onChange={(e) => {
              const t = e.target.value as TokenType;
              setType(t);
              setValue(examples[t]);
              setMode(t in composites ? "json" : "simple");
            }}
          >
            {TOKEN_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="wl-field">
          Value mode
          <select
            aria-label="Token value mode"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as typeof mode);
              setValue("");
            }}
          >
            <option value="simple">Simple value</option>
            <option value="alias">Reuse another token</option>
            <option value="json">Structured JSON value</option>
          </select>
        </label>
        <label className="wl-field">
          Token value
          {mode === "json" ? (
            <textarea
              aria-label="Token value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={10000}
            />
          ) : (
            <input
              aria-label="Token value"
              value={value}
              maxLength={1000}
              onChange={(e) => setValue(e.target.value)}
              placeholder={mode === "alias" ? "spacing.base" : examples[type]}
              required
            />
          )}
        </label>
        <p className="help-text">
          {mode === "alias"
            ? "Enter the target path without braces. It must have the same type."
            : mode === "json"
              ? "Enter the DTCG $value, not the whole token. References remain editable in your JSON exports."
              : `Example: ${examples[type]}`}
        </p>
        <label className="wl-field">
          Token description
          <textarea
            aria-label="Token description"
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <button type="submit">Save token to draft</button>
      </form>
      <label className="wl-field">
        Find tokens
        <input
          aria-label="Find tokens"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(30);
          }}
        />
      </label>
      <ul className="wl-token-list">
        {entries
          .filter((e) => e.path.toLowerCase().includes(search.toLowerCase()))
          .slice(0, limit)
          .map((entry) => (
            <li key={entry.path}>
              <strong>{entry.path}</strong>
              <span>{entry.type}</span>
              <code>{`var(${entry.variable})`}</code>
              <code>{entry.css}</code>
              {entry.description && <p>{entry.description}</p>}
              <div className="button-row">
                <button
                  type="button"
                  onClick={() => {
                    let n: unknown = draft;
                    for (const part of entry.path.split("."))
                      n = (n as Record<string, unknown>)[part];
                    setPath(entry.path);
                    setType(entry.type);
                    setDescription(entry.description);
                    setMode("json");
                    setValue(
                      JSON.stringify(
                        (n as Record<string, unknown>).$value,
                        null,
                        2,
                      ),
                    );
                    setStatus(`Editing ${entry.path}.`);
                  }}
                >
                  Edit {entry.path}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    action(() => {
                      change(removeToken(draft, entry.path));
                      setStatus(`Removed ${entry.path} from draft.`);
                    })
                  }
                >
                  Remove {entry.path}
                </button>
              </div>
            </li>
          ))}
      </ul>
      {entries.filter((e) =>
        e.path.toLowerCase().includes(search.toLowerCase()),
      ).length > limit && (
        <button type="button" onClick={() => setLimit(limit + 30)}>
          Show more tokens
        </button>
      )}
      <div className="button-row">
        <button
          type="button"
          onClick={() => {
            if (onChange(draft))
              setStatus(
                "Token library applied. Undo restores the previous library.",
              );
            else
              setStatus(
                "Token library was not applied. Check the project status above.",
              );
          }}
        >
          Apply token library
        </button>
        <button
          type="button"
          onClick={() => {
            change(JSON.parse(buildTokens(project)));
            setStatus("Restored the applied token library.");
          }}
        >
          Discard token draft
        </button>
      </div>
      <details>
        <summary>Import, source and exports</summary>
        <label className="wl-field">
          Import token JSON
          <input
            aria-label="Import token JSON"
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              void importFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <label className="wl-field">
          Token document JSON
          <textarea
            aria-label="Token document JSON"
            value={source}
            maxLength={250000}
            onChange={(e) => {
              revision.current++;
              setSource(e.target.value);
            }}
          />
        </label>
        <div className="button-row">
          <button
            type="button"
            onClick={() => setSource(JSON.stringify(draft, null, 2))}
          >
            Show draft JSON
          </button>
          <button
            type="button"
            onClick={() =>
              action(() => {
                change(inspectTokens(JSON.parse(source)).document);
                setStatus(
                  "JSON loaded into draft. Apply the library when ready.",
                );
              })
            }
          >
            Load JSON into draft
          </button>
        </div>
        <p>
          These exports use the library draft. JSON preserves references; CSS
          and mapping exports contain resolved values. The variable mapping is
          framework-neutral.
        </p>
        <div className="button-row">
          <button
            type="button"
            onClick={() =>
              downloadText(
                JSON.stringify(draft, null, 2),
                "web-layout.tokens.json",
                "application/json",
              )
            }
          >
            Export token JSON
          </button>
          <button
            type="button"
            onClick={() =>
              downloadText(tokenCss(draft), "web-layout.tokens.css", "text/css")
            }
          >
            Export token CSS
          </button>
          <button
            type="button"
            onClick={() =>
              downloadText(
                tokenMappings(draft),
                "web-layout.token-map.json",
                "application/json",
              )
            }
          >
            Export variable mapping
          </button>
        </div>
      </details>
      <p role="status" aria-label="Token library status">
        {status}
      </p>
    </details>
  );
}
