import type { RegexCodeTarget, RegexFlavor } from './regex-types';

export interface RegexSavedSession {
  readonly id: string;
  readonly savedAt: number;
  readonly pattern: string;
  readonly flags: string;
  readonly subject: string;
  readonly flavor: RegexFlavor;
  readonly replacement: string;
  readonly positive: string;
  readonly negative: string;
  readonly codeTarget: RegexCodeTarget;
}

export const MAX_REGEX_SESSIONS = 200;

export const addRegexSessionSnapshot = (
  current: readonly RegexSavedSession[],
  snapshot: RegexSavedSession,
): RegexSavedSession[] => [snapshot, ...current.filter((item) => item.id !== snapshot.id)].slice(0, MAX_REGEX_SESSIONS);
