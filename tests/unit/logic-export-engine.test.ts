import { describe, expect, it } from 'vitest';
import { addComponent, addWire, createInitialDocument, updateMetadata } from '../../src/tools/logic/circuit-model';
import { parseProject, projectFileName, renderSchematicSvg, serializeProject, validateProjectJson } from '../../src/tools/logic/export-engine';

describe('export-engine project bundle', () => {
  it('round-trips a document through serialize/parse', () => {
    let doc = createInitialDocument('Half adder');
    doc = addComponent(doc, 'XOR', 0, 0);
    doc = addComponent(doc, 'AND', 0, 3);
    const json = serializeProject(doc);
    const restored = parseProject(json);
    expect(restored.metadata.title).toBe('Half adder');
    expect(restored.components).toHaveLength(2);
  });

  it('rejects a file with no recognizable schema version', () => {
    expect(() => parseProject(JSON.stringify({ foo: 'bar' }))).toThrow();
    expect(validateProjectJson('not json').ok).toBe(false);
    expect(validateProjectJson(JSON.stringify(createInitialDocument())).ok).toBe(true);
  });

  it('rejects a structurally incomplete document that only claims schemaVersion 1', () => {
    expect(validateProjectJson(JSON.stringify({ schemaVersion: 1 })).ok).toBe(false);
  });

  it('rejects a document whose wire references a component or port that does not exist', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'LED', 0, 0);
    const led = doc.components[0]!.id;
    const withBadWire = { ...doc, wires: [{ id: 'w1', from: { componentId: 'missing', portId: 'Y' }, to: { componentId: led, portId: 'A' }, waypoints: [] }] };
    expect(validateProjectJson(JSON.stringify(withBadWire)).ok).toBe(false);
  });

  it('rejects a document with a non-finite coordinate, which would otherwise reach SVG export unescaped', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'LED', 0, 0);
    const corrupted = { ...doc, components: [{ ...doc.components[0]!, x: '10" /><script>alert(1)</script>' }] };
    expect(validateProjectJson(JSON.stringify(corrupted)).ok).toBe(false);
  });

  it('slugifies the metadata title into a safe file name', () => {
    let doc = createInitialDocument('My Cool Circuit!! 2026');
    doc = updateMetadata(doc, { title: 'My Cool Circuit!! 2026' });
    expect(projectFileName(doc, 'circuit.json')).toBe('my-cool-circuit-2026.circuit.json');
  });
});

describe('export-engine SVG schematic export', () => {
  it('renders a valid SVG document containing the title block and components', () => {
    let doc = createInitialDocument('Adder demo');
    doc = updateMetadata(doc, { author: 'Ada', version: '1.0.0' });
    doc = addComponent(doc, 'AND', 0, 0);
    const gate = doc.components[0]!.id;
    doc = addComponent(doc, 'LED', 4, 0);
    const led = doc.components[1]!.id;
    doc = addWire(doc, { componentId: gate, portId: 'Y' }, { componentId: led, portId: 'A' });

    const svg = renderSchematicSvg(doc);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Adder demo');
    expect(svg).toContain('Ada');
    expect(svg).toContain('</svg>');
  });
});
