export type RegexAutomatonStateKind = 'start' | 'accept' | 'state' | 'split';

export interface RegexAutomatonState {
  readonly id: string;
  readonly kind: RegexAutomatonStateKind;
  readonly label: string;
  readonly start: number;
  readonly end: number;
  readonly x: number;
  readonly y: number;
}

export interface RegexAutomatonTransition {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly kind: 'epsilon' | 'consume';
  readonly source?: string;
}

export interface RegexAutomatonModel {
  readonly supported: boolean;
  readonly note: string;
  readonly states: readonly RegexAutomatonState[];
  readonly transitions: readonly RegexAutomatonTransition[];
  readonly startId: string;
  readonly acceptId: string;
  readonly width: number;
  readonly height: number;
  readonly flags: string;
  readonly unsupported: readonly string[];
}

export interface RegexAutomatonFrame {
  readonly index: number;
  readonly inputIndex: number;
  readonly inputChar: string | null;
  readonly activeStateIds: readonly string[];
  readonly accepted: boolean;
  readonly description: string;
}

export interface RegexAutomatonSimulation {
  readonly nativeEngineTrace: false;
  readonly note: string;
  readonly frames: readonly RegexAutomatonFrame[];
  readonly match: { readonly start: number; readonly end: number; readonly text: string } | null;
}

type AstNode =
  | { readonly kind: 'epsilon'; readonly start: number; readonly end: number }
  | { readonly kind: 'atom'; readonly source: string; readonly start: number; readonly end: number }
  | { readonly kind: 'concat'; readonly children: readonly AstNode[]; readonly start: number; readonly end: number }
  | { readonly kind: 'alt'; readonly options: readonly AstNode[]; readonly start: number; readonly end: number }
  | { readonly kind: 'repeat'; readonly mode: '*' | '+' | '?'; readonly child: AstNode; readonly start: number; readonly end: number };

interface MutableState { id: string; kind: RegexAutomatonStateKind; label: string; start: number; end: number; x: number; y: number }
interface MutableTransition { id: string; from: string; to: string; label: string; kind: 'epsilon' | 'consume'; source?: string }
interface Fragment { readonly start: string; readonly accept: string }

const truthNote = 'Thompson NFA educational simulation for the supported regular subset. It is not a native V8, PCRE2, Oniguruma, or Python backtracking trace.';

const unsupportedModel = (flags: string, issues: readonly string[]): RegexAutomatonModel => ({
  supported: false,
  note: truthNote,
  states: [],
  transitions: [],
  startId: '',
  acceptId: '',
  width: 520,
  height: 220,
  flags,
  unsupported: [...new Set(issues)],
});

const parseForAutomaton = (pattern: string): { node: AstNode | null; issues: readonly string[] } => {
  let index = 0;
  const issues: string[] = [];
  const issue = (message: string) => { if (!issues.includes(message)) issues.push(message); };
  const epsilon = (at: number): AstNode => ({ kind: 'epsilon', start: at, end: at });

  const parseExpression = (): AstNode => {
    const start = index;
    const options: AstNode[] = [parseConcatenation()];
    while (pattern[index] === '|') { index += 1; options.push(parseConcatenation()); }
    return options.length === 1 ? options[0]! : { kind: 'alt', options, start, end: index };
  };

  const parseConcatenation = (): AstNode => {
    const start = index;
    const children: AstNode[] = [];
    while (index < pattern.length && pattern[index] !== ')' && pattern[index] !== '|') children.push(parseRepeat());
    if (!children.length) return epsilon(start);
    return children.length === 1 ? children[0]! : { kind: 'concat', children, start, end: index };
  };

  const parseRepeat = (): AstNode => {
    const atom = parseAtom();
    const quantifier = pattern[index];
    if (quantifier === '{') {
      issue('Bounded quantifiers are not yet supported by the automaton visualizer.');
      while (index < pattern.length && pattern[index] !== '}') index += 1;
      if (pattern[index] === '}') index += 1;
      return atom;
    }
    if (quantifier !== '*' && quantifier !== '+' && quantifier !== '?') return atom;
    const start = atom.start;
    index += 1;
    if (pattern[index] === '?' || pattern[index] === '+') {
      issue('Lazy and possessive quantifiers are not represented by this language-level NFA simulation.');
      index += 1;
    }
    return { kind: 'repeat', mode: quantifier, child: atom, start, end: index };
  };

  const parseAtom = (): AstNode => {
    const start = index;
    const current = pattern[index];
    if (current === '(') {
      if (pattern.startsWith('(?:', index)) index += 3;
      else if (pattern.startsWith('(?=', index) || pattern.startsWith('(?!', index) || pattern.startsWith('(?<=', index) || pattern.startsWith('(?<!', index)) {
        issue('Lookaround assertions are unsupported by the Thompson NFA visualizer.');
        index = pattern.length;
        return epsilon(start);
      } else if (pattern.startsWith('(?', index)) {
        issue('Special group syntax is unsupported by the Thompson NFA visualizer.');
        index = pattern.length;
        return epsilon(start);
      } else index += 1;
      const child = parseExpression();
      if (pattern[index] !== ')') { issue('Unclosed group cannot be visualized.'); return child; }
      index += 1;
      return { ...child, start, end: index } as AstNode;
    }
    if (current === '[') {
      index += 1;
      let escaped = false;
      while (index < pattern.length) {
        const char = pattern[index++]!;
        if (!escaped && char === ']') break;
        escaped = !escaped && char === '\\';
        if (char !== '\\') escaped = false;
      }
      if (pattern[index - 1] !== ']') issue('Unclosed character class cannot be visualized.');
      return { kind: 'atom', source: pattern.slice(start, index), start, end: index };
    }
    if (current === '\\') {
      index += 1;
      const escaped = pattern[index];
      if (!escaped) { issue('Trailing escape cannot be visualized.'); return epsilon(start); }
      if (/[1-9]/.test(escaped) || escaped === 'k') issue('Backreferences are unsupported by the Thompson NFA visualizer.');
      index += 1;
      if ((escaped === 'p' || escaped === 'P') && pattern[index] === '{') {
        while (index < pattern.length && pattern[index] !== '}') index += 1;
        if (pattern[index] === '}') index += 1;
      }
      return { kind: 'atom', source: pattern.slice(start, index), start, end: index };
    }
    if (current === '^' || current === '$') {
      issue('Anchors are unsupported by the current automaton simulation.');
      index += 1;
      return epsilon(start);
    }
    if (current === '.') { index += 1; return { kind: 'atom', source: '.', start, end: index }; }
    if (current === '*' || current === '+' || current === '?' || current === '{' || current === '}') {
      issue(`Unexpected metacharacter ${JSON.stringify(current)} cannot be visualized.`);
      index += 1;
      return epsilon(start);
    }
    if (!current) return epsilon(start);
    const codePoint = pattern.codePointAt(index)!;
    const literal = String.fromCodePoint(codePoint);
    index += literal.length;
    return { kind: 'atom', source: literal.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), start, end: index };
  };

  const root = parseExpression();
  if (index < pattern.length) issue(`Unsupported syntax begins at source offset ${index}.`);
  return { node: root, issues };
};

