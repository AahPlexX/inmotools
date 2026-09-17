import { getComponentPorts, isSequential } from './component-library';
import {
  portKey,
  type ComponentInstance,
  type ComponentRuntimeState,
  type Hazard,
  type LogicDocument,
  type LogicLevel,
  type PendingUpdate,
  type PortDefinition,
  type PortKey,
  type SimulationFrame,
  type Wire,
} from './logic-types';

/**
 * One discrete propagation tick is a fixed abstraction, not a literal
 * nanosecond of wall-clock time. A configured gate delay of `delayNs`
 * nanoseconds is modeled as `max(1, round(delayNs / DELAY_SCALE_NS))`
 * ticks so relative races, skew, and glitches between differently
 * configured gates stay proportionally correct while remaining fast
 * enough to observe interactively.
 */
const DELAY_SCALE_NS = 100;
const MAX_SETTLE_ITERATIONS_PER_COMPONENT = 64;

const toBit = (level: LogicLevel): 0 | 1 | undefined => (level === 0 || level === 1 ? level : undefined);

const delayTicksFor = (delayNs: number | undefined): number => Math.max(1, Math.round((delayNs ?? 0) / DELAY_SCALE_NS));

export interface NetIndex {
  readonly find: (key: PortKey) => PortKey;
  readonly members: ReadonlyMap<PortKey, readonly PortKey[]>;
  readonly directionOf: ReadonlyMap<PortKey, 'input' | 'output'>;
}

const buildComponentPortMap = (components: readonly ComponentInstance[]): Map<string, readonly PortDefinition[]> => {
  const map = new Map<string, readonly PortDefinition[]>();
  for (const component of components) map.set(component.id, getComponentPorts(component.type, component.params));
  return map;
};

