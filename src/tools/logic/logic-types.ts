export type LogicLevel = 0 | 1 | 'Z' | 'X';

export type ComponentType =
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'NAND'
  | 'NOR'
  | 'XOR'
  | 'XNOR'
  | 'BUFFER'
  | 'TRI_BUFFER'
  | 'SWITCH'
  | 'PUSH_BUTTON'
  | 'CLOCK'
  | 'LED'
  | 'PROBE'
  | 'D_FLIP_FLOP'
  | 'JK_FLIP_FLOP'
  | 'T_FLIP_FLOP'
  | 'SR_LATCH'
  | 'MUX'
  | 'DEMUX'
  | 'DECODER'
  | 'PRIORITY_ENCODER'
  | 'BCD_7SEG'
  | 'COUNTER'
  | 'REGISTER'
  | 'SEVEN_SEGMENT'
  | 'SEVEN_SEGMENT_4'
  | 'SIXTEEN_SEGMENT'
  | 'BUS_SPLITTER'
  | 'ALU'
  | 'RAM'
  | 'ROM'
  | 'RGB_MATRIX'
  | 'SUBCIRCUIT'
  | 'PORT_IN'
  | 'PORT_OUT'
  | 'NET_TIE';

/**
 * `passive` pins neither drive nor load a net: a bus splitter's pins are passive because the same part
 * splits a bus into single pins or gathers pins into a bus depending on which side is driven.
 */
export type PortDirection = 'input' | 'output' | 'passive';

export interface PortRef {
  readonly componentId: string;
  readonly portId: string;
}

export interface PortDefinition {
  readonly id: string;
  readonly direction: PortDirection;
  readonly label: string;
  /** Local offset from the component origin, in grid units. */
  readonly x: number;
  readonly y: number;
  /**
   * Present on a bus port: a wireable pin that stands for several single pins at once. `bits` names those
   * single pins, least significant first. A bus port is never simulated itself; the netlist joins its bits.
   */
  readonly bus?: { readonly bits: readonly string[] };
  /** A single pin that still exists for the simulator but is not drawn or wired directly (it is reached through a bus port). */
  readonly hidden?: boolean;
  /** The id of a pin on the same part this pin is permanently joined to, as on a bus splitter. */
  readonly alias?: string;
}

export interface ComponentParams {
  readonly inputCount?: number;
  readonly delayNs?: number;
  readonly activeHigh?: boolean;
  readonly edge?: 'rising' | 'falling';
  readonly frequencyHz?: number;
  readonly bounce?: boolean;
  readonly initialLevel?: 0 | 1;
  /** Address/select width of a multiplexer, demultiplexer, decoder, or priority encoder (2^n data lines). */
  readonly selectBits?: number;
  /** Whether a MUX/DEMUX/DECODER exposes an EN input pin. */
  readonly hasEnable?: boolean;
  /** Bit width of a counter or register (2-8). */
  readonly bitWidth?: number;
  /** A counter counts down instead of up. */
  readonly countDown?: boolean;
  /** A counter is an asynchronous (ripple) chain whose bits change one tick apart, instead of all at once. */
  readonly asyncRipple?: boolean;
  /** A counter exposes a LOAD pin and parallel data inputs for synchronous load. */
  readonly hasLoad?: boolean;
  /** A multiplexed display's digit-select pins are asserted high (true, the default) or low. */
  readonly digitActiveHigh?: boolean;
  /** Width of a bus splitter's bus (2-16 bits). */
  readonly busWidth?: number;
  /** A register or counter exposes its data pins as single bus ports (D and Q) instead of one pin per bit. */
  readonly busPins?: boolean;
  /** Operand width of an ALU: 4, 8, or 16 bits. */
  readonly aluWidth?: number;
  /** Address width of a RAM or ROM (4-32 bits). */
  readonly addressBits?: number;
  /** Word width of a RAM or ROM: 4, 8, 16, or 32 bits. */
  readonly dataBits?: number;
  /** Stored words of a RAM or ROM, keyed by address (sparse: words equal to `memoryFill` are omitted). */
  readonly memoryCells?: Readonly<Record<string, number>>;
  /** The value of every address that is not in `memoryCells`. */
  readonly memoryFill?: number;
  /** Side length of an RGB pixel matrix: 8 or 16. */
  readonly matrixSize?: number;
  /** The circuit inside a SUBCIRCUIT, stored by value so a project file is self-contained. */
  readonly subcircuit?: SubcircuitDefinition;
  /** Width of a subcircuit port marker (1 for a single signal, 2-32 for a bus). */
  readonly signalWidth?: number;
  /** The constant an input port marker drives when it is a bus and is not inside a subcircuit. */
  readonly portValue?: number;
}

