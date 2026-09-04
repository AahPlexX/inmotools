import type { RegexFlavor } from './regex-types';

export type SubstitutionStatus = 'execution' | 'host-specific' | 'unavailable';

export interface SubstitutionProfile {
  readonly flavor: RegexFlavor;
  readonly status: SubstitutionStatus;
  /** The named-group replacement reference syntax for this flavor, when it has one. */
  readonly namedReference: string | null;
  readonly note: string;
}

const PROFILES: Readonly<Record<RegexFlavor, SubstitutionProfile>> = {
  ecmascript: { flavor: 'ecmascript', status: 'execution', namedReference: '$<name>', note: 'Executes via the browser String.prototype.replace, which natively supports $<name> for named groups.' },
  pcre2: { flavor: 'pcre2', status: 'execution', namedReference: '${name}', note: 'Executes through the bundled PCRE2 WebAssembly runtime, using its ${name} named-group replacement syntax.' },
  pcre: { flavor: 'pcre', status: 'unavailable', namedReference: null, note: 'No legacy PCRE runtime is bundled; substitution cannot execute for this flavor.' },
  python: { flavor: 'python', status: 'execution', namedReference: '\\g<name>', note: 'Executes locally through bundled CPython/Pyodide, using re.sub with its \\g<name> named-group replacement syntax.' },
  'go-re2': { flavor: 'go-re2', status: 'unavailable', namedReference: null, note: 'No Go/RE2 runtime is bundled; substitution cannot execute for this flavor.' },
  java: { flavor: 'java', status: 'unavailable', namedReference: null, note: 'No Java runtime is bundled; substitution cannot execute for this flavor.' },
  dotnet: { flavor: 'dotnet', status: 'unavailable', namedReference: null, note: 'No .NET runtime is bundled; substitution cannot execute for this flavor.' },
  rust: { flavor: 'rust', status: 'unavailable', namedReference: null, note: 'No Rust runtime is bundled; substitution cannot execute for this flavor.' },
  'posix-ere': { flavor: 'posix-ere', status: 'unavailable', namedReference: null, note: 'POSIX ERE has no named-group replacement syntax and no bundled runtime.' },
  'posix-bre': { flavor: 'posix-bre', status: 'unavailable', namedReference: null, note: 'POSIX BRE has no named-group replacement syntax and no bundled runtime.' },
  oniguruma: { flavor: 'oniguruma', status: 'host-specific', namedReference: null, note: 'Oniguruma executes via the bundled vscode-oniguruma binding, but that binding only exposes matching, not a substitution/replace API; substitution semantics vary by embedding host.' },
};

export const getSubstitutionProfile = (flavor: RegexFlavor): SubstitutionProfile => PROFILES[flavor];

export interface EcmaSubstitutionResult {
  readonly output: string | null;
  readonly error: string | null;
}

/**
 * Substitutes using the native ECMAScript RegExp/String.prototype.replace
 * engine, which already supports $<name> named-group references directly -
 * no translation layer is needed for this flavor.
 */
export const executeEcmaSubstitution = (
  pattern: string,
  flags: string,
  subject: string,
  replacement: string,
): EcmaSubstitutionResult => {
  try {
    const expression = new RegExp(pattern, flags);
    return { output: subject.replace(expression, replacement), error: null };
  } catch (error) {
    return { output: null, error: error instanceof Error ? error.message : String(error) };
  }
};
