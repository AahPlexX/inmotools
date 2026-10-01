import { checkTruthTableAvailability, generateTruthTable } from './analysis-engine';
import { addComponent, createInitialDocument, relabelComponent } from './circuit-model';
import type { ComponentType, LogicDocument, LogicLevel } from './logic-types';

/**
 * Pure, framework-independent model of the logic-puzzle challenges: the
 * built-in level set, a starter circuit for each level, and the verifier that
 * decides whether a player's circuit solves one.
 *
 * A level fixes its inputs and outputs by label (switches and LEDs the player
 * wires between) and states the truth table the circuit must produce. The
 * verifier reads the player's circuit through the same truth-table generator
 * the rest of the workstation uses, so a passing circuit really behaves as
 * required in the simulator, not merely on paper.
 */

export type Bit = 0 | 1;

export interface PuzzleLevel {
  readonly id: string;
  readonly title: string;
  /** What to build, in one or two sentences. */
  readonly goal: string;
  readonly hint: string;
  /** Labels of the switches the level provides; bit `i` of a row's mask is `inputs[i]`. */
  readonly inputs: readonly string[];
  /** Labels of the LEDs the level provides. */
  readonly outputs: readonly string[];
  /** The bits every output must show for the input combination `mask`. */
  readonly expected: (mask: number) => readonly Bit[];
  /** Component types the player may use besides the level's own switches and LEDs. */
  readonly allowedParts: readonly ComponentType[];
  /** The gate count of the reference solution, or `null` when the level needs no gates at all. */
  readonly par: number;
}

const BASIC_GATES: readonly ComponentType[] = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR', 'BUFFER'];

const bit = (mask: number, index: number): Bit => ((mask >> index) & 1) as Bit;

export const PUZZLE_LEVELS: readonly PuzzleLevel[] = [
  {
    id: 'light-the-bulb',
    title: 'Light the bulb',
    goal: 'Make the bulb glow exactly when the switch A is on. No gates are needed.',
    hint: 'Click the switch’s output pin, then the bulb’s input pin, to draw a wire.',
    inputs: ['A'],
    outputs: ['Bulb'],
    expected: (mask) => [bit(mask, 0)],
    allowedParts: [],
    par: 0,
  },
  {
    id: 'flip-it',
    title: 'Flip it',
    goal: 'Make the bulb glow exactly when the switch A is off.',
    hint: 'A NOT gate turns a 0 into a 1 and a 1 into a 0.',
    inputs: ['A'],
    outputs: ['Bulb'],
    expected: (mask) => [1 - bit(mask, 0) as Bit],
    allowedParts: BASIC_GATES,
    par: 1,
  },
  {
    id: 'both-on',
    title: 'Both must be on',
    goal: 'Light the bulb only when A and B are both on.',
    hint: 'An AND gate outputs 1 only when every input is 1.',
    inputs: ['A', 'B'],
    outputs: ['Bulb'],
    expected: (mask) => [(bit(mask, 0) & bit(mask, 1)) as Bit],
    allowedParts: BASIC_GATES,
    par: 1,
  },
  {
    id: 'either-will-do',
    title: 'Either will do',
    goal: 'Light the bulb when A or B (or both) are on.',
    hint: 'An OR gate outputs 1 when at least one input is 1.',
    inputs: ['A', 'B'],
    outputs: ['Bulb'],
    expected: (mask) => [(bit(mask, 0) | bit(mask, 1)) as Bit],
    allowedParts: BASIC_GATES,
    par: 1,
  },
  {
    id: 'exactly-one',
    title: 'Exactly one (no XOR)',
    goal: 'Light the bulb when exactly one of A and B is on, without using an XOR or XNOR gate.',
    hint: '“At least one” AND “not both”: an OR and a NAND, joined by an AND.',
    inputs: ['A', 'B'],
    outputs: ['Bulb'],
    expected: (mask) => [(bit(mask, 0) ^ bit(mask, 1)) as Bit],
    allowedParts: ['AND', 'OR', 'NOT', 'NAND', 'NOR'],
    par: 3,
  },
  {
    id: 'xor-from-nand',
    title: 'XOR from NAND only',
    goal: 'Build “exactly one of A and B” using nothing but NAND gates.',
    hint: 'NAND is universal. Feed A and B into one NAND, then feed that result back in with each of A and B.',
    inputs: ['A', 'B'],
    outputs: ['Bulb'],
    expected: (mask) => [(bit(mask, 0) ^ bit(mask, 1)) as Bit],
    allowedParts: ['NAND'],
    par: 4,
  },
  {
    id: 'majority-vote',
    title: 'Majority vote',
    goal: 'Light the bulb when at least two of A, B and C are on.',
    hint: 'Two of three is (A and B) or (C and (A or B)).',
    inputs: ['A', 'B', 'C'],
    outputs: ['Bulb'],
    expected: (mask) => [(bit(mask, 0) + bit(mask, 1) + bit(mask, 2) >= 2 ? 1 : 0) as Bit],
    allowedParts: ['AND', 'OR', 'NOT'],
    par: 4,
  },
  {
    id: 'half-adder',
    title: 'Half adder',
    goal: 'Add two one-bit numbers: SUM is their sum’s low bit and CARRY is 1 when both are 1.',
    hint: 'SUM is exactly-one (XOR); CARRY is both (AND).',
    inputs: ['A', 'B'],
    outputs: ['SUM', 'CARRY'],
    expected: (mask) => [(bit(mask, 0) ^ bit(mask, 1)) as Bit, (bit(mask, 0) & bit(mask, 1)) as Bit],
    allowedParts: BASIC_GATES,
    par: 2,
  },
  {
    id: 'full-adder',
    title: 'Full adder',
    goal: 'Add A, B and a carry-in CIN: SUM is the low bit of the total and COUT is 1 when the total is 2 or 3.',
    hint: 'Chain two half adders and OR their carries.',
    inputs: ['A', 'B', 'CIN'],
    outputs: ['SUM', 'COUT'],
    expected: (mask) => {
      const total = bit(mask, 0) + bit(mask, 1) + bit(mask, 2);
      return [(total & 1) as Bit, (total >> 1) as Bit];
    },
    allowedParts: BASIC_GATES,
    par: 5,
  },
  {
    id: 'select-one',
    title: 'Two-way switch',
    goal: 'Build a 2:1 multiplexer: the bulb shows B when S is on and A when S is off. The MUX block is not allowed.',
    hint: 'Y = (A and not S) or (B and S).',
    inputs: ['A', 'B', 'S'],
    outputs: ['Bulb'],
    expected: (mask) => [(bit(mask, 2) ? bit(mask, 1) : bit(mask, 0)) as Bit],
    allowedParts: ['AND', 'OR', 'NOT'],
    par: 4,
  },
  {
    id: 'greater-than',
    title: 'Which number is bigger?',
    goal: 'Compare two 2-bit numbers, A = A1A0 and B = B1B0: light the bulb when A is greater than B.',
    hint: 'A wins if its high bit beats B’s, or the high bits match and its low bit beats B’s.',
    inputs: ['A1', 'A0', 'B1', 'B0'],
    outputs: ['Bulb'],
    // Inputs are listed A1, A0, B1, B0 (mask bits 0-3), so A = 2*A1 + A0 and B = 2*B1 + B0.
    expected: (mask) => [((2 * bit(mask, 0) + bit(mask, 1)) > (2 * bit(mask, 2) + bit(mask, 3)) ? 1 : 0) as Bit],
    allowedParts: BASIC_GATES,
    par: 7,
  },
];

