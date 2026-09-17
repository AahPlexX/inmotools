import { describe, expect, it } from 'vitest';
import {
  addComponent,
  addWire,
  commit,
  createHistory,
  createInitialDocument,
  duplicateComponent,
  mirrorComponent,
  redo,
  removeComponent,
  rotateComponent,
  undo,
  updateComponentParams,
} from '../../src/tools/logic/circuit-model';

describe('circuit-model component lifecycle', () => {
  it('adds and removes a component along with its wires', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'AND', 0, 0);
    const gate = doc.components[0]!.id;
    doc = addComponent(doc, 'LED', 3, 0);
    const led = doc.components[1]!.id;
    doc = addWire(doc, { componentId: gate, portId: 'Y' }, { componentId: led, portId: 'A' });
    expect(doc.wires).toHaveLength(1);

    doc = removeComponent(doc, gate);
    expect(doc.components).toHaveLength(1);
    expect(doc.wires).toHaveLength(0);
  });

  it('cycles rotation through 0/90/180/270/0', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'NOT', 0, 0);
    const gate = doc.components[0]!.id;
    doc = rotateComponent(doc, gate);
    expect(doc.components[0]!.rotation).toBe(90);
    doc = rotateComponent(doc, gate);
    doc = rotateComponent(doc, gate);
    doc = rotateComponent(doc, gate);
    expect(doc.components[0]!.rotation).toBe(0);
  });

  it('mirrors and duplicates a component', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'OR', 1, 1);
    const gate = doc.components[0]!.id;
    doc = mirrorComponent(doc, gate);
    expect(doc.components[0]!.mirrored).toBe(true);
    doc = duplicateComponent(doc, gate);
    expect(doc.components).toHaveLength(2);
    expect(doc.components[1]!.id).not.toBe(gate);
  });

  it('prunes wires that reference a port removed by shrinking input count', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'AND', 0, 0);
    const gate = doc.components[0]!.id;
    doc = updateComponentParams(doc, gate, { inputCount: 4 });
    doc = addComponent(doc, 'SWITCH', -2, 3);
    const sourceSwitch = doc.components[1]!.id;
    doc = addWire(doc, { componentId: sourceSwitch, portId: 'Y' }, { componentId: gate, portId: 'D' });
    expect(doc.wires).toHaveLength(1);

    doc = updateComponentParams(doc, gate, { inputCount: 2 });
    expect(doc.wires).toHaveLength(0);
  });

  it('clamps variadic gate input count to the 2-8 range', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'AND', 0, 0);
    const gate = doc.components[0]!.id;
    doc = updateComponentParams(doc, gate, { inputCount: 99 });
    expect(doc.components[0]!.params.inputCount).toBe(8);
    doc = updateComponentParams(doc, gate, { inputCount: 0 });
    expect(doc.components[0]!.params.inputCount).toBe(2);
  });
});

describe('circuit-model undo/redo history', () => {
  it('undoes and redoes a committed change', () => {
    let history = createHistory(createInitialDocument());
    history = commit(history, 'add gate', (doc) => addComponent(doc, 'AND', 0, 0));
    expect(history.present.components).toHaveLength(1);

    history = undo(history);
    expect(history.present.components).toHaveLength(0);

    history = redo(history);
    expect(history.present.components).toHaveLength(1);
  });

  it('clears future history on a new commit after an undo', () => {
    let history = createHistory(createInitialDocument());
    history = commit(history, 'add gate', (doc) => addComponent(doc, 'AND', 0, 0));
    history = undo(history);
    history = commit(history, 'add different gate', (doc) => addComponent(doc, 'OR', 0, 0));
    expect(history.future).toHaveLength(0);
    expect(history.present.components[0]!.type).toBe('OR');
  });
});