export type Rotation = 0 | 90 | 180 | 270;

/**
 * A subcircuit: a named circuit with its own components and wires, used as one part elsewhere. Its
 * connections to the outside are the port markers (`PORT_IN`, `PORT_OUT`) among its components.
 */
export interface SubcircuitDefinition {
  readonly name: string;
  /** A short glyph drawn on the part's body (a few characters). */
  readonly icon: string;
  readonly components: readonly ComponentInstance[];
  readonly wires: readonly Wire[];
  /** Where the person was looking last time they opened it, and what they had selected. */
  readonly viewport?: ViewportState;
  readonly selectedIds?: readonly string[];
}

export interface ComponentInstance {
  readonly id: string;
  readonly type: ComponentType;
  readonly x: number;
  readonly y: number;
  readonly rotation: Rotation;
  readonly mirrored: boolean;
  readonly label: string;
  readonly params: ComponentParams;
}

export interface WirePoint {
  readonly x: number;
  readonly y: number;
}

export interface Wire {
  readonly id: string;
  readonly from: PortRef;
  readonly to: PortRef;
  readonly waypoints: readonly WirePoint[];
}

export type LicenseOption = 'MIT' | 'CERN-OHL-P-2.0' | 'CC-BY-4.0' | 'CC-BY-SA-4.0' | 'Unlicensed';

export interface ProjectMetadata {
  readonly title: string;
  readonly author: string;
  readonly description: string;
  readonly version: string;
  readonly license: LicenseOption;
  readonly tags: readonly string[];
}

export type DelayMode = 'ideal' | 'realistic';

export interface SimulationSettings {
  readonly delayMode: DelayMode;
  readonly running: boolean;
  readonly clockDividerHz: number;
}

export interface ViewportState {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
}

export type ThemeName = 'light' | 'dark' | 'high-contrast' | 'color-vision-safe' | 'junior-explorer';

export interface LogicDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly metadata: ProjectMetadata;
  readonly components: readonly ComponentInstance[];
  readonly wires: readonly Wire[];
  readonly viewport: ViewportState;
  readonly simulation: SimulationSettings;
  readonly theme: ThemeName;
  readonly selectedIds: readonly string[];
  readonly updatedAt: string;
}

export interface DocumentSnapshot {
  readonly label: string;
  readonly document: LogicDocument;
}

export interface DocumentHistory {
  readonly past: readonly DocumentSnapshot[];
  readonly present: LogicDocument;
  readonly future: readonly DocumentSnapshot[];
}

export interface ComponentRuntimeState {
  readonly storedLevel?: LogicLevel;
  readonly lastClockLevel?: LogicLevel;
  readonly switchLevel?: LogicLevel;
  readonly buttonPressed?: boolean;
  readonly clockNextToggleTick?: number;
  readonly bounceRemaining?: number;
  /** Counter/register bits, least-significant first. */
  readonly registerBits?: readonly LogicLevel[];
  /** What a counter's outputs showed before its latest clock edge; used while a ripple is in flight. */
  readonly registerPreviousBits?: readonly LogicLevel[];
  /** How many low-order counter bits have taken their new value. */
  readonly rippleStage?: number;
  /** Which segments of a display are lit, digit-major (1 = lit). */
  readonly segmentLit?: readonly LogicLevel[];
  /** Words a running RAM has written, keyed by address; laid over its stored contents. */
  readonly memoryWrites?: Readonly<Record<string, number>>;
  /** Why a RAM's latest clock edge did not write, while that is still the case. */
  readonly memoryFault?: string;
  /** Each pixel of an RGB matrix as a color mask (1 red, 2 green, 4 blue; 0 unlit), row-major. */
  readonly matrixPixels?: readonly number[];
}

export interface PendingUpdate {
  readonly dueTick: number;
  readonly componentId: string;
  readonly portId: string;
  readonly level: LogicLevel;
}

export type HazardType = 'floating_input' | 'output_contention' | 'undriven_net' | 'oscillation' | 'memory_write_skipped';

export interface Hazard {
  readonly type: HazardType;
  readonly netKey: string;
  readonly message: string;
}

/** Key format: `${componentId}:${portId}` */
export type PortKey = string;

export interface SimulationFrame {
  readonly tick: number;
  readonly portLevels: Readonly<Record<PortKey, LogicLevel>>;
  readonly componentState: Readonly<Record<string, ComponentRuntimeState>>;
  readonly pendingUpdates: readonly PendingUpdate[];
  readonly hazards: readonly Hazard[];
}

export const portKey = (componentId: string, portId: string): PortKey => `${componentId}:${portId}`;