export const findLevel = (id: string): PuzzleLevel | undefined => PUZZLE_LEVELS.find((level) => level.id === id);

// --- SECTION: starter circuit ---

/**
 * A blank circuit with the level's switches on the left and LEDs on the right,
 * ready to be wired. Kept compact so the whole starter fits a phone-width
 * canvas without panning.
 */
export const buildStarterDocument = (level: PuzzleLevel): LogicDocument => {
  let doc = createInitialDocument(level.title);
  const place = (type: 'SWITCH' | 'LED', x: number, y: number, label: string): void => {
    doc = addComponent(doc, type, x, y);
    doc = relabelComponent(doc, doc.components[doc.components.length - 1]!.id, label);
  };
  level.inputs.forEach((label, index) => place('SWITCH', 1, 2 + index * 3, label));
  level.outputs.forEach((label, index) => place('LED', 13, 2 + index * 3, label));
  return doc;
};

// --- SECTION: verification ---

export interface PuzzleRow {
  readonly mask: number;
  readonly expected: readonly Bit[];
  readonly actual: readonly LogicLevel[];
  readonly ok: boolean;
}

export interface PuzzleEvaluation {
  readonly levelId: string;
  /** Problems that stop the circuit from being judged at all (missing or extra parts, a disallowed part). */
  readonly issues: readonly string[];
  /** Every input combination, expected against actual; empty when `issues` stopped the check. */
  readonly rows: readonly PuzzleRow[];
  readonly passed: boolean;
  /** Parts other than the level's own switches and LEDs. */
  readonly gateCount: number;
  /** 0 = not solved, 1 = solved, 2 = solved with no more parts than the reference solution. */
  readonly stars: 0 | 1 | 2;
}

const isSource = (type: ComponentType): boolean => type === 'SWITCH' || type === 'PUSH_BUTTON';
const isSink = (type: ComponentType): boolean => type === 'LED' || type === 'PROBE';

/**
 * Judges a circuit against a level. The level's switches and LEDs are found by
 * label; anything else on the canvas counts as a part the player added.
 */
