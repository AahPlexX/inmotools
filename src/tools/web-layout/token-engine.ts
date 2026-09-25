export type TokenDocument = Record<string, unknown>;
export const TOKEN_TYPES = [
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "duration",
  "cubicBezier",
  "number",
  "strokeStyle",
  "border",
  "transition",
  "shadow",
  "gradient",
  "typography",
] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];
export type TokenEntry = {
  path: string;
  type: TokenType;
  value: unknown;
  description: string;
  css: string;
  variable: string;
};
const weights: Record<string, number> = {
  thin: 100,
  hairline: 100,
  "extra-light": 200,
  "ultra-light": 200,
  light: 300,
  normal: 400,
  regular: 400,
  book: 400,
  medium: 500,
  "semi-bold": 600,
  "demi-bold": 600,
  bold: 700,
  "extra-bold": 800,
  "ultra-bold": 800,
  black: 900,
  heavy: 900,
  "extra-black": 950,
  "ultra-black": 950,
};
const spaces = [
  "srgb",
  "srgb-linear",
  "display-p3",
  "a98-rgb",
  "prophoto-rgb",
  "rec2020",
  "xyz-d50",
  "xyz-d65",
  "hsl",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
];
const own = (o: object, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k);
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Expected a token or group object.");
  return v as Record<string, unknown>;
}
function finite(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new Error("Expected a finite number.");
  return v;
}
const compositeFields: Partial<Record<TokenType, Record<string, TokenType>>> = {
  border: { color: "color", width: "dimension", style: "strokeStyle" },
  transition: {
    duration: "duration",
    delay: "duration",
    timingFunction: "cubicBezier",
  },
  shadow: {
    color: "color",
    offsetX: "dimension",
    offsetY: "dimension",
    blur: "dimension",
    spread: "dimension",
  },
  gradient: { color: "color", position: "number" },
  typography: {
    fontFamily: "fontFamily",
    fontSize: "dimension",
    fontWeight: "fontWeight",
    letterSpacing: "dimension",
    lineHeight: "number",
  },
};
function fields(type: TokenType, value: unknown): Record<string, unknown> {
  const v = record(value),
    keys = Object.keys(compositeFields[type] ?? {});
  if (
    keys.some((k) => !own(v, k)) ||
    Object.keys(v).some(
      (k) => !keys.includes(k) && !(type === "shadow" && k === "inset"),
    )
  )
    throw new Error(
      `Invalid ${type} properties. Required: ${keys.join(", ")}.`,
    );
  return v;
}
function alias(v: unknown): string | undefined {
  return typeof v === "string" && /^\{[^{}]+\}$/.test(v)
    ? v.slice(1, -1)
    : undefined;
}
// Underscore and punctuation are encoded, so a path separator never collides with a name.
export function tokenVariable(path: string): string {
  return (
    "--token-" +
    path
      .split(".")
      .map((part) =>
        Array.from(part)
          .map((c) =>
            /[a-zA-Z0-9]/.test(c)
              ? c
              : "_" + c.codePointAt(0)!.toString(16) + "_",
          )
          .join(""),
      )
      .join("--")
  );
}
function cssString(value: string): string {
  return (
    '"' +
    Array.from(value)
      .map((c) =>
        /[a-zA-Z0-9 -]/.test(c)
          ? c
          : "\\" + c.codePointAt(0)!.toString(16) + " ",
      )
      .join("") +
    '"'
  );
}
export function tokenValueCss(type: TokenType, value: unknown): string {
  if (type === "strokeStyle") {
    if (typeof value === "string") {
      if (
        ![
          "solid",
          "dashed",
          "dotted",
          "double",
          "groove",
          "ridge",
          "outset",
          "inset",
        ].includes(value)
      )
        throw new Error("Unsupported stroke style.");
      return value;
    }
    const v = record(value);
    if (
      Object.keys(v).some((k) => !["dashArray", "lineCap"].includes(k)) ||
      !Array.isArray(v.dashArray) ||
      !v.dashArray.length ||
      v.dashArray.length > 100 ||
      !["round", "butt", "square"].includes(v.lineCap as string)
    )
      throw new Error("A custom stroke needs a dashArray and lineCap.");
    v.dashArray.forEach((d) => {
      tokenValueCss("dimension", d);
      if (Number(record(d).value) < 0)
        throw new Error("Dash lengths cannot be negative.");
    });
    return "dashed";
  }
  if (type === "shadow") {
    const layers = Array.isArray(value) ? value : [value];
    if (!layers.length || layers.length > 100)
      throw new Error(
        "Use 1–100 shadow layers. Nested shadow arrays are not flattened.",
      );
    return layers
      .map((layer) => {
        const v = fields(type, layer);
        if (v.inset !== undefined && typeof v.inset !== "boolean")
          throw new Error("Shadow inset must be a boolean.");
        const dimensions = ["offsetX", "offsetY", "blur", "spread"].map((k) =>
          tokenValueCss("dimension", v[k]),
        );
        if (Number(record(v.blur).value) < 0)
          throw new Error("Shadow blur cannot be negative.");
        return `${v.inset ? "inset " : ""}${dimensions.join(" ")} ${tokenValueCss("color", v.color)}`;
      })
      .join(", ");
  }
  if (type === "gradient") {
    if (!Array.isArray(value) || !value.length || value.length > 100)
      throw new Error(
        "Use 1–100 gradient stops. Nested gradient arrays are not flattened.",
      );
    const stops = value.map((stop) => {
      const v = fields(type, stop);
      return `${tokenValueCss("color", v.color)} ${Math.max(0, Math.min(1, finite(v.position))) * 100}%`;
    });
    if (stops.length === 1) stops.push(stops[0]);
    return `linear-gradient(90deg, ${stops.join(", ")})`;
  }
  if (type === "border") {
    const v = fields(type, value),
      width = tokenValueCss("dimension", v.width);
    if (Number(record(v.width).value) < 0)
      throw new Error("Border width cannot be negative.");
    return `${width} ${tokenValueCss("strokeStyle", v.style)} ${tokenValueCss("color", v.color)}`;
  }
  if (type === "transition") {
    const v = fields(type, value),
      duration = tokenValueCss("duration", v.duration);
    if (Number(record(v.duration).value) < 0)
      throw new Error("Transition duration cannot be negative.");
    return `${duration} ${tokenValueCss("cubicBezier", v.timingFunction)} ${tokenValueCss("duration", v.delay)}`;
  }
  if (type === "typography") {
    const v = fields(type, value);
    tokenValueCss("dimension", v.letterSpacing);
    const size = tokenValueCss("dimension", v.fontSize),
      height = finite(v.lineHeight);
    if (Number(record(v.fontSize).value) < 0 || height < 0)
      throw new Error("Font size and line height cannot be negative.");
    return `${tokenValueCss("fontWeight", v.fontWeight)} ${size}/${height} ${tokenValueCss("fontFamily", v.fontFamily)}`;
  }
  if (type === "number") return String(finite(value));
  if (type === "fontWeight") {
    const n =
      typeof value === "string" && own(weights, value)
        ? weights[value]
        : finite(value);
    if (n < 1 || n > 1000)
      throw new Error("Font weight must be from 1 to 1000.");
    return String(n);
  }
  if (type === "dimension" || type === "duration") {
    const v = record(value);
    if (!Object.keys(v).every((k) => ["value", "unit"].includes(k)))
      throw new Error("Unexpected dimension/duration property.");
    const n = finite(v.value);
    if (
      !(type === "dimension" ? ["px", "rem"] : ["ms", "s"]).includes(
        v.unit as string,
      )
    )
      throw new Error(type === "dimension" ? "Use px or rem." : "Use ms or s.");
    return `${n}${v.unit}`;
  }
  if (type === "fontFamily") {
    const values = Array.isArray(value) ? value : [value];
    if (
      !values.length ||
      values.length > 30 ||
      values.some((v) => typeof v !== "string" || !v.trim() || v.length > 200)
    )
      throw new Error("Use a font name or a nonempty list of font names.");
    const generic = [
      "serif",
      "sans-serif",
      "monospace",
      "cursive",
      "fantasy",
      "system-ui",
      "ui-serif",
      "ui-sans-serif",
      "ui-monospace",
      "ui-rounded",
      "emoji",
      "math",
      "fangsong",
    ];
    return (values as string[])
      .map((v) => (generic.includes(v) ? v : cssString(v)))
      .join(", ");
  }
  if (type === "cubicBezier") {
    if (!Array.isArray(value) || value.length !== 4)
      throw new Error("A cubic Bézier needs four numbers.");
    value.forEach(finite);
    if (value[0] < 0 || value[0] > 1 || value[2] < 0 || value[2] > 1)
      throw new Error("Timing x coordinates must be from 0 to 1.");
    return `cubic-bezier(${value.join(",")})`;
  }
  const c = record(value);
  if (
    !Object.keys(c).every((k) =>
      ["colorSpace", "components", "alpha", "hex"].includes(k),
    )
  )
    throw new Error("Unexpected color property.");
  if (
    !spaces.includes(c.colorSpace as string) ||
    !Array.isArray(c.components) ||
    c.components.length !== 3
  )
    throw new Error("Use a supported DTCG color space with three components.");
  c.components.forEach((v) => {
    if (v !== "none") finite(v);
  });
  const alpha = c.alpha === undefined ? 1 : finite(c.alpha);
  if (alpha < 0 || alpha > 1)
    throw new Error("Color alpha must be from 0 to 1.");
  if (
    c.hex !== undefined &&
    (typeof c.hex !== "string" || !/^#[0-9a-f]{6}$/i.test(c.hex))
  )
    throw new Error("Color hex fallback must use six hexadecimal digits.");
  const space = c.colorSpace as string;
  c.components.forEach((v, i) => {
    if (v === "none") return;
    const n = Number(v);
    let min = 0,
      max = 1,
      exclusive = false;
    if (["hsl", "hwb"].includes(space)) {
      max = i === 0 ? 360 : 100;
      exclusive = i === 0;
    } else if (["lab", "oklab", "lch", "oklch"].includes(space)) {
      if (i === 0) max = space.startsWith("ok") ? 1 : 100;
      else if (space.endsWith("lch")) {
        max = i === 1 ? Infinity : 360;
        exclusive = i === 2;
      } else {
        min = -Infinity;
        max = Infinity;
      }
    }
    if (n < min || n > max || (exclusive && n === max))
      throw new Error(
        `Color component ${i + 1} is outside the ${space} range.`,
      );
  });
  const components = c.components
    .map((v, i) =>
      (c.colorSpace === "hsl" || c.colorSpace === "hwb") &&
      i > 0 &&
      v !== "none"
        ? `${v}%`
        : v,
    )
    .join(" ");
  return ["hsl", "hwb", "lab", "lch", "oklab", "oklch"].includes(
    c.colorSpace as string,
  )
    ? `${c.colorSpace}(${components} / ${alpha})`
    : `color(${c.colorSpace} ${components} / ${alpha})`;
}
export function inspectTokens(input: unknown): {
  document: TokenDocument;
  entries: TokenEntry[];
} {
  const encoded = JSON.stringify(input);
  if (!encoded || encoded.length > 250000)
    throw new Error("Token document must be at most 250 KB of JSON.");
  const document = record(JSON.parse(encoded));
  const nodes = new Map<
    string,
    { node: Record<string, unknown>; type: unknown }
  >();
  let visited = 0;
  function walk(v: unknown, path: string[], inherited?: unknown) {
    if (++visited > 2000 || path.length > 16)
      throw new Error(
        "Token document exceeds 2000 groups/tokens or 16 levels.",
      );
    const n = record(v);
    if (own(n, "$extends"))
      throw new Error(
        "Group extensions are not supported yet. Import explicit groups instead.",
      );
    if (n.$description !== undefined && typeof n.$description !== "string")
      throw new Error("Descriptions must be text.");
    if (n.$type !== undefined && !TOKEN_TYPES.includes(n.$type as TokenType))
      throw new Error(
        `Unsupported token type: ${String(n.$type)}. Supported types: ${TOKEN_TYPES.join(", ")}.`,
      );
    const type = n.$type ?? inherited;
    if (own(n, "$value")) {
      if (!path.length)
        throw new Error("Place root tokens inside a named group or token.");
      if (Object.keys(n).some((k) => !k.startsWith("$")))
        throw new Error("A token cannot also contain groups.");
      nodes.set(path.join("."), { node: n, type });
      return;
    }
    for (const [key, value] of Object.entries(n)) {
      if (key.startsWith("$") && key !== "$root") {
        if (
          !["$type", "$description", "$extensions", "$deprecated"].includes(key)
        )
          throw new Error(`Unsupported group property ${key}.`);
        continue;
      }
      if (!key || /[.{}]/.test(key) || key.length > 100)
        throw new Error(
          "Token/group names cannot contain dots or braces and must be at most 100 characters.",
        );
      walk(value, [...path, key], type);
    }
  }
  walk(document, []);
  if (nodes.size > 500) throw new Error("Use at most 500 tokens.");
  const cache = new Map<string, { type: TokenType; value: unknown }>();
  let operations = 0;
  function resolveValue(v: unknown, stack: Set<unknown>, depth = 0): unknown {
    if (++operations > 20000 || depth > 64)
      throw new Error("Token reference graph is too complex.");
    const target = alias(v);
    if (target) return resolveToken(target, stack).value;
    if (Array.isArray(v))
      return v.map((x) => resolveValue(x, stack, depth + 1));
    if (v && typeof v === "object") {
      const r = record(v);
      if (own(r, "$ref")) {
        if (
          Object.keys(r).length !== 1 ||
          typeof r.$ref !== "string" ||
          !r.$ref.startsWith("#/")
        )
          throw new Error(
            "Use a local JSON Pointer as the only $ref property.",
          );
        if (stack.has(r)) throw new Error("Circular JSON Pointer reference.");
        const next = new Set(stack).add(r);
        let node: unknown = document;
        for (const raw of r.$ref.slice(2).split("/")) {
          if (/~(?![01])/.test(raw))
            throw new Error("Invalid JSON Pointer escape.");
          const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
          if (!node || typeof node !== "object" || !own(node, key))
            throw new Error(`Missing JSON Pointer target ${r.$ref}.`);
          node = (node as Record<string, unknown>)[key];
        }
        return resolveValue(node, next, depth + 1);
      }
      return Object.fromEntries(
        Object.entries(r).map(([k, x]) => [
          k,
          resolveValue(x, stack, depth + 1),
        ]),
      );
    }
    return v;
  }
  function resolveToken(
    path: string,
    stack: Set<unknown>,
  ): { type: TokenType; value: unknown } {
    if (stack.has(path))
      throw new Error(`Circular token alias involving ${path}.`);
    if (cache.has(path)) return cache.get(path)!;
    const entry = nodes.get(path);
    if (!entry) throw new Error(`Missing token alias ${path}.`);
    const next = new Set(stack).add(path);
    const target = alias(entry.node.$value);
    const referenced = target ? resolveToken(target, next) : undefined;
    const type = entry.type ?? referenced?.type;
    if (!TOKEN_TYPES.includes(type as TokenType))
      throw new Error(`Token ${path} needs an explicit or inherited type.`);
    if (referenced && referenced.type !== type)
      throw new Error(`Alias ${path} has a different type from ${target}.`);
    function checkTypedReferences(expected: TokenType, raw: unknown) {
      const name = alias(raw);
      if (name) {
        if (resolveToken(name, next).type !== expected)
          throw new Error(
            `Alias ${name} does not match required ${expected} type.`,
          );
        return;
      }
      if (!raw || typeof raw !== "object") return;
      if (Array.isArray(raw)) {
        if (expected === "shadow" || expected === "gradient")
          raw.forEach((x) => checkTypedReferences(expected, x));
        return;
      }
      const r = record(raw);
      if (own(r, "$ref")) return;
      for (const [key, kind] of Object.entries(compositeFields[expected] ?? {}))
        checkTypedReferences(kind, r[key]);
      if (expected === "strokeStyle" && Array.isArray(r.dashArray))
        r.dashArray.forEach((x) => checkTypedReferences("dimension", x));
    }
    checkTypedReferences(type as TokenType, entry.node.$value);
    const value = referenced
      ? referenced.value
      : resolveValue(entry.node.$value, next);
    try {
      tokenValueCss(type as TokenType, value);
    } catch (error) {
      throw new Error(
        `${path}: ${error instanceof Error ? error.message : "Invalid token value."}`,
      );
    }
    const result = { type: type as TokenType, value };
    cache.set(path, result);
    return result;
  }
  const entries = [...nodes].map(([path, { node }]) => {
    const { type, value } = resolveToken(path, new Set());
    return {
      path,
      type,
      value,
      description:
        typeof node.$description === "string" ? node.$description : "",
      variable: tokenVariable(path),
      css: tokenValueCss(type, value),
    };
  });
  return { document, entries };
}
export function tokenDeclarations(entry: TokenEntry): Record<string, string> {
  const declarations: Record<string, string> = { [entry.variable]: entry.css };
  if (entry.type === "typography") {
    const value = record(entry.value);
    for (const [key, type] of Object.entries(compositeFields.typography!))
      declarations[
        entry.variable +
          "-" +
          key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())
      ] = tokenValueCss(type, value[key]);
  }
  if (entry.type === "strokeStyle" && typeof entry.value === "object") {
    const value = record(entry.value);
    declarations[entry.variable + "-dash-array"] = (
      value.dashArray as unknown[]
    )
      .map((v) => tokenValueCss("dimension", v))
      .join(" ");
    declarations[entry.variable + "-line-cap"] = String(value.lineCap);
  }
  return declarations;
}
export function tokenCss(input: unknown): string {
  const entries = inspectTokens(input).entries;
  const declarations = entries.flatMap((e) =>
    Object.entries(tokenDeclarations(e)).map(
      ([name, value]) => `  ${name}: ${value};`,
    ),
  );
  return ":root{\n" + declarations.join("\n") + "\n}";
}
export function tokenMappings(input: unknown): string {
  return JSON.stringify(
    Object.fromEntries(
      inspectTokens(input).entries.map((e) => [
        e.path,
        {
          type: e.type,
          variable: e.variable,
          css: e.css,
          usage: `var(${e.variable})`,
          declarations: tokenDeclarations(e),
        },
      ]),
    ),
    null,
    2,
  );
}

