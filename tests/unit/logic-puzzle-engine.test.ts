import { describe, expect, it } from 'vitest';
import { addComponent, addWire, createInitialDocument, relabelComponent, removeComponent } from '../../src/tools/logic/circuit-model';
import type { ComponentType, LogicDocument } from '../../src/tools/logic/logic-types';
import {
  buildStarterDocument,
  evaluatePuzzle,
  findLevel,
  nextUnsolved,
  parseProgress,
  PUZZLE_LEVELS,
  recordResult,
  serializeProgress,
  type PuzzleEvaluation,
  type PuzzleLevel,
} from '../../src/tools/logic/puzzle-engine';

interface Reference {
  /** Gate name -> type. */
  readonly gates: Readonly<Record<string, ComponentType>>;
  /** [from, to]. A source is a gate name or a switch label; a target is `gate.PIN` or an LED label. */
  readonly wires: readonly (readonly [string, string])[];
}

/** Builds a circuit for a level from a compact description, on top of the level's own starter circuit. */
const solve = (level: PuzzleLevel, reference: Reference, base: LogicDocument = buildStarterDocument(level)): LogicDocument => {
  let doc = base;
  const ids = new Map<string, string>();
  let y = 2;
  for (const [name, type] of Object.entries(reference.gates)) {
    doc = addComponent(doc, type, 12, y);
    y += 4;
    ids.set(name, doc.components[doc.components.length - 1]!.id);
  }
  const labelId = (label: string): string => doc.components.find((component) => component.label === label)!.id;
  for (const [from, to] of reference.wires) {
    const source = ids.has(from) ? { componentId: ids.get(from)!, portId: 'Y' } : { componentId: labelId(from), portId: 'Y' };
    const [targetName, pin] = to.split('.');
    const target = ids.has(targetName!) ? { componentId: ids.get(targetName!)!, portId: pin! } : { componentId: labelId(targetName!), portId: 'A' };
    doc = addWire(doc, source, target);
  }
  return doc;
};

const REFERENCES: Readonly<Record<string, Reference>> = {
  'light-the-bulb': { gates: {}, wires: [['A', 'Bulb']] },
  'flip-it': { gates: { n: 'NOT' }, wires: [['A', 'n.A'], ['n', 'Bulb']] },
  'both-on': { gates: { g: 'AND' }, wires: [['A', 'g.A'], ['B', 'g.B'], ['g', 'Bulb']] },
  'either-will-do': { gates: { g: 'OR' }, wires: [['A', 'g.A'], ['B', 'g.B'], ['g', 'Bulb']] },
  'exactly-one': {
    gates: { o: 'OR', n: 'NAND', a: 'AND' },
    wires: [['A', 'o.A'], ['B', 'o.B'], ['A', 'n.A'], ['B', 'n.B'], ['o', 'a.A'], ['n', 'a.B'], ['a', 'Bulb']],
  },
  'xor-from-nand': {
    gates: { n1: 'NAND', n2: 'NAND', n3: 'NAND', n4: 'NAND' },
    wires: [['A', 'n1.A'], ['B', 'n1.B'], ['A', 'n2.A'], ['n1', 'n2.B'], ['B', 'n3.A'], ['n1', 'n3.B'], ['n2', 'n4.A'], ['n3', 'n4.B'], ['n4', 'Bulb']],
  },
  'majority-vote': {
    gates: { o: 'OR', a1: 'AND', a2: 'AND', r: 'OR' },
    wires: [['A', 'o.A'], ['B', 'o.B'], ['C', 'a1.A'], ['o', 'a1.B'], ['A', 'a2.A'], ['B', 'a2.B'], ['a1', 'r.A'], ['a2', 'r.B'], ['r', 'Bulb']],
  },
  'half-adder': { gates: { x: 'XOR', a: 'AND' }, wires: [['A', 'x.A'], ['B', 'x.B'], ['A', 'a.A'], ['B', 'a.B'], ['x', 'SUM'], ['a', 'CARRY']] },
  'full-adder': {
    gates: { x1: 'XOR', x2: 'XOR', a1: 'AND', a2: 'AND', o: 'OR' },
    wires: [['A', 'x1.A'], ['B', 'x1.B'], ['x1', 'x2.A'], ['CIN', 'x2.B'], ['A', 'a1.A'], ['B', 'a1.B'], ['x1', 'a2.A'], ['CIN', 'a2.B'], ['a1', 'o.A'], ['a2', 'o.B'], ['x2', 'SUM'], ['o', 'COUT']],
  },
  'select-one': {
    gates: { n: 'NOT', a1: 'AND', a2: 'AND', o: 'OR' },
    wires: [['S', 'n.A'], ['A', 'a1.A'], ['n', 'a1.B'], ['B', 'a2.A'], ['S', 'a2.B'], ['a1', 'o.A'], ['a2', 'o.B'], ['o', 'Bulb']],
  },
  'greater-than': {
    gates: { nb1: 'NOT', g1: 'AND', e: 'XNOR', nb0: 'NOT', g0: 'AND', ae: 'AND', o: 'OR' },
    wires: [['B1', 'nb1.A'], ['A1', 'g1.A'], ['nb1', 'g1.B'], ['A1', 'e.A'], ['B1', 'e.B'], ['B0', 'nb0.A'], ['A0', 'g0.A'], ['nb0', 'g0.B'], ['e', 'ae.A'], ['g0', 'ae.B'], ['g1', 'o.A'], ['ae', 'o.B'], ['o', 'Bulb']],
  },
};

