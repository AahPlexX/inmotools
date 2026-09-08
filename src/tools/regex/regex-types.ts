export type RegexMode = 'studio' | 'academy';
export type RegexFlavor = 'ecmascript' | 'pcre' | 'pcre2' | 'python' | 'go-re2' | 'java' | 'dotnet' | 'rust' | 'posix-ere' | 'posix-bre' | 'oniguruma';
export type RegexCodeTarget = 'javascript' | 'typescript' | 'python' | 'go' | 'rust' | 'php' | 'java' | 'csharp' | 'ruby';
export type RegexCapability = 'execution' | 'compatibility';

export interface RegexMatchRecord {
  readonly match: string;
  readonly index: number;
  readonly end: number;
  readonly groups: readonly string[];
  readonly namedGroups: Readonly<Record<string, string>>;
}

export interface RegexRunResult {
  readonly engine: string;
  readonly capability: 'execution';
  readonly matches: readonly RegexMatchRecord[];
  readonly durationMs: number;
  readonly error: string | null;
  readonly timedOut?: boolean;
  /** True when more matches exist beyond the returned match array. */
  readonly truncated?: boolean;
  /** Exact omitted count when the bounded scan completed; null when only a lower bound is known. */
  readonly omittedCount?: number | null;
  /** Exact number of matches encountered from the requested start cursor when known. */
  readonly totalMatches?: number | null;
  /** Cursor immediately after the final returned match, suitable for bounded continuation. */
  readonly nextStartIndex?: number | null;
  /** Subject code-unit index at which this run began. */
  readonly startIndex?: number;
  /** Maximum number of match records retained in this result. */
  readonly matchLimit?: number;
  /** False when the counting guard stopped before the end of the subject. */
  readonly totalMatchesExact?: boolean;
}

export interface RegexCompatibilityEntry {
  readonly flavor: RegexFlavor;
  readonly label: string;
  readonly capability: RegexCapability;
  readonly supported: boolean;
  readonly issues: readonly string[];
  readonly note: string;
}

export interface RegexExplanationNode {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly source: string;
  readonly start: number;
  readonly end: number;
  readonly children: readonly RegexExplanationNode[];
}

export interface RedosAssessment {
  readonly safe: boolean;
  readonly risk: 'linear' | 'caution' | 'critical' | 'unknown';
  readonly score: number | 'infinite' | null;
  readonly metricLabel: 'Ambiguity path score';
  readonly note: string;
  readonly trails: readonly { readonly start: number; readonly end: number; readonly source: string }[];
  readonly probe: {
    readonly prefix: string;
    readonly pump: string;
    readonly suffix: string;
    readonly basis: string;
  };
}

export interface RegexShareState {
  readonly mode: RegexMode;
  readonly flavor: RegexFlavor;
  readonly pattern: string;
  readonly flags: string;
  readonly subject: string;
}

export interface AcademyCase {
  readonly value: string;
  readonly shouldMatch: boolean;
  readonly explanation?: string;
}

export interface AcademyLesson {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly guide: string;
  readonly starter: string;
  readonly flags: string;
  readonly hint: string;
  readonly cases: readonly AcademyCase[];
}

export interface AcademyTrack {
  readonly id: 'fundamentals' | 'intermediate' | 'advanced' | 'production' | 'seo';
  readonly title: string;
  readonly lessons: readonly AcademyLesson[];
}
