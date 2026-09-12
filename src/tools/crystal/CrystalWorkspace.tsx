import { useCallback, useState } from 'react';
import CrystalExportDialog from './CrystalExportDialog';
import CrystalMetadataDialog from './CrystalMetadataDialog';
import CrystalStructurePanel from './CrystalStructurePanel';
import CrystalViewport from './CrystalViewport';
import { createStarterStructure } from './document-engine';
import { commitCrystalHistory, createCrystalHistory, type CrystalHistory } from './history-engine';
import type { CrystalMeasurement } from './project-engine';
import {
  STARTER_STRUCTURES,
  STARTER_STRUCTURE_IDS,
  type StarterStructureId,
} from './starter-structures';
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

export default function CrystalWorkspace() {
  const [starter, setStarter] = useState<StarterStructureId>('nacl');
  const [history, setHistory] = useState(() => createCrystalHistory(createStarterStructure('nacl')));
  const [measurements, setMeasurements] = useState<readonly CrystalMeasurement[]>([]);
  const [representation, setRepresentation] = useState<CrystalRepresentation>('ball-stick');
  const [selectedSiteIds, setSelectedSiteIds] = useState<ReadonlySet<string>>(() => new Set());
  const document = history.present;
  const selected = STARTER_STRUCTURES[starter];

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

  const handleStarterChange = (next: StarterStructureId) => {
    const nextDocument = createStarterStructure(next);
    setStarter(next);
    setHistory(createCrystalHistory(nextDocument));
    setMeasurements([]);
    setSelectedSiteIds(new Set());
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
          <strong>{selected.name}</strong>
          <span>{selected.description}</span>
          <span>{document.sites.length.toLocaleString()} sites in the working cell</span>
          <span>{selectedSiteIds.size.toLocaleString()} selected</span>
        </div>
      </section>

      <section className="crystal-workspace__document-actions" aria-labelledby="crystal-document-actions-heading">
        <div>
          <h3 id="crystal-document-actions-heading">Data &amp; output</h3>
          <p>Review document metadata, inspect preserved CIF content, or export the current working structure.</p>
        </div>
        <div className="crystal-workspace__document-buttons">
          <CrystalMetadataDialog document={document} onSave={handleMetadataSave} />
          <CrystalExportDialog document={document} measurements={measurements} />
        </div>
      </section>

      <CrystalViewport
        document={document}
        representation={representation}
        selectedSiteIds={selectedSiteIds}
        onSelectionChange={handleSelectionChange}
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
