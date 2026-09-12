import { type ChangeEvent, useCallback, useMemo, useRef, useState } from 'react';
import { consumeFileInput } from '../../lib/file-input';
import CrystalExportDialog from './CrystalExportDialog';
import CrystalMetadataDialog from './CrystalMetadataDialog';
import CrystalStructurePanel from './CrystalStructurePanel';
import CrystalViewport from './CrystalViewport';
import { createStarterStructure } from './document-engine';
import { commitCrystalHistory, createCrystalHistory, type CrystalHistory } from './history-engine';
import {
  parseCrystalProject,
  type CrystalMeasurement,
  type CrystalProjection,
  type CrystalRepresentation as ProjectRepresentation,
  type CrystalViewState,
} from './project-engine';
import {
  STARTER_STRUCTURES,
  STARTER_STRUCTURE_IDS,
  type StarterStructureId,
} from './starter-structures';
import { importCrystalText } from './structure-import-engine';
import type { CrystalDocument } from './crystal-types';
import type { CrystalRepresentation } from './viewport-model';
import './crystal-workspace.css';
import './crystal-dialog.css';

const REPRESENTATIONS: readonly { id: CrystalRepresentation; name: string }[] = [
  { id: 'ball-stick', name: 'Ball and stick' },
  { id: 'sticks', name: 'Sticks' },
  { id: 'space-fill', name: 'Space fill' },
  { id: 'points', name: 'Points' },
  { id: 'wireframe', name: 'Wireframe' },
];

function toProjectRepresentation(representation: CrystalRepresentation): ProjectRepresentation {
  switch (representation) {
    case 'ball-stick': return 'ball-and-stick';
    case 'space-fill': return 'space-filling';
    case 'points': return 'spheres';
    case 'sticks': return 'sticks';
    case 'wireframe': return 'wireframe';
    default: {
      const unreachable: never = representation;
      return unreachable;
    }
  }
}

function fromProjectRepresentation(representation: ProjectRepresentation): CrystalRepresentation {
  switch (representation) {
    case 'ball-and-stick': return 'ball-stick';
    case 'space-filling': return 'space-fill';
    case 'spheres': return 'points';
    case 'sticks': return 'sticks';
    case 'wireframe': return 'wireframe';
    default: {
      const unreachable: never = representation;
      return unreachable;
    }
  }
}

