import { useEffect, useRef, useState } from 'react';
import type { CadProjectHistory } from './cad-types';
import type { CadKernelBodyResult, CadKernelResponse } from './kernel-contract';
import { CadKernelWorkerClient, type CadKernelWorkerFactory } from './kernel-worker-client';
import { createBrowserCadKernelWorkerFactory } from './cad-worker-factory';
import { addPrimitiveFeature, commitCadProject, createCadProject, redoCadProject, setBodyVisibility, setFeatureParameter, setFeatureSuppressed, undoCadProject, type CadPrimitiveKind } from './project-engine';
import { selectedSketch, type CadSelection } from './cad-workspace-types';
import CadViewport from './CadViewport';
import CadTree from './CadTree';
import CadInspector from './CadInspector';
import CadSketchViewer from './CadSketchViewer';

const HISTORY_LIMIT = 100;

function initialHistory(): CadProjectHistory {
  return { past: [], present: createCadProject('Untitled CAD project'), future: [], limit: HISTORY_LIMIT };
}

export interface CadWorkspaceProps {
  /** Overridable only for tests; production always routes through the real lazy worker factory. */
  workerFactory?: CadKernelWorkerFactory;
}

export default function CadWorkspace({ workerFactory }: CadWorkspaceProps = {}) {
  const [history, setHistory] = useState<CadProjectHistory>(initialHistory);
  const [bodies, setBodies] = useState<readonly CadKernelBodyResult[]>([]);
  const [selection, setSelection] = useState<CadSelection | null>(null);
  const [sketchEntitySelection, setSketchEntitySelection] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [kernelError, setKernelError] = useState<string | null>(null);
  const [primitiveKind, setPrimitiveKind] = useState<CadPrimitiveKind>('box');
  const clientRef = useRef<CadKernelWorkerClient | null>(null);

  useEffect(() => {
    const client = new CadKernelWorkerClient(workerFactory ?? createBrowserCadKernelWorkerFactory(), {
      onResponse: (response: CadKernelResponse) => {
        setRebuilding(false);
        if (!response.ok) {
          // Invariant #5: a failed rebuild must never replace last-good bodies with corrupt/stale state.
          setKernelError(response.error.message);
          return;
        }
        setKernelError(null);
        if (response.payload.kind === 'rebuild') setBodies(response.payload.bodies);
      },
      onWorkerError: (event) => {
        setRebuilding(false);
        setKernelError(event.message || 'The CAD kernel worker failed unexpectedly.');
      },
    });
    clientRef.current = client;
    return () => {
      client.dispose();
      clientRef.current = null;
    };
  }, [workerFactory]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    setRebuilding(true);
    // Full rebuild every change for now; incremental dirtyFeatureIds tracking is a later milestone.
    client.request(history.present, 'final', { kind: 'rebuild', dirtyFeatureIds: [] });
  }, [history.present.features, history.present.sketches]);

  function selectFeature(featureId: string | null) {
    setSelection(featureId ? { kind: 'feature', id: featureId } : null);
  }

  function selectBody(bodyId: string | null) {
    setSelection(bodyId ? { kind: 'body', id: bodyId } : null);
  }

  function selectSketch(sketchId: string | null) {
    setSelection(sketchId ? { kind: 'sketch', id: sketchId } : null);
    setSketchEntitySelection(null);
  }

  function toggleSuppressed(featureId: string, suppressed: boolean) {
    setHistory((current) => commitCadProject(
      current,
      suppressed ? 'Suppress feature' : 'Unsuppress feature',
      (project) => setFeatureSuppressed(project, featureId, suppressed),
    ));
  }

  function toggleBodyVisibility(bodyId: string, visible: boolean) {
    setHistory((current) => commitCadProject(current, visible ? 'Show body' : 'Hide body', (project) => setBodyVisibility(project, bodyId, visible)));
  }

  function changeParameter(featureId: string, key: string, value: unknown) {
    setHistory((current) => commitCadProject(
      current,
      `Edit ${key}`,
      (project) => setFeatureParameter(project, featureId, key, value),
    ));
  }

  function addPrimitive() {
    setHistory((current) => commitCadProject(current, `Add ${primitiveKind}`, (project) => addPrimitiveFeature(project, primitiveKind)));
  }

  function undo() {
    setHistory((current) => undoCadProject(current));
  }

  function redo() {
    setHistory((current) => redoCadProject(current));
  }

  const activeSketch = selectedSketch(history.present, selection);

  return (
    <div className="cad-workspace" data-testid="cad-workspace">
      <div className="button-row" aria-label="Create geometry">
        <label htmlFor="cad-primitive-kind">Primitive</label>
        <select id="cad-primitive-kind" value={primitiveKind} onChange={(event) => setPrimitiveKind(event.target.value as CadPrimitiveKind)}>
          <option value="box">Box</option>
          <option value="cylinder">Cylinder</option>
          <option value="sphere">Sphere</option>
          <option value="cone">Cone</option>
          <option value="torus">Torus</option>
        </select>
        <button className="action-button" type="button" onClick={addPrimitive}>Add {primitiveKind}</button>
      </div>
      <div className="cad-workspace-tree">
        <CadTree
          project={history.present}
          selection={selection}
          onSelectFeature={selectFeature}
          onSelectBody={selectBody}
          onToggleBodyVisibility={toggleBodyVisibility}
          onToggleSuppressed={toggleSuppressed}
          onSelectSketch={selectSketch}
        />
      </div>
      <div className="cad-workspace-viewport">
        {activeSketch ? (
          <CadSketchViewer
            sketch={activeSketch}
            selectedEntityId={sketchEntitySelection}
            onSelectEntity={setSketchEntitySelection}
          />
        ) : (
          <CadViewport bodies={bodies.filter((body) => history.present.bodies.find((projectBody) => projectBody.id === body.bodyId)?.visible !== false)} selection={selection} onSelectBody={selectBody} rebuilding={rebuilding} />
        )}
        {kernelError ? <div className="notice" role="alert">{kernelError}</div> : null}
      </div>
      <div className="cad-workspace-inspector">
        <CadInspector project={history.present} selection={selection} onParameterChange={changeParameter} />
      </div>
      <div className="button-row" aria-label="History controls">
        <button className="action-button secondary" type="button" disabled={history.past.length === 0} onClick={undo}>Undo</button>
        <button className="action-button secondary" type="button" disabled={history.future.length === 0} onClick={redo}>Redo</button>
      </div>
    </div>
  );
}