export const evaluatePuzzle = (document: LogicDocument, level: PuzzleLevel): PuzzleEvaluation => {
  const issues: string[] = [];
  const sources = document.components.filter((component) => isSource(component.type));
  const sinks = document.components.filter((component) => isSink(component.type));

  const resolve = (parts: typeof sources, labels: readonly string[], kind: string, plural: string) => {
    const found = new Map<string, string>();
    for (const label of labels) {
      const matches = parts.filter((part) => part.label === label);
      if (matches.length === 0) issues.push(`Missing ${kind} "${label}". Place one and label it ${label}, or restart the level.`);
      else if (matches.length > 1) issues.push(`There are ${matches.length} ${plural} labeled "${label}"; this level needs exactly one.`);
      else found.set(label, matches[0]!.id);
    }
    for (const part of parts) {
      if (!labels.includes(part.label)) issues.push(`Extra ${kind} "${part.label}": this level only uses ${labels.join(', ')}.`);
    }
    return found;
  };
  const inputIds = resolve(sources, level.inputs, 'switch', 'switches');
  const outputIds = resolve(sinks, level.outputs, 'LED', 'LEDs');

  const provided = new Set<ComponentType>(['SWITCH', 'PUSH_BUTTON', 'LED', 'PROBE']);
  const gates = document.components.filter((component) => !provided.has(component.type));
  const disallowed = [...new Set(gates.filter((component) => !level.allowedParts.includes(component.type)).map((component) => component.type))];
  for (const type of disallowed) {
    issues.push(level.allowedParts.length === 0 ? `${type} is not allowed in this level: it needs no parts at all, only wires.` : `${type} is not allowed in this level. You may use: ${level.allowedParts.join(', ')}.`);
  }

  const gateCount = gates.length;
  const availability = checkTruthTableAvailability(document);
  if (issues.length === 0 && !availability.ok) issues.push(availability.reason ?? 'This circuit cannot be checked.');

  if (issues.length > 0) return { levelId: level.id, issues, rows: [], passed: false, gateCount, stars: 0 };

  const table = generateTruthTable(document);
  // The generator walks switches in document order; translate each of its rows into the level's own bit order.
  const levelIndexOfTableInput = table.inputs.map((signal) => level.inputs.findIndex((label) => inputIds.get(label) === signal.componentId));
  const tableRowForMask = (mask: number): number => {
    let row = 0;
    levelIndexOfTableInput.forEach((levelIndex, tableIndex) => {
      if ((mask >> levelIndex) & 1) row |= 1 << tableIndex;
    });
    return row;
  };

  const rows: PuzzleRow[] = [];
  for (let mask = 0; mask < 1 << level.inputs.length; mask += 1) {
    const expected = level.expected(mask);
    const tableRow = table.rows[tableRowForMask(mask)]!;
    const actual = level.outputs.map((label) => tableRow.outputs[outputIds.get(label)!] ?? 'Z');
    rows.push({ mask, expected, actual, ok: actual.every((value, index) => value === expected[index]) });
  }
  const passed = rows.every((row) => row.ok);
  return { levelId: level.id, issues, rows, passed, gateCount, stars: passed ? (gateCount <= level.par ? 2 : 1) : 0 };
};

// --- SECTION: progress ---

export interface LevelProgress {
  readonly solved: boolean;
  /** The fewest parts any solving circuit has used. */
  readonly bestGateCount: number;
  readonly stars: 0 | 1 | 2;
}

export type PuzzleProgress = Readonly<Record<string, LevelProgress>>;

/** Records a solving attempt, keeping the best result seen for the level. */
export const recordResult = (progress: PuzzleProgress, evaluation: PuzzleEvaluation): PuzzleProgress => {
  if (!evaluation.passed) return progress;
  const previous = progress[evaluation.levelId];
  const bestGateCount = previous ? Math.min(previous.bestGateCount, evaluation.gateCount) : evaluation.gateCount;
  const stars = Math.max(previous?.stars ?? 0, evaluation.stars) as 0 | 1 | 2;
  return { ...progress, [evaluation.levelId]: { solved: true, bestGateCount, stars } };
};

export const serializeProgress = (progress: PuzzleProgress): string => JSON.stringify(progress);

/** Reads saved progress defensively: anything malformed, unknown, or out of range is dropped rather than trusted. */
export const parseProgress = (raw: string | null): PuzzleProgress => {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const progress: Record<string, LevelProgress> = {};
  for (const level of PUZZLE_LEVELS) {
    const entry = (parsed as Record<string, unknown>)[level.id];
    if (typeof entry !== 'object' || entry === null) continue;
    const { solved, bestGateCount, stars } = entry as Record<string, unknown>;
    if (solved !== true) continue;
    if (typeof bestGateCount !== 'number' || !Number.isInteger(bestGateCount) || bestGateCount < 0 || bestGateCount > 999) continue;
    if (stars !== 1 && stars !== 2) continue;
    progress[level.id] = { solved: true, bestGateCount, stars };
  }
  return progress;
};

/** The first level that is not yet solved, or `undefined` once every level is. */
export const nextUnsolved = (progress: PuzzleProgress): PuzzleLevel | undefined => PUZZLE_LEVELS.find((level) => !progress[level.id]?.solved);
