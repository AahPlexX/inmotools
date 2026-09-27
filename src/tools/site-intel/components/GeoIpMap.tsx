import { useEffect, useMemo, useState } from 'react';
import type { IpIntel } from '../network-engine';

interface GeoIpMapProps {
  readonly intel: IpIntel[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function GeoIpMap({ intel }: GeoIpMapProps) {
  const points = useMemo(
    () => intel.filter((item) =>
      typeof item.latitude === 'number'
      && Number.isFinite(item.latitude)
      && item.latitude >= -90
      && item.latitude <= 90
      && typeof item.longitude === 'number'
      && Number.isFinite(item.longitude)
      && item.longitude >= -180
      && item.longitude <= 180),
    [intel],
  );
  const [selectedIp, setSelectedIp] = useState<string | null>(points[0]?.ip ?? null);

  useEffect(() => {
    if (points.length === 0) {
      setSelectedIp(null);
      return;
    }
    if (!points.some((point) => point.ip === selectedIp)) setSelectedIp(points[0].ip);
  }, [points, selectedIp]);

  const selected = points.find((point) => point.ip === selectedIp) ?? points[0] ?? null;

  return (
    <div className="geoip-map-card">
      <div className="geoip-map" role="region" aria-label="GeoIP distribution map">
        <div className="geoip-map-grid" aria-hidden="true" />
        <span className="geoip-map-axis geoip-map-axis-north" aria-hidden="true">90°N</span>
        <span className="geoip-map-axis geoip-map-axis-south" aria-hidden="true">90°S</span>
        <span className="geoip-map-axis geoip-map-axis-west" aria-hidden="true">180°W</span>
        <span className="geoip-map-axis geoip-map-axis-east" aria-hidden="true">180°E</span>
        {points.map((point) => {
          const left = clamp(((point.longitude! + 180) / 360) * 100, 0, 100);
          const top = clamp(((90 - point.latitude!) / 180) * 100, 0, 100);
          const location = [point.city, point.country].filter(Boolean).join(', ') || 'Unknown location';
          return (
            <button
              key={point.ip}
              type="button"
              className={`geoip-map-point ${selectedIp === point.ip ? 'selected' : ''}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              aria-label={`${point.ip} — ${location}`}
              aria-pressed={selectedIp === point.ip}
              onClick={() => setSelectedIp(point.ip)}
            >
              <span aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {selected ? (
        <p className="geoip-map-detail" role="status">
          <strong>{selected.ip}</strong>
          {' · '}
          {[selected.city, selected.country].filter(Boolean).join(', ') || 'Unknown location'}
          {selected.asn ? ` · ${selected.asn}` : ''}
          {selected.organization ? ` · ${selected.organization}` : ''}
        </p>
      ) : (
        <p className="geoip-map-detail">No geographic coordinates were returned for the resolved IP addresses.</p>
      )}
    </div>
  );
}