// SCSS quoted strings also interpolate #{...}; JSON quoting alone is insufficient.
function scssString(value: string): string {
  return '"' + Array.from(value).map((character) => {
    const code = character.codePointAt(0)!;
    return character === '"' || character === '\\' || character === '#' || code < 32 || code === 127
      ? `\\${code.toString(16)} `
      : character;
  }).join('') + '"';
}

export function tokenScss(input: unknown): string {
  const entries = inspectTokens(input).entries;
  const rows = entries.map((entry) => {
    // Numeric primitives remain usable in Sass arithmetic; other values preserve
    // their CSS representation without Sass evaluating modern CSS functions.
    const numeric = ['number', 'dimension', 'duration'].includes(entry.type) ||
      (entry.type === 'fontWeight' && typeof entry.value === 'number');
    const value = numeric ? entry.css : `string.unquote(${scssString(entry.css)})`;
    const declarations = Object.entries(tokenDeclarations(entry)).map(([name, css]) =>
      `      ${scssString(name)}: string.unquote(${scssString(css)}),`).join('\n');
    return `  ${scssString(entry.path)}: (\n    "type": ${scssString(entry.type)},\n    "value": ${value},\n    "css-variable": ${scssString(entry.variable)},\n    "declarations": (\n${declarations}\n    ),\n  ),`;
  });
  return '@use "sass:string";\n\n' +
    '// Load with @use "web-layout.tokens" as tokens; and @use "sass:map";\n' +
    '// Read a value with map.get(tokens.$tokens, "your.token.path", "value").\n' +
    '// Numeric sizes, times and numbers support Sass arithmetic. Other values are CSS strings.\n' +
    '// Aliases are resolved snapshots; declarations includes composite CSS subproperties.\n' +
    '$tokens: (\n' + rows.join('\n') + '\n) !default;\n';
}
export function setToken(
  input: unknown,
  path: string,
  type: TokenType,
  value: unknown,
  description: string,
): TokenDocument {
  const parts = path.split(".");
  if (
    parts.some(
      (p) =>
        !p ||
        p.startsWith("$") ||
        /[{}]/.test(p) ||
        ["__proto__", "constructor", "prototype"].includes(p),
    )
  )
    throw new Error("Use dot-separated group names and a token name.");
  const doc = JSON.parse(JSON.stringify(input));
  let current = record(doc);
  for (const part of parts.slice(0, -1)) {
    if (!own(current, part)) current[part] = {};
    current = record(current[part]);
    if (own(current, "$value"))
      throw new Error("A token cannot contain another token.");
  }
  const name = parts.at(-1)!;
  if (own(current, name) && !own(record(current[name]), "$value"))
    throw new Error("This path is a group. Choose a token name.");
  current[name] = {
    ...(own(current, name) ? record(current[name]) : {}),
    $type: type,
    $value: value,
    $description: description,
  };
  return inspectTokens(doc).document;
}
export function removeToken(input: unknown, path: string): TokenDocument {
  const doc = JSON.parse(JSON.stringify(input));
  const parts = path.split(".");
  let n = record(doc);
  for (const p of parts.slice(0, -1)) {
    if (!own(n, p)) throw new Error("Token was not found.");
    n = record(n[p]);
  }
  delete n[parts.at(-1)!];
  return inspectTokens(doc).document;
}
