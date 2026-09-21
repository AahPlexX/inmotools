import { describe, expect, it } from 'vitest';
import { getComponentPorts } from '../../src/tools/logic/component-library';

const portOf = (ports: readonly { readonly id: string }[], id: string) => ports.find((port) => port.id === id)!;

describe('component-library port geometry', () => {
  it('centers a single-input gate’s A/Y pins on the padded two-row body instead of its top edge', () => {
    for (const type of ['NOT', 'BUFFER'] as const) {
      const ports = getComponentPorts(type, {});
      const a = portOf(ports, 'A');
      const y = portOf(ports, 'Y');
      // The renderer draws every gate body Math.max(2, inputCount) rows tall
      // and always puts the tip at half that height; a 1-input gate is
      // padded to a 2-row body, so both pins belong at row 1 (the center).
      expect(a.y).toBe(1);
      expect(y.y).toBe(1);
    }
  });

  it('centers the tri-state buffer’s output on its unpadded two-row body', () => {
    const ports = getComponentPorts('TRI_BUFFER', {});
    expect(portOf(ports, 'A').y).toBe(0);
    expect(portOf(ports, 'EN').y).toBe(1);
    expect(portOf(ports, 'Y').y).toBe(1);
  });

  it('places a variadic gate’s output at half its actual (unpadded) input-row count', () => {
    const two = getComponentPorts('AND', { inputCount: 2 });
    expect(portOf(two, 'Y').y).toBe(1);

    const three = getComponentPorts('OR', { inputCount: 3 });
    expect(portOf(three, 'Y').y).toBe(1.5);

    const four = getComponentPorts('NAND', { inputCount: 4 });
    expect(portOf(four, 'Y').y).toBe(2);
  });
});
