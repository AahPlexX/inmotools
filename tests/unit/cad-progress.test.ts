import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const TRACKER = '.tasks/CAD_STUDIO.md';
const CAD_PROGRESS_PATHS = [
  'src/tools/cad',
  'tests/unit/cad-project.test.ts',
  'tests/unit/cad-units.test.ts',
  'tests/unit/cad-topology.test.ts',
  'tests/unit/cad-parameters.test.ts',
  'tests/unit/cad-sketch-solver.test.ts',
  'tests/unit/cad-feature-evaluator.test.ts',
  'tests/unit/cad-export.test.ts',
  'tests/e2e/cad.spec.ts',
  'docs/superpowers/specs/2026-09-11-cad-studio-design.md',
  'docs/superpowers/specs/2026-09-11-cad-studio-dependency-decision.md',
  'docs/superpowers/plans/2026-09-11-cad-studio.md',
] as const;

function tracker(): string {
  return readFileSync(TRACKER, 'utf8');
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

  it('keeps the deterministic gate count internally consistent', () => {
    const content = tracker();
    const gates = [...content.matchAll(/^- \[([ x])\] \*\*G(\d+) —/gm)];
    expect(gates).toHaveLength(12);
    expect(gates.map((entry) => Number(entry[2]))).toEqual([...Array(12).keys()]);

    const completeCount = gates.filter((entry) => entry[1] === 'x').length;
    const declared = content.match(/\*\*Completed gates:\*\* (\d+) \/ 12/);
    expect(declared).not.toBeNull();
    expect(Number(declared?.[1])).toBe(completeCount);
  });

  it('cannot declare COMPLETE before all gates and all 100 user-facing capabilities are complete', () => {
    const content = tracker();
    const status = content.match(/\*\*Status:\*\* ([A-Z_]+)/)?.[1];
    const capabilities = content.match(/\*\*Completed user-facing capabilities:\*\* (\d+) \/ 100/);
    expect(status).toMatch(/^(IN_PROGRESS|COMPLETE)$/);
    expect(capabilities).not.toBeNull();

    if (status === 'COMPLETE') {
      expect(content).toContain('**Completed gates:** 12 / 12');
      expect(Number(capabilities?.[1])).toBe(100);
      expect(content).not.toMatch(/^- \[ \] \*\*G\d+ —/m);
    }
  });
});