describe('puzzle level set', () => {
  it('has unique ids, unique input and output labels, and a full truth table for every level', () => {
    expect(new Set(PUZZLE_LEVELS.map((level) => level.id)).size).toBe(PUZZLE_LEVELS.length);
    for (const level of PUZZLE_LEVELS) {
      expect(level.inputs.length).toBeGreaterThan(0);
      expect(level.inputs.length).toBeLessThanOrEqual(4);
      expect(level.outputs.length).toBeGreaterThan(0);
      expect(new Set([...level.inputs, ...level.outputs]).size).toBe(level.inputs.length + level.outputs.length);
      for (let mask = 0; mask < 1 << level.inputs.length; mask += 1) {
        const bits = level.expected(mask);
        expect(bits).toHaveLength(level.outputs.length);
        expect(bits.every((value) => value === 0 || value === 1)).toBe(true);
      }
    }
  });

  it('never makes an output constant, so no level can be solved by ignoring the inputs', () => {
    for (const level of PUZZLE_LEVELS) {
      level.outputs.forEach((_, outputIndex) => {
        const values = new Set(Array.from({ length: 1 << level.inputs.length }, (_, mask) => level.expected(mask)[outputIndex]));
        expect(values.size, `${level.id} output ${outputIndex}`).toBe(2);
      });
    }
  });

  it('keeps the wording free of the word "AI" and gives every level a goal and a hint', () => {
    for (const level of PUZZLE_LEVELS) {
      expect(level.goal.length).toBeGreaterThan(10);
      expect(level.hint.length).toBeGreaterThan(10);
      expect(`${level.title} ${level.goal} ${level.hint}`).not.toMatch(/\bAI\b/);
    }
  });

  it('finds a level by id', () => {
    expect(findLevel('full-adder')?.title).toBe('Full adder');
    expect(findLevel('nope')).toBeUndefined();
  });
});

describe('puzzle starter circuits', () => {
  it.each(PUZZLE_LEVELS.map((level) => [level.id, level] as const))('%s starts with exactly its own labeled switches and LEDs and no gates', (_, level) => {
    const doc = buildStarterDocument(level);
    expect(doc.components.filter((component) => component.type === 'SWITCH').map((component) => component.label)).toEqual([...level.inputs]);
    expect(doc.components.filter((component) => component.type === 'LED').map((component) => component.label)).toEqual([...level.outputs]);
    expect(doc.wires).toEqual([]);
  });

  it.each(PUZZLE_LEVELS.map((level) => [level.id, level] as const))('%s is not solved by the blank starter', (_, level) => {
    const evaluation = evaluatePuzzle(buildStarterDocument(level), level);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.stars).toBe(0);
  });
});

