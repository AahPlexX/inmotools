import { useCallback, useMemo, useState } from 'react';
import CrystalViewport from './CrystalViewport';
import { createStarterStructure } from './document-engine';
import type { CrystalRepresentation } from './viewport-model';
import './crystal-workspace.css';

const STARTERS = [
  { id: 'nacl', name: 'Sodium chloride', detail: 'Alternating sodium and chloride sites in a cubic crystal.' },
  { id: 'bcc', name: 'Body-centered cubic', detail: 'A cubic lattice with a site at the center of the cell.' },
  { id: 'diamond', name: 'Diamond', detail: 'A tetrahedrally connected carbon crystal.' },
  { id: 'perovskite', name: 'Perovskite', detail: 'A familiar ABX₃ crystal framework.' },
] as const;

const REPRESENTATIONS: readonly { id: CrystalRepresentation; name: string }[] = [
  { id: 'ball-stick', name: 'Ball and stick' },
  { id: 'sticks', name: 'Sticks' },
  { id: 'space-fill', name: 'Space fill' },
  { id: 'points', name: 'Points' },
  { id: 'wireframe', name: 'Wireframe' },
];

type StarterId = (typeof STARTERS)[number]['id'];

export default function CrystalWorkspace() {
  const [starter, setStarter] = useState<StarterId>('nacl');
  const [representation, setRepresentation] = useState<CrystalRepresentation>('ball-stick');
  const [selectedSiteIds, setSelectedSiteIds] = useState<ReadonlySet<string>>(() => new Set());
  const selected = STARTERS.find((item) => item.id === starter) ?? STARTERS[0];
  const document = useMemo(() => createStarterStructure(starter), [starter]);
  const handleSelectionChange = useCallback((ids: ReadonlySet<string>) => {
    setSelectedSiteIds(new Set(ids));
  }, []);

  const handleStarterChange = (next: StarterId) => {
    setStarter(next);
    setSelectedSiteIds(new Set());
  };

  return (
    <div className="crystal-workspace workspace-body" data-testid="crystal-workspace">
      <header className="crystal-workspace__header">
        <div>
          <p className="eyebrow">Structure workspace</p>
          <h2>Explore a crystal</h2>
        </div>
        <p role="status">Everything in this workspace stays on this device.</p>
      </header>

      <section className="crystal-workspace__starter" aria-labelledby="crystal-starter-heading">
        <div>
          <h3 id="crystal-starter-heading">Choose a starter structure</h3>
          <p>Begin with a familiar crystal and use it as a reference while you learn the workspace.</p>
        </div>
        <div className="crystal-workspace__selectors">
          <label>
            Starter structure
            <select value={starter} onChange={(event) => handleStarterChange(event.target.value as StarterId)}>
              {STARTERS.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
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
          <span>{selected.detail}</span>
          <span>{document.sites.length.toLocaleString()} sites in the canonical cell</span>
          <span>{selectedSiteIds.size.toLocaleString()} selected</span>
        </div>
      </section>

      <CrystalViewport
        document={document}
        representation={representation}
        selectedSiteIds={selectedSiteIds}
        onSelectionChange={handleSelectionChange}
      />
    </div>
  );
}
