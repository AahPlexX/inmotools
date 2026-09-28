import { useMemo, useState } from 'react';
import { coordinationEnvironment } from './local-environment-engine';
import { validateCrystalStructure } from './structure-health-engine';
import type { CrystalDocument } from './crystal-types';

export interface CrystalEnvironmentPanelProps {
  readonly document: CrystalDocument;
  readonly polyhedronCenterId: string | null;
  readonly onPolyhedronCenterChange: (siteId: string | null) => void;
}

export default function CrystalEnvironmentPanel({
  document,
  polyhedronCenterId,
  onPolyhedronCenterChange,
}: CrystalEnvironmentPanelProps) {
  const [coordinationSiteId, setCoordinationSiteId] = useState(() => document.sites[0]?.id ?? '');
  const activeSiteId = document.sites.some((site) => site.id === coordinationSiteId)
    ? coordinationSiteId
    : document.sites[0]?.id ?? '';
  const activeSite = document.sites.find((site) => site.id === activeSiteId);
  const showPolyhedron = polyhedronCenterId !== null && polyhedronCenterId === activeSiteId;
  const coordination = useMemo(
    () => (activeSiteId
      ? coordinationEnvironment(document, activeSiteId)
      : { coordinationNumber: 0, neighbors: [], shells: [] }),
    [document, activeSiteId],
  );
  const findings = useMemo(() => validateCrystalStructure(document), [document]);

  const changeCoordinationSite = (siteId: string) => {
    setCoordinationSiteId(siteId);
    if (polyhedronCenterId !== null) onPolyhedronCenterChange(siteId || null);
  };

  return (
    <section className="crystal-structure-panel" data-testid="crystal-environment-panel" aria-labelledby="crystal-environment-heading">
      <div className="crystal-panel-heading">
        <div>
          <h3 id="crystal-environment-heading">Environment &amp; health</h3>
          <p>Inspect the local coordination shell of one site and the current structure-health findings.</p>
        </div>
      </div>

      <section className="crystal-editor-card" aria-labelledby="crystal-coordination-heading">
        <div className="crystal-editor-card__heading crystal-editor-card__heading--wrap">
          <div>
            <h4 id="crystal-coordination-heading">Coordination</h4>
            <p data-testid="crystal-coordination-result">
              Coordination number {coordination.coordinationNumber}
              {activeSite ? ` for ${activeSite.label}` : ''}
            </p>
          </div>
          <label>
            Coordination site
            <select value={activeSiteId} onChange={(event) => changeCoordinationSite(event.target.value)}>
              {document.sites.map((site) => <option value={site.id} key={site.id}>{site.label}</option>)}
            </select>
          </label>
        </div>
        <label className="crystal-toggle">
          <input
            type="checkbox"
            checked={showPolyhedron}
            onChange={(event) => onPolyhedronCenterChange(event.target.checked ? activeSiteId || null : null)}
          />
          Show coordination polyhedron
        </label>
        <p role="status" data-testid="crystal-polyhedron-status">
          {showPolyhedron && activeSite
            ? `Polyhedron for ${activeSite.label} with ${coordination.neighbors.length} vertices.`
            : 'Polyhedron rendering is off.'}
        </p>
      </section>

      <section className="crystal-editor-card" aria-labelledby="crystal-health-heading">
        <h4 id="crystal-health-heading">Health findings</h4>
        <ul data-testid="crystal-health-findings">
          {findings.length > 0
            ? findings.map((finding) => (
              <li key={finding.id}>{finding.severity}: {finding.message}</li>
            ))
            : <li>info: No structure-health issues detected for the current cell.</li>}
        </ul>
      </section>
    </section>
  );
}