const layoutAutomaton = (states: MutableState[], transitions: MutableTransition[], startId: string) => {
  const outgoing = new Map<string, MutableTransition[]>();
  for (const transition of transitions) {
    const list = outgoing.get(transition.from) ?? [];
    list.push(transition);
    outgoing.set(transition.from, list);
  }
  const ranks = new Map<string, number>([[startId, 0]]);
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift()!;
    const rank = ranks.get(current) ?? 0;
    for (const transition of outgoing.get(current) ?? []) {
      if (ranks.has(transition.to)) continue;
      ranks.set(transition.to, rank + 1);
      queue.push(transition.to);
    }
  }
  const byRank = new Map<number, MutableState[]>();
  for (const state of states) {
    const rank = ranks.get(state.id) ?? 0;
    const bucket = byRank.get(rank) ?? [];
    bucket.push(state);
    byRank.set(rank, bucket);
  }
  const maxRank = Math.max(0, ...byRank.keys());
  let maxRows = 1;
  for (const [rank, bucket] of byRank) {
    bucket.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
    maxRows = Math.max(maxRows, bucket.length);
    const span = (bucket.length - 1) * 86;
    bucket.forEach((state, row) => { state.x = 74 + rank * 138; state.y = 82 + row * 86 - span / 2 + (maxRows - 1) * 43; });
  }
  return { width: Math.max(520, 150 + maxRank * 138), height: Math.max(230, 130 + (maxRows - 1) * 86) };
};

