import { useMemo } from 'react';
import { firstBrillouinZone } from './brillouin-engine';
import { reflectionsInBraggRange } from './ewald-engine';
import { enumerateReflections } from './diffraction-engine';
import { stereographicProjection } from './stereographic-engine';
import type { CrystalDocument } from './crystal-types';

const COPPER_K_ALPHA = 1.5406;
const POLE_MIN_D = 1.0;
const MAX_POLES = 400;

export interface CrystalReciprocalPanelProps {
  readonly document: CrystalDocument;
}

/**
 * Read-only reciprocal-space panel: stereographic pole figure, first
 * Brillouin-zone wireframe (orthographic projection along c*), and the Ewald
 * limiting-sphere status for Cu Kα. All inputs are the already-tested engines;
 * this component holds no crystallographic math of its own.
 */
export default function CrystalReciprocalPanel({ document }: CrystalReciprocalPanelProps) {
  const outcome = useMemo(() => {
    try {
      const reflections = enumerateReflections(document.cell, { minDSpacing: POLE_MIN_D, maxReflections: MAX_POLES });
      const poles = stereographicProjection(document.cell, reflections.map((reflection) => reflection.hkl));
      const zone = firstBrillouinZone(document.cell);
      const diffracting = reflectionsInBraggRange(document.cell, { wavelength: COPPER_K_ALPHA, minDSpacing: POLE_MIN_D, maxReflections: MAX_POLES });
      return { poles, zone, diffracting } as const;
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Reciprocal-space analysis failed.' } as const;
    }
  }, [document.cell]);

  return (
    <section className="crystal-structure-panel" data-testid="crystal-reciprocal-panel" aria-labelledby="crystal-reciprocal-heading">
      <div className="crystal-panel-heading">
        <div>
          <h3 id="crystal-reciprocal-heading">Reciprocal space</h3>
          <p>Stereographic pole figure, first Brillouin zone, and Ewald limiting sphere. Computed locally from the current cell.</p>
        </div>
      </div>

      {'error' in outcome ? (
        <p role="status" data-testid="crystal-reciprocal-status">{outcome.error}</p>
      ) : (
        <section className="crystal-editor-card" aria-labelledby="crystal-reciprocal-views-heading">
          <div className="crystal-editor-card__heading crystal-editor-card__heading--wrap">
            <div>
              <h4 id="crystal-reciprocal-views-heading">Projections</h4>
            </div>
          </div>
          <p role="status" data-testid="crystal-reciprocal-status">
            {outcome.poles.length.toLocaleString()} poles · zone volume {outcome.zone.volume.toPrecision(4)} Å⁻³ · {outcome.diffracting.length.toLocaleString()} reflections inside the Cu Kα limiting sphere
          </p>
          <div className="crystal-reciprocal-views">
            <svg
              data-testid="crystal-pole-figure"
              role="img"
              aria-label="Stereographic pole figure"
              viewBox="-110 -110 220 220"
              style={{ width: '100%', maxWidth: 320, height: 'auto', background: '#ffffff', border: '1px solid #d0d0d0' }}
            >
              <circle cx="0" cy="0" r="100" fill="none" stroke="#888888" />
              <line x1="-100" y1="0" x2="100" y2="0" stroke="#dddddd" />
              <line x1="0" y1="-100" x2="0" y2="100" stroke="#dddddd" />
              {outcome.poles.map((pole) => (
                <circle key={pole.hkl.join(',')} cx={pole.x * 100} cy={-pole.y * 100} r="2.5" fill="#1a5276">
                  <title>({pole.hkl.join(' ')})</title>
                </circle>
              ))}
            </svg>
            <svg
              data-testid="crystal-bz-wireframe"
              role="img"
              aria-label="First Brillouin zone wireframe"
              viewBox="-110 -110 220 220"
              style={{ width: '100%', maxWidth: 320, height: 'auto', background: '#ffffff', border: '1px solid #d0d0d0' }}
            >
              {(() => {
                const extent = Math.max(1e-9, ...outcome.zone.vertices.map((v) => Math.max(Math.abs(v[0]), Math.abs(v[1]))));
                const scale = 95 / extent;
                return outcome.zone.faces.flatMap((face) =>
                  face.map((from, index) => {
                    const to = face[(index + 1) % face.length]!;
                    const a = outcome.zone.vertices[from]!;
                    const b = outcome.zone.vertices[to]!;
                    return (
                      <line
                        key={`${index}-${face[0]}`}
                        x1={a[0] * scale}
                        y1={-a[1] * scale}
                        x2={b[0] * scale}
                        y2={-b[1] * scale}
                        stroke="#7d3c98"
                        strokeWidth="1.5"
                      />
                    );
                  }),
                );
              })()}
            </svg>
          </div>
        </section>
      )}
    </section>
  );
}