export default function CrystalWorkspace() {
  const [starter, setStarter] = useState<StarterStructureId>('nacl');
  const [history, setHistory] = useState(() => createCrystalHistory(createStarterStructure('nacl')));
  const [measurements, setMeasurements] = useState<readonly CrystalMeasurement[]>([]);
  const [representation, setRepresentation] = useState<CrystalRepresentation>('ball-stick');
  const [projection, setProjection] = useState<CrystalProjection>('perspective');
  const [selectedSiteIds, setSelectedSiteIds] = useState<ReadonlySet<string>>(() => new Set());
  const [fileStatus, setFileStatus] = useState('No local structure or project file is open.');
  const structureFileRef = useRef<HTMLInputElement | null>(null);
  const projectFileRef = useRef<HTMLInputElement | null>(null);
  const viewportCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const document = history.present;
  const selected = STARTER_STRUCTURES[starter];
  const isSelectedStarter = document.sourceFormat === 'starter' && document.id === `starter-${starter}`;

  const projectView = useMemo<CrystalViewState>(() => ({
    projection,
    cameraPosition: [8, 8, 8],
    target: [0, 0, 0],
    up: [0, 1, 0],
    representation: toProjectRepresentation(representation),
    showCell: true,
    showAxes: true,
    showBonds: true,
    atomScale: 1,
    bondScale: 1,
    background: '#ffffff',
  }), [projection, representation]);

  const handleSelectionChange = useCallback((ids: ReadonlySet<string>) => {
    setSelectedSiteIds(new Set(ids));
  }, []);

  const handleHistoryChange = useCallback((nextHistory: CrystalHistory) => {
    const validSiteIds = new Set(nextHistory.present.sites.map((site) => site.id));
    setSelectedSiteIds((current) => new Set([...current].filter((id) => validSiteIds.has(id))));
    setMeasurements((current) => current.filter((measurement) => measurement.siteIds.every((id) => validSiteIds.has(id))));
    setHistory(nextHistory);
  }, []);

  const handleMetadataSave = useCallback((nextDocument: CrystalDocument) => {
    handleHistoryChange(commitCrystalHistory(history, nextDocument));
  }, [handleHistoryChange, history]);

  const handleCanvasChange = useCallback((canvas: HTMLCanvasElement | null) => {
    viewportCanvasRef.current = canvas;
  }, []);

  const getViewportCanvas = useCallback(() => viewportCanvasRef.current, []);

  const handleStarterChange = (next: StarterStructureId) => {
    const nextDocument = createStarterStructure(next);
    setStarter(next);
    setHistory(createCrystalHistory(nextDocument));
    setMeasurements([]);
    setSelectedSiteIds(new Set());
    setFileStatus(`Loaded starter structure ${STARTER_STRUCTURES[next].name}.`);
  };

  const handleStructureFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    consumeFileInput(input, async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const imported = importCrystalText(file.name, await file.text());
        setHistory(createCrystalHistory(imported.document));
        setMeasurements([]);
        setSelectedSiteIds(new Set());
        setFileStatus(`Imported ${file.name}${imported.warnings.length ? ` with ${imported.warnings.length} note${imported.warnings.length === 1 ? '' : 's'}.` : '.'}`);
      } catch (error) {
        setFileStatus(`Could not import ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  };

  const handleProjectFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    consumeFileInput(input, async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const project = parseCrystalProject(await file.text());
        setHistory(createCrystalHistory(project.document));
        setMeasurements(project.measurements);
        setRepresentation(fromProjectRepresentation(project.view.representation));
        setProjection(project.view.projection);
        setSelectedSiteIds(new Set());
        const matchingStarter = STARTER_STRUCTURE_IDS.find((id) => project.document.id === `starter-${id}`);
        if (matchingStarter) setStarter(matchingStarter);
        setFileStatus(`Opened project ${file.name}.`);
      } catch (error) {
        setFileStatus(`Could not open project ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  };

  return (
    <div className="crystal-workspace workspace-body" data-testid="crystal-workspace">
      <header className="crystal-workspace__header">
        <div>
          <p className="eyebrow">Structure workspace</p>
          <h2>Explore and build a crystal</h2>
        </div>
        <p role="status">Everything in this workspace stays on this device.</p>
      </header>

      <section className="crystal-workspace__starter" aria-labelledby="crystal-starter-heading">
        <div>
          <h3 id="crystal-starter-heading">Choose a starter structure</h3>
          <p>Begin with a reference structure, then inspect or edit its cell and atomic sites.</p>
        </div>
        <div className="crystal-workspace__selectors">
          <label>
            Starter structure
            <select value={starter} onChange={(event) => handleStarterChange(event.target.value as StarterStructureId)}>
              {STARTER_STRUCTURE_IDS.map((id) => (
                <option value={id} key={id}>{STARTER_STRUCTURES[id].name}</option>
              ))}
            </select>
          </label>
          <label>
            Representation
            <select
              value={representation}
              onChange={(event) => setRepresentation(event.target.value as CrystalRepresentation)}
            >
              {REPRESENTATIONS.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <div className="crystal-workspace__starter-note" aria-live="polite">
          <strong>{isSelectedStarter ? selected.name : (document.metadata.title ?? document.name)}</strong>
          <span>{isSelectedStarter ? selected.description : `Working from a local ${document.sourceFormat.toUpperCase()} document.`}</span>
          <span>{document.sites.length.toLocaleString()} sites in the working cell</span>
          <span>{selectedSiteIds.size.toLocaleString()} selected</span>
        </div>
      </section>

      <section className="crystal-workspace__document-actions" aria-labelledby="crystal-document-actions-heading">
        <div>
          <h3 id="crystal-document-actions-heading">Data &amp; output</h3>
          <p>Open local files, review metadata, save a project, or export the current working structure.</p>
          <p role="status" data-testid="crystal-file-status">{fileStatus}</p>
        </div>
        <div className="crystal-workspace__document-buttons">
          <input
            ref={structureFileRef}
            data-testid="crystal-structure-file-input"
            type="file"
            accept=".cif,.mcif,.mmcif,.pdb,.ent,.vasp,.poscar,.xyz,.extxyz,text/plain,chemical/x-cif,chemical/x-pdb,chemical/x-xyz"
            onChange={handleStructureFile}
            hidden
          />
          <button type="button" onClick={() => structureFileRef.current?.click()}>Open structure</button>
          <input
            ref={projectFileRef}
            data-testid="crystal-project-file-input"
            type="file"
            accept=".json,.crystal.json,application/json"
            onChange={handleProjectFile}
            hidden
          />
          <button type="button" onClick={() => projectFileRef.current?.click()}>Open project</button>
          <CrystalMetadataDialog document={document} onSave={handleMetadataSave} />
          <CrystalExportDialog
            document={document}
            measurements={measurements}
            view={projectView}
            representation={representation}
            getViewportCanvas={getViewportCanvas}
          />
        </div>
      </section>

      <CrystalViewport
        document={document}
        representation={representation}
        projection={projection}
        selectedSiteIds={selectedSiteIds}
        onSelectionChange={handleSelectionChange}
        onProjectionChange={setProjection}
        onCanvasChange={handleCanvasChange}
      />

      <CrystalStructurePanel
        history={history}
        onHistoryChange={handleHistoryChange}
        measurements={measurements}
        onMeasurementsChange={setMeasurements}
      />
    </div>
  );
}
