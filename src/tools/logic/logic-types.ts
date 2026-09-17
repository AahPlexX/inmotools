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
  | 'SR_LATCH';

export type PortDirection = 'input' | 'output';

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
}

export interface ComponentParams {
  readonly inputCount?: number;
  readonly delayNs?: number;
  readonly activeHigh?: boolean;
  readonly edge?: 'rising' | 'falling';
  readonly frequencyHz?: number;
  readonly bounce?: boolean;
  readonly initialLevel?: 0 | 1;
}

export type Rotation = 0 | 90 | 180 | 270;

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

export type ThemeName = 'light' | 'dark' | 'high-contrast' | 'color-vision-safe';

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
}

export interface PendingUpdate {
  readonly dueTick: number;
  readonly componentId: string;
  readonly portId: string;
  readonly level: LogicLevel;
}

export type HazardType = 'floating_input' | 'output_contention' | 'undriven_net' | 'oscillation';

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
