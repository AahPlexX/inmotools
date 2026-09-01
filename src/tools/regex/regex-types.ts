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
