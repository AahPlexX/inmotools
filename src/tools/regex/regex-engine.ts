import type { RegexMatchRecord, RegexRunResult } from './regex-types';
export { executePcre2Regex } from './pcre-engine';

const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
const normalizeNamedGroups = (groups: Record<string, string | undefined> | undefined): Record<string, string> => Object.fromEntries(
  Object.entries(groups ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
);

export const executeEcmaRegex = (pattern: string, flags: string, subject: string): RegexRunResult => {
  const started = now();
  try {
    const expression = new RegExp(pattern, flags);
    const matches: RegexMatchRecord[] = [];
    const collect = (match: RegExpExecArray) => matches.push({
      match: match[0],
      index: match.index,
      end: match.index + match[0].length,
      groups: match.slice(1).map((value) => value ?? ''),
      namedGroups: normalizeNamedGroups(match.groups),
    });
    if (expression.global || expression.sticky) {
      let match: RegExpExecArray | null;
      while ((match = expression.exec(subject)) !== null && matches.length < 5000) {
        collect(match);
        if (match[0] === '' && expression.lastIndex === match.index) expression.lastIndex += 1;
      }
    } else {
      const match = expression.exec(subject);
      if (match) collect(match);
    }
    return { engine: 'ECMAScript · browser RegExp', capability: 'execution', matches, durationMs: now() - started, error: null };
  } catch (error) {
    return { engine: 'ECMAScript · browser RegExp', capability: 'execution', matches: [], durationMs: now() - started, error: error instanceof Error ? error.message : String(error) };
  }
};
