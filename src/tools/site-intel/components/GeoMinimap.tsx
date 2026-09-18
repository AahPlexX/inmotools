// Feature 13 (map UI) — lightweight equirectangular GeoIP minimap.
// No coastline/land-outline data is bundled with this app (verified: no
// existing world-map asset in the repo to reuse), so this deliberately draws
// an honest lat/long graticule rather than fabricating unverified coastline
// geometry. Points are the same IpIntel coordinates already fetched for the
// hosting/ASN profile — no extra network calls.

import { useState } from 'react';
import type { IpIntel } from '../network-engine';

const WIDTH = 480;
const HEIGHT = 240;

function project(lat: number, lon: number): { x: number; y: number } {
  return { x: ((lon + 180) / 360) * WIDTH, y: ((90 - lat) / 180) * HEIGHT };
}

export function GeoMinimap({ points }: { points: IpIntel[] }) {
  type PlottedIntel = IpIntel & { latitude: number; longitude: number };
  const [selected, setSelected] = useState<PlottedIntel | null>(null);
  const plottable = points.filter((p): p is PlottedIntel => p.latitude !== null && p.longitude !== null);

  if (plottable.length === 0) {
    return <p className="geo-minimap-empty">No geolocated coordinates available yet.</p>;
  }

  const meridians = [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180];
  const parallels = [-90, -60, -30, 0, 30, 60, 90];

  return (
    <div className="geo-minimap-container">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="geo-minimap" role="img" aria-label="GeoIP minimap of resolved server locations">
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} className="geo-minimap-ocean" />
        {meridians.map((lon) => <line key={`lon-${lon}`} x1={project(90, lon).x} y1={0} x2={project(-90, lon).x} y2={HEIGHT} className={lon === 0 ? 'geo-minimap-meridian' : 'geo-minimap-graticule'} />)}
        {parallels.map((lat) => <line key={`lat-${lat}`} x1={0} y1={project(lat, -180).y} x2={WIDTH} y2={project(lat, -180).y} className={lat === 0 ? 'geo-minimap-equator' : 'geo-minimap-graticule'} />)}
        {plottable.map((p) => {
          const { x, y } = project(p.latitude, p.longitude);
          const label = `${p.ip}${p.city ? `, ${p.city}` : ''}${p.country ? `, ${p.country}` : ''}`;
          return (
            <g
              key={p.ip}
              className="geo-minimap-marker-group"
              tabIndex={0}
              role="button"
              aria-label={label}
              onClick={() => setSelected(p)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(p); } }}
            >
              <circle cx={x} cy={y} r={selected?.ip === p.ip ? 6 : 4.5} className="geo-minimap-marker" />
            </g>
          );
        })}
      </svg>
      {selected ? (
        <div className="geo-minimap-inspector" role="status">
          <strong>{selected.ip}</strong>
          <p>{[selected.city, selected.country].filter(Boolean).join(', ') || 'Unknown location'}</p>
          <p>{selected.organization ?? 'Unknown organization'}{selected.asn ? ` (${selected.asn})` : ''}</p>
          <p>{selected.latitude.toFixed(2)}, {selected.longitude.toFixed(2)}</p>
          <button type="button" onClick={() => setSelected(null)}>Close</button>
        </div>
      ) : (
        <p className="geo-minimap-hint">Select a marker to inspect its location and hosting details.</p>
      )}
    </div>
  );
}