describe('puzzle verification against reference solutions', () => {
  it.each(PUZZLE_LEVELS.map((level) => [level.id, level] as const))('%s is solved by its reference circuit at exactly par', (_, level) => {
    const evaluation = evaluatePuzzle(solve(level, REFERENCES[level.id]!), level);
    expect(evaluation.issues).toEqual([]);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.rows).toHaveLength(1 << level.inputs.length);
    expect(evaluation.rows.every((row) => row.ok)).toBe(true);
    expect(evaluation.gateCount).toBe(level.par);
    expect(evaluation.stars).toBe(2);
  });

  it('does not depend on the order the switches appear in the document', () => {
    const level = findLevel('select-one')!;
    const doc = solve(level, REFERENCES['select-one']!);
    const reversed: LogicDocument = { ...doc, components: [...doc.components].reverse() };
    expect(evaluatePuzzle(reversed, level).passed).toBe(true);
  });

  it('reports which rows are wrong, with what the circuit showed', () => {
    const level = findLevel('exactly-one')!;
    // OR alone is right except when both are on.
    const evaluation = evaluatePuzzle(solve(level, { gates: { g: 'OR' }, wires: [['A', 'g.A'], ['B', 'g.B'], ['g', 'Bulb']] }), level);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.stars).toBe(0);
    const wrong = evaluation.rows.filter((row) => !row.ok);
    expect(wrong.map((row) => row.mask)).toEqual([3]);
    expect(wrong[0]!.expected).toEqual([0]);
    expect(wrong[0]!.actual).toEqual([1]);
  });

  it('shows a floating output as Z rather than as a wrong 0', () => {
    const level = findLevel('flip-it')!;
    const evaluation = evaluatePuzzle(buildStarterDocument(level), level);
    expect(evaluation.rows.every((row) => row.actual[0] === 'Z')).toBe(true);
  });

  it('gives one star for a correct circuit that uses more parts than the reference', () => {
    const level = findLevel('both-on')!;
    const padded = solve(level, { gates: { g: 'AND', buffer: 'BUFFER' }, wires: [['A', 'g.A'], ['B', 'g.B'], ['g', 'buffer.A'], ['buffer', 'Bulb']] });
    const evaluation = evaluatePuzzle(padded, level);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.gateCount).toBe(2);
    expect(evaluation.stars).toBe(1);
  });

  it('accepts a different correct design than the reference', () => {
    const level = findLevel('either-will-do')!;
    // A OR B written as NAND(NOT A, NOT B).
    const evaluation = evaluatePuzzle(solve(level, {
      gates: { na: 'NOT', nb: 'NOT', n: 'NAND' },
      wires: [['A', 'na.A'], ['B', 'nb.A'], ['na', 'n.A'], ['nb', 'n.B'], ['n', 'Bulb']],
    }), level);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.stars).toBe(1);
  });
});

describe('puzzle rule enforcement', () => {
  it('names a missing required switch', () => {
    const level = findLevel('both-on')!;
    let doc = solve(level, REFERENCES['both-on']!);
    doc = removeComponent(doc, doc.components.find((component) => component.label === 'B')!.id);
    const evaluation = evaluatePuzzle(doc, level);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.rows).toEqual([]);
    expect(evaluation.issues.join(' ')).toMatch(/Missing switch "B"/);
  });

  it('rejects an extra switch, a duplicate label, and an extra LED', () => {
    const level = findLevel('both-on')!;
    const base = solve(level, REFERENCES['both-on']!);
    const withExtra = addComponent(base, 'SWITCH', 2, 20);
    expect(evaluatePuzzle(withExtra, level).issues.join(' ')).toMatch(/Extra switch/);
    const duplicated = relabelComponent(withExtra, withExtra.components[withExtra.components.length - 1]!.id, 'A');
    expect(evaluatePuzzle(duplicated, level).issues.join(' ')).toMatch(/2 switches labeled "A"/);
    expect(evaluatePuzzle(addComponent(base, 'LED', 30, 20), level).issues.join(' ')).toMatch(/Extra LED/);
  });

  it('rejects a part the level does not allow, and says what is allowed', () => {
    const level = findLevel('exactly-one')!;
    const evaluation = evaluatePuzzle(solve(level, { gates: { x: 'XOR' }, wires: [['A', 'x.A'], ['B', 'x.B'], ['x', 'Bulb']] }), level);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.issues.join(' ')).toMatch(/XOR is not allowed.*AND, OR, NOT, NAND, NOR/);
    expect(evaluation.rows).toEqual([]);
  });

  it('does not let the multiplexer block stand in for the gates in the multiplexer level', () => {
    const level = findLevel('select-one')!;
    const evaluation = evaluatePuzzle(addComponent(buildStarterDocument(level), 'MUX', 12, 2), level);
    expect(evaluation.issues.join(' ')).toMatch(/MUX is not allowed/);
  });

  it('allows only wires in the first level', () => {
    const level = findLevel('light-the-bulb')!;
    const evaluation = evaluatePuzzle(solve(level, { gates: { b: 'BUFFER' }, wires: [['A', 'b.A'], ['b', 'Bulb']] }), level);
    expect(evaluation.issues.join(' ')).toMatch(/BUFFER is not allowed.*only wires/);
  });

  it('explains why a circuit with a clock or flip-flop cannot be checked', () => {
    const level = findLevel('both-on')!;
    const doc = addComponent(solve(level, REFERENCES['both-on']!), 'D_FLIP_FLOP', 14, 30);
    const evaluation = evaluatePuzzle(doc, level);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.issues.join(' ')).toMatch(/not allowed|combinational/);
  });

  it('counts every part other than the level\'s own switches and LEDs as a gate', () => {
    const level = findLevel('full-adder')!;
    expect(evaluatePuzzle(solve(level, REFERENCES['full-adder']!), level).gateCount).toBe(5);
  });
});