export const buildRegexAutomaton = (pattern: string, flags = ''): RegexAutomatonModel => {
  const unsupportedFlags = [...new Set([...flags].filter((flag) => !['g', 'i', 's', 'u'].includes(flag)))];
  const parsed = parseForAutomaton(pattern);
  const issues = [...parsed.issues, ...unsupportedFlags.map((flag) => `Flag ${flag} is unsupported by the automaton simulation.`)];
  if (!parsed.node || issues.length) return unsupportedModel(flags, issues.length ? issues : ['The pattern could not be represented.']);

  const states: MutableState[] = [];
  const transitions: MutableTransition[] = [];
  let stateIndex = 0;
  let transitionIndex = 0;
  const makeState = (kind: RegexAutomatonStateKind = 'state', label = 'State', start = 0, end = 0) => {
    const state: MutableState = { id: `s${stateIndex++}`, kind, label, start, end, x: 0, y: 0 };
    states.push(state);
    return state.id;
  };
  const connect = (from: string, to: string, kind: 'epsilon' | 'consume', label: string, source?: string) => {
    transitions.push({ id: `t${transitionIndex++}`, from, to, kind, label, ...(source ? { source } : {}) });
  };
  const compile = (node: AstNode): Fragment => {
    if (node.kind === 'atom') {
      const start = makeState('state', 'State', node.start, node.end);
      const accept = makeState('state', 'State', node.start, node.end);
      connect(start, accept, 'consume', node.source, node.source);
      return { start, accept };
    }
    if (node.kind === 'epsilon') {
      const start = makeState('state', 'State', node.start, node.end);
      const accept = makeState('state', 'State', node.start, node.end);
      connect(start, accept, 'epsilon', 'ε');
      return { start, accept };
    }
    if (node.kind === 'concat') {
      const parts = node.children.map(compile);
      for (let i = 0; i < parts.length - 1; i += 1) connect(parts[i]!.accept, parts[i + 1]!.start, 'epsilon', 'ε');
      return { start: parts[0]!.start, accept: parts.at(-1)!.accept };
    }
    if (node.kind === 'alt') {
      const start = makeState('split', 'Split', node.start, node.end);
      const accept = makeState('state', 'State', node.start, node.end);
      for (const option of node.options) {
        const fragment = compile(option);
        connect(start, fragment.start, 'epsilon', 'ε');
        connect(fragment.accept, accept, 'epsilon', 'ε');
      }
      return { start, accept };
    }
    const child = compile(node.child);
    if (node.mode === '*') {
      const start = makeState('split', 'Split', node.start, node.end);
      const accept = makeState('state', 'State', node.start, node.end);
      connect(start, child.start, 'epsilon', 'ε');
      connect(start, accept, 'epsilon', 'ε');
      connect(child.accept, start, 'epsilon', 'ε');
      return { start, accept };
    }
    if (node.mode === '+') {
      const split = makeState('split', 'Repeat', node.start, node.end);
      const accept = makeState('state', 'State', node.start, node.end);
      connect(child.accept, split, 'epsilon', 'ε');
      connect(split, child.start, 'epsilon', 'ε');
      connect(split, accept, 'epsilon', 'ε');
      return { start: child.start, accept };
    }
    const start = makeState('split', 'Optional', node.start, node.end);
    const accept = makeState('state', 'State', node.start, node.end);
    connect(start, child.start, 'epsilon', 'ε');
    connect(start, accept, 'epsilon', 'ε');
    connect(child.accept, accept, 'epsilon', 'ε');
    return { start, accept };
  };

  const fragment = compile(parsed.node);
  const startState = states.find((state) => state.id === fragment.start)!;
  const acceptState = states.find((state) => state.id === fragment.accept)!;
  startState.kind = 'start'; startState.label = 'Start';
  acceptState.kind = 'accept'; acceptState.label = 'Accept';
  const geometry = layoutAutomaton(states, transitions, fragment.start);
  return { supported: true, note: truthNote, states, transitions, startId: fragment.start, acceptId: fragment.accept, flags, unsupported: [], ...geometry };
};

const epsilonClosure = (model: RegexAutomatonModel, seed: readonly string[]) => {
  const active = new Set(seed);
  const stack = [...seed];
  while (stack.length) {
    const current = stack.pop()!;
    for (const transition of model.transitions) {
      if (transition.from !== current || transition.kind !== 'epsilon' || active.has(transition.to)) continue;
      active.add(transition.to); stack.push(transition.to);
    }
  }
  return active;
};

const transitionMatches = (transition: RegexAutomatonTransition, char: string, flags: string) => {
  if (transition.kind !== 'consume' || !transition.source) return false;
  const matcherFlags = [...new Set([...flags].filter((flag) => ['i', 's', 'u'].includes(flag)))].join('');
  try { return new RegExp(`^(?:${transition.source})$`, matcherFlags).test(char); } catch { return false; }
};

export const simulateRegexAutomaton = (model: RegexAutomatonModel, subject: string): RegexAutomatonSimulation => {
  if (!model.supported) return { nativeEngineTrace: false, note: model.note, frames: [], match: null };
  let fallback: RegexAutomatonFrame[] = [];
  for (let start = 0; start <= subject.length; start += 1) {
    let active = epsilonClosure(model, [model.startId]);
    const frames: RegexAutomatonFrame[] = [{ index: 0, inputIndex: start, inputChar: null, activeStateIds: [...active], accepted: active.has(model.acceptId), description: `Start NFA search at subject offset ${start}.` }];
    if (active.has(model.acceptId)) return { nativeEngineTrace: false, note: model.note, frames, match: { start, end: start, text: '' } };
    for (let inputIndex = start; inputIndex < subject.length; inputIndex += 1) {
      const char = subject[inputIndex]!;
      const next = new Set<string>();
      for (const stateId of active) {
        for (const transition of model.transitions) if (transition.from === stateId && transitionMatches(transition, char, model.flags)) next.add(transition.to);
      }
      active = epsilonClosure(model, [...next]);
      const accepted = active.has(model.acceptId);
      frames.push({ index: frames.length, inputIndex: inputIndex + 1, inputChar: char, activeStateIds: [...active], accepted, description: `Read ${JSON.stringify(char)} at ${inputIndex}; ${active.size} NFA state${active.size === 1 ? '' : 's'} active${accepted ? ' — accept reached' : ''}.` });
      if (accepted) return { nativeEngineTrace: false, note: model.note, frames, match: { start, end: inputIndex + 1, text: subject.slice(start, inputIndex + 1) } };
      if (!active.size) break;
    }
    if (start === 0) fallback = frames;
  }
  return { nativeEngineTrace: false, note: model.note, frames: fallback, match: null };
};
