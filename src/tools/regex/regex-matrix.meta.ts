import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "regex-matrix",
  category: "developer",
  aliases: ["#/regex-matrix"],
  shortTitle: "RegexMatrix Studio & Academy",
  title: "RegexMatrix Studio & Academy — Local Multi-Engine Regex Debugger & Learning Lab",
  audience: "Developers · security engineers · students · educators",
  summary: "Debug real ECMAScript, PCRE2, Oniguruma, and Python patterns, inspect matches and structure, assess ECMAScript ReDoS ambiguity, compare target-flavor compatibility, generate production snippets, and practice through a built-in local Academy.",
  privacy: "Patterns, test strings, PCRE2 and Oniguruma WebAssembly execution, Pyodide Python execution, diagnostics, lesson progress, saved state, and exports stay on this device. No account or backend is required.",
  accepts: "Regular-expression patterns, flags, local test text, assertion cases, and built-in Academy exercises",
  outputs: "Match/group diagnostics, structural explanations, compatibility reports, ReDoS analysis, code snippets, assertion JSON, SVG diagrams, and compressed share state",
  steps: [
    "Choose an execution engine or compatibility target and enter a pattern plus test subject.",
    "Run and inspect matches, captures, structure, safety, assertions, and generated target-language code.",
    "Switch to Academy for deterministic lessons, then open any exercise directly in Studio when you need deeper diagnostics.",
  ],
  hint: "ECMAScript, PCRE2, Oniguruma, and Python are the execution engines in this release; Oniguruma execution currently maps the g, i, and u flags, and Python runs on a Pyodide runtime served from this site that loads on first use. Legacy PCRE, Go/RE2, Java, .NET, Rust, and POSIX are explicitly labeled compatibility/code-generation targets until verified offline runtimes are shipped.",
  load: () => import('./RegexWorkspace'),
} satisfies ToolMeta;
