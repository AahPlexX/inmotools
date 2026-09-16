import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const TRACKER = '.tasks/CAD_STUDIO.md';
const EXPANSION_SPEC = 'docs/superpowers/specs/2026-09-11-cad-studio-capability-expansion.md';
const MINIMUM_EXPANDED_GATE_COUNT = 16;
const CAD_PROGRESS_PATHS = [
  'src/tools/cad',
  ':(glob)tests/unit/cad-*.test.ts',
  ':(exclude)tests/unit/cad-progress.test.ts',
  ':(glob)tests/e2e/cad*.spec.ts',
  'docs/superpowers/specs/2026-09-11-cad-studio-design.md',
  'docs/superpowers/specs/2026-09-11-cad-studio-dependency-decision.md',
  EXPANSION_SPEC,
  'docs/superpowers/plans/2026-09-11-cad-studio.md',
  'docs/superpowers/plans/2026-09-11-cad-studio-capability-expansion.md',
] as const;

function tracker(): string {
  return readFileSync(TRACKER, 'utf8');
}

function capabilityFloor(): number {
  const content = readFileSync(EXPANSION_SPEC, 'utf8');
  const match = content.match(/\*\*Current capability floor:\*\* (\d+) user-facing capabilities/);
  expect(match, 'capability expansion spec must declare the current capability floor').not.toBeNull();
  return Number(match?.[1]);
}

function latestCadImplementationCommit(): string {
  return execFileSync('git', ['rev-list', '-1', 'HEAD', '--', ...CAD_PROGRESS_PATHS], { encoding: 'utf8' }).trim();
}

describe('CAD Studio completion ledger', () => {
  it('tracks the newest CAD implementation checkpoint exactly', () => {
    const content = tracker();
    const match = content.match(/\*\*Last tracked implementation commit:\*\* `([0-9a-f]{40})`/);
    expect(match, 'CAD tracker must record a full implementation commit SHA').not.toBeNull();
    expect(match?.[1]).toBe(latestCadImplementationCommit());
  });

  it('keeps an expandable deterministic gate count internally consistent', () => {
    const content = tracker();
    const gates = [...content.matchAll(/^- \[([ x])\] \*\*G(\d+) —/gm)];
    expect(gates.length).toBeGreaterThanOrEqual(MINIMUM_EXPANDED_GATE_COUNT);
    expect(gates.map((entry) => Number(entry[2]))).toEqual([...Array(gates.length).keys()]);

    const completeCount = gates.filter((entry) => entry[1] === 'x').length;
    const declared = content.match(/\*\*Completed gates:\*\* (\d+) \/ (\d+)/);
    expect(declared).not.toBeNull();
    expect(Number(declared?.[1])).toBe(completeCount);
    expect(Number(declared?.[2])).toBe(gates.length);
  });

  it('binds completion to the authoritative capability floor instead of a hard-coded ceiling', () => {
    const content = tracker();
    const status = content.match(/\*\*Status:\*\* ([A-Z_]+)/)?.[1];
    const target = content.match(/\*\*Capability target:\*\* (\d+)/);
    const capabilities = content.match(/\*\*Completed user-facing capabilities:\*\* (\d+) \/ (\d+)/);

    expect(status).toMatch(/^(IN_PROGRESS|COMPLETE)$/);
    expect(target).not.toBeNull();
    expect(capabilities).not.toBeNull();

    const declaredTarget = Number(target?.[1]);
    expect(declaredTarget).toBe(capabilityFloor());
    expect(Number(capabilities?.[2])).toBe(declaredTarget);

    if (status === 'COMPLETE') {
      expect(Number(capabilities?.[1])).toBe(declaredTarget);
      expect(content).not.toMatch(/^- \[ \] \*\*G\d+ —/m);
    }
  });
});