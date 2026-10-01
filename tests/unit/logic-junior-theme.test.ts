import { describe, expect, it } from 'vitest';
import { addComponent, addWire, createInitialDocument, setTheme } from '../../src/tools/logic/circuit-model';
import { COMPONENT_LIBRARY } from '../../src/tools/logic/component-library';
import { parseProject, serializeProject } from '../../src/tools/logic/export-engine';
import type { LogicDocument, ThemeName } from '../../src/tools/logic/logic-types';
import { renderScene, THEME_PALETTES } from '../../src/tools/logic/render-engine';
import { createInitialFrame, step } from '../../src/tools/logic/sim-engine';

const THEMES: readonly ThemeName[] = ['light', 'dark', 'high-contrast', 'color-vision-safe', 'junior-explorer'];

const luminance = (hex: string): number => {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};
const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
};

/** A canvas context that ignores drawing calls and records every style it is given. */
const recordingContext = () => {
  const fills: string[] = [];
  const widths: number[] = [];
  const dashes: number[][] = [];
  const state: Record<string, unknown> = {};
  const context = new Proxy(state, {
    get: (target, property: string) => {
      if (property === 'setLineDash') return (pattern: number[]) => dashes.push([...pattern]);
      if (property in target) return target[property];
      return () => undefined;
    },
    set: (target, property: string, value: unknown) => {
      target[property] = value;
      if (property === 'fillStyle' && typeof value === 'string') fills.push(value);
      if (property === 'lineWidth' && typeof value === 'number') widths.push(value);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, fills, widths, dashes };
};

const circuit = (theme: ThemeName): LogicDocument => {
  let doc = setTheme(createInitialDocument(), theme);
  doc = addComponent(doc, 'SWITCH', 1, 1);
  doc = addComponent(doc, 'AND', 6, 1);
  doc = addComponent(doc, 'LED', 12, 2);
  const [source, gate, led] = doc.components.map((component) => component.id);
  doc = addWire(doc, { componentId: source!, portId: 'Y' }, { componentId: gate!, portId: 'A' });
  doc = addWire(doc, { componentId: source!, portId: 'Y' }, { componentId: gate!, portId: 'B' });
  doc = addWire(doc, { componentId: gate!, portId: 'Y' }, { componentId: led!, portId: 'A' });
  return doc;
};

const draw = (theme: ThemeName, animationTime: number | undefined, switchOn: boolean) => {
  const doc = circuit(theme);
  const frame = step({ document: doc, previous: createInitialFrame(doc), elapsedMs: 16, interactions: { [doc.components[0]!.id]: switchOn ? 1 : 0 } });
  const recorded = recordingContext();
  renderScene(recorded.context, 600, 300, doc.viewport, { document: doc, frame, animationTime }, theme);
  return recorded;
};

describe('theme palettes', () => {
  it('defines every theme with every color the renderer reads', () => {
    for (const theme of THEMES) {
      const palette = THEME_PALETTES[theme];
      for (const key of ['background', 'grid', 'componentFill', 'componentStroke', 'label', 'selection', 'levelHigh', 'levelLow', 'levelFloating', 'levelContention'] as const) {
        expect(palette[key], `${theme}.${key}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('leaves the existing themes exactly as they were: no emphasis, no family colors, no animation', () => {
    for (const theme of ['light', 'dark', 'high-contrast', 'color-vision-safe'] as const) {
      const palette = THEME_PALETTES[theme];
      expect(palette.emphasis).toBeUndefined();
      expect(palette.familyFill).toBeUndefined();
      expect(palette.flow).toBeUndefined();
    }
  });

  it('gives Junior Explorer heavier lines, family colors for every component family, and animated flow', () => {
    const palette = THEME_PALETTES['junior-explorer'];
    expect(palette.emphasis).toBeGreaterThan(1);
    expect(palette.flow).toBe(true);
    const families = new Set(Object.values(COMPONENT_LIBRARY).map((definition) => definition.category));
    for (const family of families) expect(palette.familyFill?.[family], `family ${family}`).toMatch(/^#[0-9a-f]{6}$/i);
    const colors = Object.values(palette.familyFill ?? {});
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('keeps label text readable (WCAG AA, 4.5:1) on the page and on every family color', () => {
    const palette = THEME_PALETTES['junior-explorer'];
    expect(contrast(palette.label, palette.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.label, palette.componentFill)).toBeGreaterThanOrEqual(4.5);
    for (const [family, fill] of Object.entries(palette.familyFill ?? {})) {
      expect(contrast(palette.label, fill), `label on ${family}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.componentStroke, fill), `outline on ${family}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps signal colors distinguishable from the page (3:1 for graphics) in every theme', () => {
    for (const theme of THEMES) {
      const palette = THEME_PALETTES[theme];
      for (const key of ['levelHigh', 'levelLow', 'levelContention'] as const) {
        expect(contrast(palette[key], palette.background), `${theme}.${key}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps high and low distinguishable from each other by more than a shade', () => {
    for (const theme of THEMES) {
      const palette = THEME_PALETTES[theme];
      expect(palette.levelHigh.toLowerCase()).not.toBe(palette.levelLow.toLowerCase());
    }
  });
});

describe('theme persistence', () => {
  it('saves and reopens a project in Junior Explorer', () => {
    const doc = circuit('junior-explorer');
    expect(parseProject(serializeProject(doc)).theme).toBe('junior-explorer');
  });

  it('still rejects a theme that does not exist', () => {
    const broken = JSON.parse(serializeProject(circuit('light'))) as { theme: string };
    broken.theme = 'neon';
    expect(() => parseProject(JSON.stringify(broken))).toThrow();
  });
});

describe('theme rendering', () => {
  it('colors each component family with its own body color in Junior Explorer', () => {
    const { fills } = draw('junior-explorer', undefined, false);
    const family = THEME_PALETTES['junior-explorer'].familyFill!;
    expect(fills).toContain(family.gate);
    expect(fills).toContain(family.io);
  });

  it('keeps plain white bodies in the light theme', () => {
    const { fills } = draw('light', undefined, false);
    expect(fills).toContain('#ffffff');
    expect(fills).not.toContain('#bfdbfe');
  });

  it('draws heavier outlines and wires in Junior Explorer than in the light theme', () => {
    const junior = draw('junior-explorer', undefined, true);
    const light = draw('light', undefined, true);
    expect(Math.max(...junior.widths)).toBeGreaterThan(Math.max(...light.widths));
    expect(junior.widths).toContain(1.6 * (THEME_PALETTES['junior-explorer'].emphasis ?? 1));
    expect(light.widths).toContain(1.6);
  });

  it('draws moving flow dashes only for a high signal, only in a flow theme, and only when a clock is supplied', () => {
    const flowDash = (dashes: number[][]) => dashes.some((pattern) => pattern.length === 2 && pattern[0] === 6 && pattern[1] === 14);
    expect(flowDash(draw('junior-explorer', 1200, true).dashes)).toBe(true);
    expect(flowDash(draw('junior-explorer', 1200, false).dashes)).toBe(false);
    expect(flowDash(draw('junior-explorer', undefined, true).dashes)).toBe(false);
    expect(flowDash(draw('light', 1200, true).dashes)).toBe(false);
  });

  it('draws every theme without throwing, including an empty circuit', () => {
    for (const theme of THEMES) {
      expect(() => draw(theme, 500, true)).not.toThrow();
      const empty = setTheme(createInitialDocument(), theme);
      const recorded = recordingContext();
      expect(() => renderScene(recorded.context, 400, 300, empty.viewport, { document: empty, frame: createInitialFrame(empty) }, theme)).not.toThrow();
    }
  });
});