export const buildNetIndex = (components: readonly ComponentInstance[], wires: readonly Wire[]): NetIndex => {
  const parent = new Map<PortKey, PortKey>();
  const directionOf = new Map<PortKey, 'input' | 'output'>();
  const portMap = buildComponentPortMap(components);

  const find = (key: PortKey): PortKey => {
    let root = key;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    let cursor = key;
    while (parent.has(cursor) && parent.get(cursor) !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  const union = (a: PortKey, b: PortKey): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  for (const component of components) {
    const ports = portMap.get(component.id) ?? [];
    for (const port of ports) {
      const key = portKey(component.id, port.id);
      parent.set(key, key);
      directionOf.set(key, port.direction);
    }
  }

  for (const wire of wires) {
    const fromKey = portKey(wire.from.componentId, wire.from.portId);
    const toKey = portKey(wire.to.componentId, wire.to.portId);
    if (!parent.has(fromKey) || !parent.has(toKey)) continue;
    union(fromKey, toKey);
  }

  const members = new Map<PortKey, PortKey[]>();
  for (const key of parent.keys()) {
    const root = find(key);
    const bucket = members.get(root);
    if (bucket) bucket.push(key);
    else members.set(root, [key]);
  }

  return { find, members, directionOf };
};

const resolveNet = (
  memberKeys: readonly PortKey[],
  directionOf: ReadonlyMap<PortKey, 'input' | 'output'>,
  levels: ReadonlyMap<PortKey, LogicLevel>,
): LogicLevel => {
  const driverLevels: LogicLevel[] = [];
  for (const key of memberKeys) {
    if (directionOf.get(key) !== 'output') continue;
    const level = levels.get(key) ?? 'Z';
    if (level !== 'Z') driverLevels.push(level);
  }
  if (driverLevels.length === 0) return 'Z';
  const distinctBits = new Set(driverLevels.map((level) => (level === 'X' ? 'X' : String(level))));
  if (distinctBits.size > 1) return 'X';
  return driverLevels[0]!;
};

const evaluateGateOutput = (type: ComponentInstance['type'], inputs: readonly LogicLevel[]): LogicLevel => {
  const bits = inputs.map(toBit);
  const hasUnknown = bits.some((bit) => bit === undefined);
  switch (type) {
    case 'AND':
      if (bits.some((bit) => bit === 0)) return 0;
      return hasUnknown ? 'X' : 1;
    case 'NAND':
      if (bits.some((bit) => bit === 0)) return 1;
      return hasUnknown ? 'X' : 0;
    case 'OR':
      if (bits.some((bit) => bit === 1)) return 1;
      return hasUnknown ? 'X' : 0;
    case 'NOR':
      if (bits.some((bit) => bit === 1)) return 0;
      return hasUnknown ? 'X' : 1;
    case 'XOR':
      if (hasUnknown) return 'X';
      return (bits.filter((bit) => bit === 1).length % 2 === 1 ? 1 : 0);
    case 'XNOR':
      if (hasUnknown) return 'X';
      return (bits.filter((bit) => bit === 1).length % 2 === 1 ? 0 : 1);
    case 'NOT':
      if (hasUnknown) return 'X';
      return bits[0] === 1 ? 0 : 1;
    case 'BUFFER':
      return hasUnknown ? 'X' : (bits[0] as 0 | 1);
    default:
      return 'X';
  }
};

const evaluateTriBuffer = (inputLevel: LogicLevel, enableLevel: LogicLevel): LogicLevel => {
  const enableBit = toBit(enableLevel);
  if (enableBit === 0) return 'Z';
  if (enableBit !== 1) return 'X';
  const inputBit = toBit(inputLevel);
  return inputBit === undefined ? 'X' : inputBit;
};

const isRisingEdge = (previous: LogicLevel | undefined, current: LogicLevel): boolean =>
  toBit(current) === 1 && toBit(previous ?? 0) === 0;

const isFallingEdge = (previous: LogicLevel | undefined, current: LogicLevel): boolean =>
  toBit(current) === 0 && toBit(previous ?? 1) === 1;

export interface StepInput {
  readonly document: LogicDocument;
  readonly previous: SimulationFrame;
  /** Wall-clock milliseconds elapsed since the previous step, driving CLOCK components. */
  readonly elapsedMs: number;
  /** componentId -> forced output level, applied to SWITCH/PUSH_BUTTON sources this tick. */
  readonly interactions?: Readonly<Record<string, LogicLevel>>;
}

export const createInitialFrame = (document: LogicDocument): SimulationFrame => {
  const levels: Record<PortKey, LogicLevel> = {};
  const state: Record<string, ComponentRuntimeState> = {};
  for (const component of document.components) {
    for (const port of getComponentPorts(component.type, component.params)) {
      levels[portKey(component.id, port.id)] = 'Z';
    }
    if (component.type === 'SWITCH' || component.type === 'PUSH_BUTTON') {
      state[component.id] = { switchLevel: component.params.initialLevel ?? 0 };
    }
  }
  return { tick: 0, portLevels: levels, componentState: state, pendingUpdates: [], hazards: [] };
};

export const step = ({ document, previous, elapsedMs, interactions = {} }: StepInput): SimulationFrame => {
  const tick = previous.tick + 1;
  const net = buildNetIndex(document.components, document.wires);
  const portMap = buildComponentPortMap(document.components);

  const levels = new Map<PortKey, LogicLevel>(Object.entries(previous.portLevels) as [PortKey, LogicLevel][]);
  const nextState: Record<string, ComponentRuntimeState> = { ...previous.componentState };
  const stillPending: PendingUpdate[] = [];
  const dueThisTick: PendingUpdate[] = [];
  for (const update of previous.pendingUpdates) {
    if (update.dueTick <= tick) dueThisTick.push(update);
    else stillPending.push(update);
  }
  for (const update of dueThisTick) levels.set(portKey(update.componentId, update.portId), update.level);

  // --- Source components: switches, push buttons, and clock generators drive their own net directly. ---
  for (const component of document.components) {
    const outKey = portKey(component.id, 'Y');
    if (component.type === 'SWITCH') {
      const forced = interactions[component.id];
      const current = nextState[component.id]?.switchLevel ?? component.params.initialLevel ?? 0;
      const level = forced ?? current;
      nextState[component.id] = { ...nextState[component.id], switchLevel: level };
      levels.set(outKey, level);
    } else if (component.type === 'PUSH_BUTTON') {
      const forced = interactions[component.id];
      const state = nextState[component.id] ?? {};
      const previousPressed = state.buttonPressed ?? false;
      const pressed = forced !== undefined ? toBit(forced) === 1 : previousPressed;
      let bounceRemaining = state.bounceRemaining ?? 0;
      if (component.params.bounce && pressed !== previousPressed) bounceRemaining = 5;
      let outputLevel: 0 | 1 = pressed ? 1 : 0;
      if (bounceRemaining > 0) {
        outputLevel = bounceRemaining % 2 === 0 ? (pressed ? 1 : 0) : (pressed ? 0 : 1);
        bounceRemaining -= 1;
      }
      nextState[component.id] = { ...state, buttonPressed: pressed, bounceRemaining };
      levels.set(outKey, outputLevel);
    } else if (component.type === 'CLOCK') {
      const frequencyHz = Math.max(0.01, component.params.frequencyHz ?? 1);
      const halfPeriodMs = 500 / frequencyHz;
      const state = nextState[component.id] ?? {};
      const previousLevel = toBit(levels.get(outKey) ?? 0) ?? 0;
      const accumulatedMs = (state.clockNextToggleTick ?? 0) + elapsedMs;
      if (accumulatedMs >= halfPeriodMs) {
        const toggled: 0 | 1 = previousLevel === 1 ? 0 : 1;
        levels.set(outKey, toggled);
        nextState[component.id] = { ...state, clockNextToggleTick: 0 };
      } else {
        levels.set(outKey, previousLevel);
        nextState[component.id] = { ...state, clockNextToggleTick: accumulatedMs };
      }
    }
  }

  const delayMode = document.simulation.delayMode;
  const oscillatingNets = new Set<PortKey>();

  const resolveAllNets = (): Map<PortKey, LogicLevel> => {
    const resolved = new Map<PortKey, LogicLevel>();
    for (const [root, memberKeys] of net.members) {
      const value = resolveNet(memberKeys, net.directionOf, levels);
      for (const key of memberKeys) resolved.set(key, value);
      resolved.set(root, value);
    }
    return resolved;
  };

  const applyCombinationalPass = (schedule: boolean): boolean => {
    const resolvedNets = resolveAllNets();
    let changed = false;
    for (const component of document.components) {
      const ports = portMap.get(component.id) ?? [];
      const inputPorts = ports.filter((port) => port.direction === 'input');
      const readInput = (portId: string): LogicLevel => resolvedNets.get(net.find(portKey(component.id, portId))) ?? 'Z';

      let nextOutput: LogicLevel | undefined;
      if (component.type === 'TRI_BUFFER') {
        nextOutput = evaluateTriBuffer(readInput('A'), readInput('EN'));
      } else if (
        component.type === 'AND' || component.type === 'OR' || component.type === 'NAND' ||
        component.type === 'NOR' || component.type === 'XOR' || component.type === 'XNOR' ||
        component.type === 'NOT' || component.type === 'BUFFER'
      ) {
        const inputLevels = inputPorts.map((port) => readInput(port.id));
        nextOutput = evaluateGateOutput(component.type, inputLevels);
      }
      if (nextOutput === undefined) continue;

      const outKey = portKey(component.id, 'Y');
      const currentOutput = levels.get(outKey) ?? 'Z';
      if (currentOutput === nextOutput) continue;
      changed = true;
      if (schedule) {
        stillPending.push({ dueTick: tick + delayTicksFor(component.params.delayNs), componentId: component.id, portId: 'Y', level: nextOutput });
      } else {
        levels.set(outKey, nextOutput);
      }
    }
    return changed;
  };

  if (delayMode === 'ideal') {
    let iterations = 0;
    const bound = document.components.length * MAX_SETTLE_ITERATIONS_PER_COMPONENT + 8;
    while (applyCombinationalPass(false)) {
      iterations += 1;
      if (iterations > bound) {
        for (const [root] of net.members) oscillatingNets.add(root);
        break;
      }
    }
  } else {
    applyCombinationalPass(true);
  }

  const finalNets = resolveAllNets();
  for (const [key, value] of finalNets) levels.set(key, value);

  // --- Sequential elements: edge-triggered flip-flops and the level-sensitive SR latch. ---
  for (const component of document.components) {
    if (!isSequential(component.type)) continue;
    const readInput = (portId: string): LogicLevel => finalNets.get(net.find(portKey(component.id, portId))) ?? 'Z';
    const state = nextState[component.id] ?? {};
    const previousQ = state.storedLevel ?? 0;
    const setAsserted = toBit(readInput('SET')) === 1;
    const resetAsserted = toBit(readInput('RST')) === 1;

    let nextQ: LogicLevel = previousQ;
    if (component.type === 'SR_LATCH') {
      const s = toBit(readInput('S'));
      const r = toBit(readInput('R'));
      if (s === 1 && r === 1) nextQ = 'X';
      else if (s === 1) nextQ = 1;
      else if (r === 1) nextQ = 0;
      else nextQ = previousQ;
    } else {
      const clockLevel = readInput('CLK');
      const edge = component.params.edge === 'falling' ? isFallingEdge(state.lastClockLevel, clockLevel) : isRisingEdge(state.lastClockLevel, clockLevel);
      if (edge) {
        if (component.type === 'D_FLIP_FLOP') nextQ = readInput('D');
        else if (component.type === 'T_FLIP_FLOP') {
          const t = toBit(readInput('T'));
          nextQ = t === 1 ? (toBit(previousQ) === 1 ? 0 : 1) : previousQ;
        } else if (component.type === 'JK_FLIP_FLOP') {
          const j = toBit(readInput('J'));
          const k = toBit(readInput('K'));
          const q = toBit(previousQ) ?? 0;
          if (j === 1 && k === 1) nextQ = q === 1 ? 0 : 1;
          else if (j === 1) nextQ = 1;
          else if (k === 1) nextQ = 0;
          else nextQ = previousQ;
        }
      }
      if (setAsserted) nextQ = 1;
      else if (resetAsserted) nextQ = 0;
      nextState[component.id] = { ...state, lastClockLevel: clockLevel, storedLevel: nextQ };
      levels.set(portKey(component.id, 'Q'), nextQ);
      levels.set(portKey(component.id, 'QN'), nextQ === 'X' ? 'X' : (toBit(nextQ) === 1 ? 0 : 1));
      continue;
    }
    if (setAsserted) nextQ = 1;
    else if (resetAsserted) nextQ = 0;
    nextState[component.id] = { ...state, storedLevel: nextQ };
    levels.set(portKey(component.id, 'Q'), nextQ);
    levels.set(portKey(component.id, 'QN'), nextQ === 'X' ? 'X' : (toBit(nextQ) === 1 ? 0 : 1));
  }

  const hazards: Hazard[] = [];
  for (const root of oscillatingNets) {
    hazards.push({ type: 'oscillation', netKey: root, message: 'This net could not settle to a stable level within the ideal zero-delay model. Switch to realistic propagation delay to observe it as an oscillator.' });
  }

  const finalLevels: Record<PortKey, LogicLevel> = {};
  for (const [key, value] of levels) finalLevels[key] = value;

  return { tick, portLevels: finalLevels, componentState: nextState, pendingUpdates: stillPending, hazards };
};

export const readLevel = (frame: SimulationFrame, componentId: string, portId: string): LogicLevel =>
  frame.portLevels[portKey(componentId, portId)] ?? 'Z';

/**
 * Carries simulation state (switch positions, flip-flop bits, pending delayed
 * updates) forward across a document edit instead of resetting the whole
 * circuit, so editing an unrelated component never blanks live switch state.
 */
export const migrateFrame = (previous: SimulationFrame, document: LogicDocument): SimulationFrame => {
  const fresh = createInitialFrame(document);
  const portLevels: Record<PortKey, LogicLevel> = { ...fresh.portLevels };
  for (const key of Object.keys(portLevels)) {
    const carried = previous.portLevels[key];
    if (carried !== undefined) portLevels[key] = carried;
  }
  const componentState: Record<string, ComponentRuntimeState> = {};
  for (const component of document.components) {
    componentState[component.id] = previous.componentState[component.id] ?? fresh.componentState[component.id] ?? {};
  }
  const liveIds = new Set(document.components.map((component) => component.id));
  const pendingUpdates = previous.pendingUpdates.filter((update) => liveIds.has(update.componentId));
  return { tick: previous.tick, portLevels, componentState, pendingUpdates, hazards: [] };
};
