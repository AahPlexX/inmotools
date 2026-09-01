import { stringify as stringifyYaml } from 'yaml';
import type { RegexCodeTarget, RegexFlavor } from './regex-types';

export interface AssertionExportBundle {
  readonly engine: RegexFlavor;
  readonly pattern: string;
  readonly flags: string;
  readonly positive: readonly string[];
  readonly negative: readonly string[];
}

export interface AssertionExportInput {
  readonly engine: RegexFlavor;
  readonly pattern: string;
  readonly flags: string;
  readonly positive: string;
  readonly negative: string;
}

export type AssertionExportFormat = 'json' | 'yaml';

const nonEmptyLines = (value: string) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

export const buildAssertionExport = (input: AssertionExportInput): AssertionExportBundle => ({
  engine: input.engine,
  pattern: input.pattern,
  flags: input.flags,
  positive: nonEmptyLines(input.positive),
  negative: nonEmptyLines(input.negative),
});

export const serializeAssertionExport = (bundle: AssertionExportBundle, format: AssertionExportFormat) =>
  format === 'json' ? JSON.stringify(bundle, null, 2) : stringifyYaml(bundle);

const EXTENSIONS: Record<RegexCodeTarget, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  go: 'go',
  rust: 'rs',
  php: 'php',
  java: 'java',
  csharp: 'cs',
  ruby: 'rb',
};

export const codeFileExtension = (target: RegexCodeTarget) => EXTENSIONS[target];
