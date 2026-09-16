import { useState } from 'react';
import { commitCrystalHistory, type CrystalHistory } from './history-engine';
import { createInterstitial, createSubstitution, createVacancy } from './model-building-engine';
import { getElementReference } from './element-data';
import type { CrystalDocument } from './crystal-types';

export interface CrystalModelBuilderPanelProps {
  readonly history: CrystalHistory;
  readonly onHistoryChange: (history: CrystalHistory) => void;
}

const INTERSTITIAL_POSITION = [0.25, 0.25, 0.25] as const;

export default function CrystalModelBuilderPanel({ history, onHistoryChange }: CrystalModelBuilderPanelProps) {
  const document = history.present;
  const [defectSiteId, setDefectSiteId] = useState(() => document.sites[0]?.id ?? '');
  const [element, setElement] = useState('Fe');
  const [status, setStatus] = useState('Choose a site and element, then build a defect.');
  const activeSiteId = document.sites.some((site) => site.id === defectSiteId)
    ? defectSiteId
    : document.sites[0]?.id ?? '';
  const activeSite = document.sites.find((site) => site.id === activeSiteId);

  const commit = (next: CrystalDocument, message: string) => {
    onHistoryChange(commitCrystalHistory(history, next));
    setStatus(message);
  };

  const verifiedElement = (): string | null => {
    const symbol = element.trim();
    if (!symbol || !getElementReference(symbol)) {
      setStatus(`Unknown element "${element}"; choose a verified element symbol.`);
      return null;
    }
    return symbol;
  };

  const buildVacancy = () => {
    if (!activeSite) {
      setStatus('No site is available for a vacancy.');
      return;
    }
    commit(createVacancy(document, activeSite.id), `Vacancy created at ${activeSite.label}.`);
  };

  const buildSubstitution = () => {
    const symbol = verifiedElement();
    if (!activeSite || !symbol) return;
    commit(createSubstitution(document, activeSite.id, symbol), `Substituted ${activeSite.label} with ${symbol}.`);
  };

  const buildInterstitial = () => {
    const symbol = verifiedElement();
    if (!symbol) return;
    commit(
      createInterstitial(document, {
        label: `${symbol}i`,
        element: symbol,
        fractional: [INTERSTITIAL_POSITION[0], INTERSTITIAL_POSITION[1], INTERSTITIAL_POSITION[2]],
        occupancy: 1,
      }),
      `Interstitial ${symbol} added at (0.25, 0.25, 0.25).`,
    );
  };

  return (
    <section className="crystal-structure-panel" data-testid="crystal-model-builder-panel" aria-labelledby="crystal-model-builder-heading">
      <div className="crystal-panel-heading">
        <div>
          <h3 id="crystal-model-builder-heading">Build model</h3>
          <p>Create point defects from the working structure; every change stays undoable.</p>
        </div>
      </div>
      <section className="crystal-editor-card" aria-labelledby="crystal-defect-heading">
        <div className="crystal-editor-card__heading crystal-editor-card__heading--wrap">
          <div>
            <h4 id="crystal-defect-heading">Point defects</h4>
            <p role="status" data-testid="crystal-defect-status">{status}</p>
          </div>
          <label>
            Defect site
            <select value={activeSiteId} onChange={(event) => setDefectSiteId(event.target.value)}>
              {document.sites.map((site) => <option value={site.id} key={site.id}>{site.label}</option>)}
            </select>
          </label>
          <label>
            Defect element
            <input value={element} onChange={(event) => setElement(event.target.value)} />
          </label>
        </div>
        <div className="crystal-defect-buttons">
          <button type="button" onClick={buildVacancy}>Create vacancy</button>
          <button type="button" onClick={buildSubstitution}>Create substitution</button>
          <button type="button" onClick={buildInterstitial}>Create interstitial</button>
        </div>
      </section>
    </section>
  );
}