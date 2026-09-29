import { busLabel, clampSignalWidth } from './bus-engine';
import type { ComponentInstance, ComponentParams, ComponentType, PortDefinition, SubcircuitDefinition } from './logic-types';

/**
 * Pin layouts for the parts that make subcircuits work: the part that stands for a subcircuit (`SUBCIRCUIT`), the
 * port markers drawn inside one (`PORT_IN`, `PORT_OUT`), and the internal junction (`NET_TIE`) the simulator
 * swaps a marker for when it flattens a subcircuit into its parent.
 *
 * Kept apart from the flattening code so the component library can use it without importing the simulator.
 */

/** Body width, in grid units, of a part that stands for a subcircuit. */
export const SUBCIRCUIT_WIDTH_COLS = 6;

/** Body width of a port marker. */
export const MARKER_WIDTH_COLS = 2;

export const MAX_ICON_LENGTH = 4;
export const MAX_NAME_LENGTH = 40;

export const isPortMarker = (type: ComponentType): boolean => type === 'PORT_IN' || type === 'PORT_OUT';

export const markerWidthOf = (params: ComponentParams): number => clampSignalWidth(params.signalWidth);

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

/** The names of a bus's single bits on the internal junction, shared by the part that stands for a subcircuit. */
const bitIds = (prefix: string, width: number): string[] => range(width).map((index) => `${prefix}${index}`);

/**
 * An input port marker drives a signal into the circuit around it: one output pin `Y`, or a bus `Y`. Outside a
 * subcircuit it behaves like a toggle switch (single) or a constant (bus) so the circuit can be tried on its own.
 */
export const inputMarkerPorts = (params: ComponentParams): readonly PortDefinition[] => {
  const width = markerWidthOf(params);
  if (width === 1) return [{ id: 'Y', direction: 'output', label: 'Y', x: MARKER_WIDTH_COLS, y: 0 }];
  const bits = bitIds('Y', width);
  return [
    { id: 'Y', direction: 'output', label: busLabel('Y', width), x: MARKER_WIDTH_COLS, y: 0, bus: { bits } },
    ...bits.map((id): PortDefinition => ({ id, direction: 'output', label: id, x: MARKER_WIDTH_COLS, y: 0, hidden: true })),
  ];
};

/** An output port marker takes a signal out of the circuit: one input pin `A`, or a bus `A`. */
export const outputMarkerPorts = (params: ComponentParams): readonly PortDefinition[] => {
  const width = markerWidthOf(params);
  if (width === 1) return [{ id: 'A', direction: 'input', label: 'A', x: 0, y: 0 }];
  const bits = bitIds('A', width);
  return [
    { id: 'A', direction: 'input', label: busLabel('A', width), x: 0, y: 0, bus: { bits } },
    ...bits.map((id): PortDefinition => ({ id, direction: 'input', label: id, x: 0, y: 0, hidden: true })),
  ];
};

/** The internal junction: one passive pin (or bus) that joins the outside net to the inside net without driving either. */
export const tiePorts = (params: ComponentParams): readonly PortDefinition[] => {
  const width = markerWidthOf(params);
  if (width === 1) return [{ id: 'P', direction: 'passive', label: 'P', x: 0, y: 0 }];
  const bits = bitIds('P', width);
  return [
    { id: 'P', direction: 'passive', label: busLabel('P', width), x: 0, y: 0, bus: { bits } },
    ...bits.map((id): PortDefinition => ({ id, direction: 'passive', label: id, x: 0, y: 0, hidden: true })),
  ];
};

export const emptySubcircuit = (name = 'Subcircuit', icon = '▦'): SubcircuitDefinition => ({ name, icon, components: [], wires: [] });

const byPosition = (a: ComponentInstance, b: ComponentInstance): number => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id);

/** The port markers of a subcircuit, inputs then outputs, each in top-to-bottom order on the canvas it was drawn on. */
export const subcircuitMarkers = (definition: SubcircuitDefinition | undefined): { readonly inputs: readonly ComponentInstance[]; readonly outputs: readonly ComponentInstance[] } => ({
  inputs: (definition?.components ?? []).filter((component) => component.type === 'PORT_IN').sort(byPosition),
  outputs: (definition?.components ?? []).filter((component) => component.type === 'PORT_OUT').sort(byPosition),
});

/**
 * The pins of the part that stands for a subcircuit: one per port marker inside it, inputs on the left and
 * outputs on the right. A pin's id is its marker's id, so renaming a marker relabels the pin without breaking
 * a wire that ends on it. A bus marker gives a bus pin.
 */
export const subcircuitPorts = (params: ComponentParams): readonly PortDefinition[] => {
  const { inputs, outputs } = subcircuitMarkers(params.subcircuit);
  const port = (marker: ComponentInstance, index: number, direction: 'input' | 'output'): PortDefinition => {
    const width = markerWidthOf(marker.params);
    const label = width === 1 ? marker.label : busLabel(marker.label, width);
    const base = { id: marker.id, direction, label, x: direction === 'input' ? 0 : SUBCIRCUIT_WIDTH_COLS, y: index };
    return width === 1 ? base : { ...base, bus: { bits: bitIds('P', width) } };
  };
  return [...inputs.map((marker, index) => port(marker, index, 'input')), ...outputs.map((marker, index) => port(marker, index, 'output'))];
};

/**
 * Where a pin's level lives in the simulator. A subcircuit part has no pins of its own there: each of its ports
 * is the internal junction `<part id>/<marker id>`, whose single pin is `P` (a bus port's bits are `P0`...).
 */
export const levelLocation = (component: ComponentInstance, portId: string, pinId: string): { readonly componentId: string; readonly pinId: string } =>
  component.type === 'SUBCIRCUIT'
    ? { componentId: `${component.id}/${portId}`, pinId: pinId === portId ? 'P' : pinId }
    : { componentId: component.id, pinId };
