import { useState } from 'react';
import './crystal-workspace.css';

const STARTERS = [
  { id: 'nacl', name: 'Sodium chloride', detail: 'Alternating sodium and chloride sites in a cubic crystal.' },
  { id: 'bcc', name: 'Body-centered cubic', detail: 'A cubic lattice with a site at the center of the cell.' },
  { id: 'diamond', name: 'Diamond', detail: 'A tetrahedrally connected carbon crystal.' },
  { id: 'perovskite', name: 'Perovskite', detail: 'A familiar ABX₃ crystal framework.' },
] as const;

type StarterId = (typeof STARTERS)[number]['id'];

export default function CrystalWorkspace() {
  const [starter, setStarter] = useState<StarterId>('nacl');
  const selected = STARTERS.find((item) => item.id === starter) ?? STARTERS[0];

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
        <label>
          Starter structure
          <select value={starter} onChange={(event) => setStarter(event.target.value as StarterId)}>
            {STARTERS.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        <div className="crystal-workspace__starter-note" aria-live="polite">
          <strong>{selected.name}</strong>
          <span>{selected.detail}</span>
        </div>
      </section>
    </div>
  );
}
