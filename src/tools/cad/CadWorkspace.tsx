import { useEffect, useRef, useState } from 'react';
import type { CadProjectHistory } from './cad-types';
import type { CadKernelBodyResult, CadKernelResponse } from './kernel-contract';
import { CadKernelWorkerClient, type CadKernelWorkerFactory } from './kernel-worker-client';
import { createBrowserCadKernelWorkerFactory } from './cad-worker-factory';
import { commitCadProject, createCadProject, redoCadProject, setFeatureParameter, setFeatureSuppressed, undoCadProject } from './project-engine';
import type { CadSelection } from './cad-workspace-types';
import CadViewport from './CadViewport';
import CadTree from './CadTree';
import CadInspector from './CadInspector';

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
  const [rebuilding, setRebuilding] = useState(false);
  const [kernelError, setKernelError] = useState<string | null>(null);
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
  }, [history.present]);

  function selectFeature(featureId: string | null) {
    setSelection(featureId ? { kind: 'feature', id: featureId } : null);
  }

  function selectBody(bodyId: string | null) {
    setSelection(bodyId ? { kind: 'body', id: bodyId } : null);
  }

  function toggleSuppressed(featureId: string, suppressed: boolean) {
    setHistory((current) => commitCadProject(
      current,
      suppressed ? 'Suppress feature' : 'Unsuppress feature',
      (project) => setFeatureSuppressed(project, featureId, suppressed),
    ));
  }

  function changeParameter(featureId: string, key: string, value: unknown) {
    setHistory((current) => commitCadProject(
      current,
      `Edit ${key}`,
      (project) => setFeatureParameter(project, featureId, key, value),
    ));
  }

  function undo() {
    setHistory((current) => undoCadProject(current));
  }

  function redo() {
    setHistory((current) => redoCadProject(current));
  }

  return (
    <div className="cad-workspace" data-testid="cad-workspace">
      <div className="cad-workspace-tree">
        <CadTree
          project={history.present}
          selection={selection}
          onSelectFeature={selectFeature}
          onToggleSuppressed={toggleSuppressed}
        />
      </div>
      <div className="cad-workspace-viewport">
        <CadViewport bodies={bodies} selection={selection} onSelectBody={selectBody} rebuilding={rebuilding} />
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