describe('puzzle progress', () => {
  const solved = (id: string, gateCount: number, stars: 1 | 2): PuzzleEvaluation => ({ levelId: id, issues: [], rows: [], passed: true, gateCount, stars });

  it('records a solve and keeps the best result across attempts', () => {
    let progress = recordResult({}, solved('both-on', 3, 1));
    expect(progress['both-on']).toEqual({ solved: true, bestGateCount: 3, stars: 1 });
    progress = recordResult(progress, solved('both-on', 1, 2));
    expect(progress['both-on']).toEqual({ solved: true, bestGateCount: 1, stars: 2 });
    progress = recordResult(progress, solved('both-on', 5, 1));
    expect(progress['both-on']).toEqual({ solved: true, bestGateCount: 1, stars: 2 });
  });

  it('ignores a failed attempt', () => {
    const failed: PuzzleEvaluation = { levelId: 'both-on', issues: [], rows: [], passed: false, gateCount: 1, stars: 0 };
    expect(recordResult({}, failed)).toEqual({});
  });

  it('round-trips through storage', () => {
    const progress = recordResult(recordResult({}, solved('both-on', 1, 2)), solved('full-adder', 6, 1));
    expect(parseProgress(serializeProgress(progress))).toEqual(progress);
  });

  it('drops malformed, unknown, and out-of-range saved entries instead of trusting them', () => {
    expect(parseProgress(null)).toEqual({});
    expect(parseProgress('')).toEqual({});
    expect(parseProgress('not json')).toEqual({});
    expect(parseProgress('[1,2]')).toEqual({});
    expect(parseProgress('null')).toEqual({});
    const hostile = JSON.stringify({
      'both-on': { solved: true, bestGateCount: 1, stars: 2 },
      'flip-it': { solved: true, bestGateCount: -3, stars: 1 },
      'either-will-do': { solved: true, bestGateCount: 1.5, stars: 1 },
      'exactly-one': { solved: true, bestGateCount: 2, stars: 7 },
      'xor-from-nand': { solved: 'yes', bestGateCount: 4, stars: 1 },
      'majority-vote': 'solved',
      'not-a-level': { solved: true, bestGateCount: 1, stars: 1 },
      __proto__: { solved: true, bestGateCount: 1, stars: 1 },
    });
    expect(parseProgress(hostile)).toEqual({ 'both-on': { solved: true, bestGateCount: 1, stars: 2 } });
  });

  it('points at the first unsolved level, then at nothing once all are solved', () => {
    expect(nextUnsolved({})?.id).toBe(PUZZLE_LEVELS[0]!.id);
    const partial = recordResult({}, solved(PUZZLE_LEVELS[0]!.id, 0, 2));
    expect(nextUnsolved(partial)?.id).toBe(PUZZLE_LEVELS[1]!.id);
    const all = PUZZLE_LEVELS.reduce((progress, level) => recordResult(progress, solved(level.id, level.par, 2)), {});
    expect(nextUnsolved(all)).toBeUndefined();
  });
});
