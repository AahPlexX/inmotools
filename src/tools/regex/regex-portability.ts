import { analyzeCompatibility } from './regex-compat';
import type { RegexFlavor } from './regex-types';

export type RegexPortabilityStatus = 'portable' | 'safe-rewrite' | 'manual';
export type RegexPortabilityChangeKind = 'named-capture' | 'named-backreference';

export interface RegexPortabilityChange {
  readonly kind: RegexPortabilityChangeKind;
  readonly from: string;
  readonly to: string;
  readonly note: string;
}

export interface RegexPortabilityPlan {
  readonly sourceFlavor: RegexFlavor;
  readonly targetFlavor: RegexFlavor;
  readonly status: RegexPortabilityStatus;
  readonly inputPattern: string;
  readonly outputPattern: string;
  readonly changes: readonly RegexPortabilityChange[];
  readonly blockers: readonly string[];
}

const ANGLE_NAME_FLAVORS = new Set<RegexFlavor>(['ecmascript', 'pcre', 'pcre2', 'java', 'dotnet', 'oniguruma']);
const NAME = '[A-Za-z_][A-Za-z0-9_]*';
const angleCapture = new RegExp(`\\(\\?<(${NAME})>`, 'g');
const angleBackreference = new RegExp(`\\\\k<(${NAME})>`, 'g');
const pythonCapture = new RegExp(`\\(\\?P<(${NAME})>`, 'g');
const pythonBackreference = new RegExp(`\\(\\?P=(${NAME})\\)`, 'g');

const rewrite = (
  pattern: string,
  matcher: RegExp,
  kind: RegexPortabilityChangeKind,
  replacement: (name: string) => string,
  changes: RegexPortabilityChange[],
): string => pattern.replace(matcher, (source: string, name: string) => {
  const target = replacement(name);
  changes.push({ kind, from: source, to: target, note: 'Exact named-group syntax rewrite.' });
  return target;
});

const rewriteNamedSyntax = (pattern: string, sourceFlavor: RegexFlavor, targetFlavor: RegexFlavor) => {
  const changes: RegexPortabilityChange[] = [];
  let outputPattern = pattern;

  if (targetFlavor === 'python' && ANGLE_NAME_FLAVORS.has(sourceFlavor)) {
    outputPattern = rewrite(outputPattern, angleCapture, 'named-capture', (name) => `(?P<${name}>`, changes);
    outputPattern = rewrite(outputPattern, angleBackreference, 'named-backreference', (name) => `(?P=${name})`, changes);
  } else if (sourceFlavor === 'python' && ANGLE_NAME_FLAVORS.has(targetFlavor)) {
    outputPattern = rewrite(outputPattern, pythonCapture, 'named-capture', (name) => `(?<${name}>`, changes);
    outputPattern = rewrite(outputPattern, pythonBackreference, 'named-backreference', (name) => `\\k<${name}>`, changes);
  }

  return { outputPattern, changes };
};

export const planRegexPortability = (
  pattern: string,
  sourceFlavor: RegexFlavor,
  targetFlavor: RegexFlavor,
): RegexPortabilityPlan => {
  const { outputPattern, changes } = rewriteNamedSyntax(pattern, sourceFlavor, targetFlavor);
  const targetCompatibility = analyzeCompatibility(outputPattern).find((entry) => entry.flavor === targetFlavor);
  const blockers = targetCompatibility?.issues ?? [];
  const status: RegexPortabilityStatus = blockers.length > 0
    ? 'manual'
    : changes.length > 0
      ? 'safe-rewrite'
      : 'portable';

  return {
    sourceFlavor,
    targetFlavor,
    status,
    inputPattern: pattern,
    outputPattern,
    changes,
    blockers,
  };
};
