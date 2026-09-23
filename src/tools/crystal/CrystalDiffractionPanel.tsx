import { useMemo, useState } from 'react';
import { simulatePowderPattern, type RadiationType } from './diffraction-engine';
import type { CrystalDocument } from './crystal-types';

const RADIATIONS: readonly { id: RadiationType; name: string; wavelength: number }[] = [
  { id: 'xray', name: 'X-ray (Cu Kα)', wavelength: 1.5406 },
  { id: 'neutron', name: 'Neutron', wavelength: 1.5406 },
  { id: 'electron', name: 'Electron', wavelength: 0.0251 },
];

export interface CrystalDiffractionPanelProps {
  readonly document: CrystalDocument;
}

export default function CrystalDiffractionPanel({ document }: CrystalDiffractionPanelProps) {
  const [radiationId, setRadiationId] = useState<RadiationType>('xray');
  const [minD, setMinD] = useState('1.0');
  const radiation = RADIATIONS.find((item) => item.id === radiationId) ?? RADIATIONS[0]!;

  const outcome = useMemo(() => {
    const minDSpacing = Number(minD);
    if (!Number.isFinite(minDSpacing) || minDSpacing <= 0) {
      return { error: 'Minimum d-spacing must be a positive number.' } as const;
    }
    try {
      const pattern = simulatePowderPattern(document.cell, {
        kind: radiation.id,
        wavelength: radiation.wavelength,
        minDSpacing,
        document,
      });
      return { pattern } as const;
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Powder simulation failed.' } as const;
    }
  }, [document.cell, radiation, minD]);

  return (
    <section className="crystal-structure-panel" data-testid="crystal-diffraction-panel" aria-labelledby="crystal-diffraction-heading">
      <div className="crystal-panel-heading">
        <div>
          <h3 id="crystal-diffraction-heading">Diffraction</h3>
          <p>Simulate a kinematic powder pattern from the current cell. All computation stays on this device.</p>
        </div>
      </div>

      <section className="crystal-editor-card" aria-labelledby="crystal-diffraction-controls-heading">
        <div className="crystal-editor-card__heading crystal-editor-card__heading--wrap">
          <div>
            <h4 id="crystal-diffraction-controls-heading">Radiation &amp; limits</h4>
            <label>
              Radiation
              <select
                data-testid="crystal-diffraction-radiation"
                value={radiationId}
                onChange={(event) => setRadiationId(event.target.value as RadiationType)}
              >
                {RADIATIONS.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              Minimum d-spacing (Å)
              <input
                data-testid="crystal-diffraction-mind"
                type="number"
                min="0.1"
                step="0.1"
                value={minD}
                onChange={(event) => setMinD(event.target.value)}
              />
            </label>
          </div>
        </div>

        {'error' in outcome ? (
          <p role="status" data-testid="crystal-diffraction-status">{outcome.error}</p>
        ) : (
          <div data-testid="crystal-diffraction-result">
            <p role="status" data-testid="crystal-diffraction-status">
              {outcome.pattern.reflections.length.toLocaleString()} reflections · {radiation.name} · λ = {radiation.wavelength} Å · {outcome.pattern.intensityModel === 'structure-factor' ? '|F|²-weighted' : 'kinematic'} intensities
            </p>
            <svg
              data-testid="crystal-diffraction-plot"
              role="img"
              aria-label="Powder diffraction stick pattern"
              viewBox="0 0 600 220"
              style={{ width: '100%', height: 'auto', background: '#ffffff', border: '1px solid #d0d0d0' }}
            >
              <line x1="0" y1="200" x2="600" y2="200" stroke="#888888" />
              {(() => {
                const maxTwoTheta = Math.max(...outcome.pattern.reflections.map((r) => r.twoTheta), 1);
                const maxIntensity = Math.max(...outcome.pattern.reflections.map((r) => r.intensity), 1);
                return outcome.pattern.reflections.map((r) => {
                  const x = (r.twoTheta / maxTwoTheta) * 590 + 5;
                  const height = (r.intensity / maxIntensity) * 180;
                  return (
                    <line
                      key={r.hkl.join(',')}
                      x1={x}
                      y1={200}
                      x2={x}
                      y2={200 - height}
                      stroke="#1a5276"
                      strokeWidth="2"
                    >
                      <title>({r.hkl.join(' ')}) 2θ = {r.twoTheta.toFixed(2)}°</title>
                    </line>
                  );
                });
              })()}
            </svg>
            <table data-testid="crystal-diffraction-table">
              <thead>
                <tr><th>h k l</th><th>d (Å)</th><th>2θ (°)</th><th>Intensity</th><th>Multiplicity</th></tr>
              </thead>
              <tbody>
                {outcome.pattern.reflections.slice(0, 50).map((r) => (
                  <tr key={r.hkl.join(',')}>
                    <td>({r.hkl.join(' ')})</td>
                    <td>{r.d.toFixed(4)}</td>
                    <td>{r.twoTheta.toFixed(2)}</td>
                    <td>{r.intensity.toFixed(1)}</td>
                    <td>{r.multiplicity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {outcome.pattern.reflections.length > 50 ? (
              <p role="note">Showing the first 50 of {outcome.pattern.reflections.length.toLocaleString()} reflections.</p>
            ) : null}
          </div>
        )}
      </section>
    </section>
  );
}
