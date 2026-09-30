import { describe, expect, it } from 'vitest';
import { addComponent, addWire, createInitialDocument, relabelComponent, updateComponentParams, updateMetadata } from '../../src/tools/logic/circuit-model';
import { EXPORT_FORMATS, EXPORT_GROUPS, runExport, type ExportFormatId } from '../../src/tools/logic/export-formats';
import { parseProject } from '../../src/tools/logic/export-engine';
import type { ComponentType, LogicDocument } from '../../src/tools/logic/logic-types';

const DATE = new Date(Date.UTC(2026, 8, 29, 12, 0, 0));

const sample = (): LogicDocument => {
  let doc = updateMetadata(createInitialDocument('Half adder!'), { author: 'Ada', description: 'Adds bits', tags: ['adder'] });
  const ids: Record<string, string> = {};
  let x = 0;
  const add = (type: ComponentType, label: string) => {
    doc = addComponent(doc, type, x, 0);
    x += 12;
    ids[label] = doc.components[doc.components.length - 1]!.id;
    doc = relabelComponent(doc, ids[label]!, label);
  };
  add('SWITCH', 'A');
  add('SWITCH', 'B');
  add('XOR', 'X1');
  add('AND', 'G1');
  add('LED', 'SUM');
  add('LED', 'COUT');
  const wire = (from: string, fromPort: string, to: string, toPort: string) => {
    doc = addWire(doc, { componentId: ids[from]!, portId: fromPort }, { componentId: ids[to]!, portId: toPort });
  };
  wire('A', 'Y', 'X1', 'A');
  wire('B', 'Y', 'X1', 'B');
  wire('A', 'Y', 'G1', 'A');
  wire('B', 'Y', 'G1', 'B');
  wire('X1', 'Y', 'SUM', 'A');
  wire('G1', 'Y', 'COUT', 'A');
  return doc;
};

const ALL = EXPORT_FORMATS.map((format) => format.id);

describe('export format list', () => {
  it('has one entry per format id, each in a known group, with words for a label and description', () => {
    expect(new Set(ALL).size).toBe(ALL.length);
    for (const format of EXPORT_FORMATS) {
      expect(EXPORT_GROUPS, format.id).toContain(format.group);
      expect(format.label.length, format.id).toBeGreaterThan(3);
      expect(format.description.length, format.id).toBeGreaterThan(20);
    }
    for (const group of EXPORT_GROUPS) expect(EXPORT_FORMATS.some((format) => format.group === group), group).toBe(true);
  });
});

describe('running every export', () => {
  it('produces a named file with content for each format', async () => {
    for (const id of ALL) {
      const out = await runExport(id, sample(), { date: DATE });
      expect(out.filename, id).toMatch(/^half-adder\.[a-z.-]+$/);
      expect(out.mime, id).not.toBe('');
      expect(out.text !== undefined || out.bytes !== undefined, id).toBe(true);
      expect((out.text ?? '').length + (out.bytes?.length ?? 0), id).toBeGreaterThan(50);
    }
  });

  it('gives each format its own file name, so saving several never overwrites one with another', async () => {
    const names = await Promise.all(ALL.map(async (id) => (await runExport(id, sample(), { date: DATE })).filename));
    expect(new Set(names).size).toBe(names.length);
  });

  it('writes the right kind of content for each', async () => {
    const text = async (id: ExportFormatId): Promise<string> => (await runExport(id, sample(), { date: DATE })).text ?? '';
    expect(await text('verilog')).toContain('module ');
    expect(await text('verilog-timing')).toMatch(/#\(/);
    expect(await text('vhdl')).toContain('entity ');
    expect(await text('spice')).toContain('.subckt');
    expect(await text('kicad')).toContain('(export');
    expect(await text('edif')).toContain('(edif ');
    expect((await text('bom-csv')).split('\n')[0]).toBe('Item,Part,Description,Package,Quantity,References,Notes');
    expect(JSON.parse(await text('bom-json')).title).toBe('Half adder!');
    expect((await text('pins-csv')).split('\n')[0]).toBe('Reference,Label,Kind,Part,Package,Unit,Signal,Pin');
    expect(await text('svg-sheet')).toContain('translate(40,40)');
    expect(await text('og-svg')).toContain('width="1200"');
    expect(await text('og-meta')).toContain('og:title');
    expect(parseProject(await text('project')).metadata.title).toBe('Half adder!');
  });

  it('writes a real PDF', async () => {
    const out = await runExport('pdf', sample(), { paper: 'letter', date: DATE });
    expect(out.mime).toBe('application/pdf');
    expect(new TextDecoder().decode(out.bytes!.slice(0, 5))).toBe('%PDF-');
  });

  it('marks the PNG card for the browser to draw at 1200 x 630', async () => {
    const out = await runExport('og-png', sample());
    expect(out.raster).toEqual({ width: 1200, height: 630 });
    expect(out.filename).toBe('half-adder.og-card.png');
    expect(out.text).toContain('<svg');
  });

  it('takes the card\'s title, description and addresses typed at export time', async () => {
    const out = await runExport('og-meta', sample(), { og: { title: 'Adder demo', url: 'https://example.com/a', imageUrl: 'https://example.com/a.png' } });
    expect(out.text).toContain('content="Adder demo"');
    expect(out.text).toContain('property="og:url" content="https://example.com/a"');
    expect(out.warnings).toEqual([]);
    const bad = await runExport('og-meta', sample(), { og: { url: 'javascript:alert(1)' } });
    expect(bad.text).not.toContain('javascript:');
    expect(bad.warnings.some((warning) => warning.includes('page address'))).toBe(true);
  });

  it('passes on the warnings an exporter raised', async () => {
    // The parts list says when a part has no classic package, and always advises on choosing a logic family.
    const withRom = addComponent(sample(), 'ROM', 60, 0);
    const huge = updateComponentParams(withRom, withRom.components[withRom.components.length - 1]!.id, { addressBits: 32, dataBits: 8 });
    const out = await runExport('bom-csv', huge, { date: DATE });
    expect(out.warnings.some((warning) => warning.includes('has no single classic'))).toBe(true);
    expect((await runExport('bom-csv', sample())).warnings.some((warning) => warning.includes('logic family'))).toBe(true);
  });

  it('exports an empty circuit without failing', async () => {
    const empty = createInitialDocument('Empty');
    for (const id of ALL) {
      const out = await runExport(id, empty, { date: DATE });
      expect(out.filename, id).toMatch(/^empty\./);
    }
  });

  it('gives a file name of "circuit" when the title has no letters', async () => {
    const out = await runExport('verilog', updateMetadata(sample(), { title: '!!!' }));
    expect(out.filename).toBe('circuit.v');
  });
});
