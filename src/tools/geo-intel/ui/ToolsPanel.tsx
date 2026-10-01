import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { antipode, encodeGeohash, formatDD, formatDDM, formatDMS, formatUtm, toMaidenhead, toMgrs } from '../core/coords';
import { bboxAreaKm2, compassPoint, distanceKm, finalBearing, initialBearing, midpoint } from '../core/geodesy';
import { decode, describeArea, encode, isFull, isShort, recoverNearest, shorten } from '../core/olc';
import { parseQuery } from '../core/query-parser';
import type { BBox, LatLon } from '../core/types';
import { WB_INDICATORS } from '../adapters/statistics';
import type { Legend } from '../render/scene';
import { formatArea, formatDistance, type Units } from './format';
import type { MapMode } from './MapCanvas';

export interface NamedPoint { id: string; label: string; point: LatLon }

function CopyRow({ label, value, tip, onCopy }: { label: string; value: string; tip: string; onCopy: (text: string, what: string) => void }) {
  return (
    <div className="gi-row">
      <dt data-tip={tip} tabIndex={0}>{label}</dt>
      <dd><code className="gi-value">{value}</code><button type="button" className="gi-prov" aria-label={`Copy ${label}`} data-tip={`Copy ${label}`} onClick={() => onCopy(value, label)}><Icon name="copy" /></button></dd>
    </div>
  );
}

export function allFormats(point: LatLon): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [
    ['Decimal degrees', formatDD(point), 'Latitude, longitude in signed decimal degrees (WGS 84).'],
    ['DMS', formatDMS(point), 'Degrees, minutes and seconds with hemisphere letters.'],
    ['DDM', formatDDM(point), 'Degrees and decimal minutes (common on GPS units and charts).'],
    ['Plus Code', encode(point.lat, point.lon, 11), 'Open Location Code at 11 digits (≈3 m cell).'],
    ['Geohash', encodeGeohash(point, 9), 'Geohash at 9 characters (≈5 m cell); search it as “gh:…”.'],
    ['Maidenhead', toMaidenhead(point, 4), 'IARU locator for amateur radio; search it as “grid:…”.'],
    ['Antipode', formatDD(antipode(point)), 'The point on the exact opposite side of the Earth.'],
  ];
  if (point.lat >= -80 && point.lat <= 84) {
    out.push(['UTM', formatUtm(point), 'Universal Transverse Mercator: zone, latitude band, easting and northing in metres.']);
    out.push(['MGRS', toMgrs(point, 5), 'Military Grid Reference System at 1 m precision.']);
  } else out.push(['UTM / MGRS', 'Not defined beyond 80°S / 84°N (polar UPS)', 'UTM and MGRS stop at 80°S and 84°N; polar areas use UPS.']);
  return out;
}

interface ToolsProps {
  current: NamedPoint | null;
  candidates: NamedPoint[];
  units: Units;
  mode: MapMode;
  measure: { a: LatLon | null; b: LatLon | null };
  box: BBox | null;
  choropleth: { indicator: string; active: boolean; loading: boolean; legend: Legend | null; error: string | null };
  onMode: (mode: MapMode) => void;
  onMeasure: (slot: 'a' | 'b', point: LatLon | null) => void;
  onBox: (box: BBox | null) => void;
  onLookup: (point: LatLon) => void;
  onCopy: (text: string, what: string) => void;
  onChoropleth: (indicator: string, active: boolean) => void;
  onArc: (arc: { from: LatLon; to: LatLon } | null) => void;
}

export function ToolsPanel(props: ToolsProps) {
  const { current, units } = props;
  const [convertText, setConvertText] = useState('');
  const converted = useMemo(() => {
    if (!convertText.trim()) return null;
    const parsed = parseQuery(convertText);
    if ('point' in parsed) return { point: parsed.point, detail: parsed.detail };
    if (parsed.kind === 'invalid') return { error: parsed.error };
    return { error: parsed.kind === 'postal' || parsed.kind === 'place' ? 'That looks like a place or postal code — use the main search bar.' : 'Short Plus Codes need a reference; use the Plus Code tool below.' };
  }, [convertText]);

  const [plusText, setPlusText] = useState('');
  const [plusLength, setPlusLength] = useState(11);
  const plusDecoded = useMemo(() => {
    const code = plusText.trim().toUpperCase();
    if (!code) return null;
    try {
      if (isFull(code)) return { code, area: decode(code) };
      if (isShort(code)) {
        if (!current) return { error: 'Resolve a location first: short codes are recovered relative to it.' };
        const full = recoverNearest(code, current.point.lat, current.point.lon);
        return { code: full, area: decode(full), recovered: true };
      }
      return { error: 'Not a valid Plus Code.' };
    } catch (error) { return { error: (error as Error).message }; }
  }, [plusText, current]);

  const [slotA, setSlotA] = useState('current');
  const [slotB, setSlotB] = useState('map');
  const resolveSlot = (slot: string, fallback: LatLon | null) => (slot === 'map' ? fallback : props.candidates.find((item) => item.id === slot)?.point ?? (slot === 'current' ? current?.point ?? null : null));
  const a = resolveSlot(slotA, props.measure.a);
  const b = resolveSlot(slotB, props.measure.b);
  const distance = a && b ? { km: distanceKm(a, b), initial: initialBearing(a, b), final: finalBearing(a, b), mid: midpoint(a, b) } : null;
  const { onArc } = props;
  const arcKey = a && b ? `${a.lat},${a.lon},${b.lat},${b.lon}` : '';
  // Keyed on the coordinates: `a` and `b` are new objects on every render.
  useEffect(() => { onArc(a && b ? { from: a, to: b } : null); }, [arcKey, onArc]);

  const [boxInput, setBoxInput] = useState({ south: '', west: '', north: '', east: '' });
  const applyBox = () => {
    if (Object.values(boxInput).some((v) => v.trim() === '')) return;
    const values = Object.fromEntries(Object.entries(boxInput).map(([k, v]) => [k, Number(v)])) as unknown as BBox;
    if ([values.south, values.north].some((v) => !Number.isFinite(v) || Math.abs(v) > 90) || [values.west, values.east].some((v) => !Number.isFinite(v) || Math.abs(v) > 180) || values.south >= values.north) return;
    props.onBox(values);
  };

  return (
    <div className="gi-tools" data-testid="gi-tools">
      <section className="gi-card" aria-labelledby="gi-conv-title">
        <h3 id="gi-conv-title" data-tip="Paste any coordinate notation and get every other notation" tabIndex={0}>Coordinate converter</h3>
        <label className="gi-field"><span>Coordinate in any format</span>
          <input value={convertText} onChange={(event) => setConvertText(event.target.value)} placeholder={current ? formatDMS(current.point) : '40°26′46″N 79°58′56″W'} data-tip="Decimal degrees, DMS, DDM, UTM, MGRS, full Plus Codes, geo: URIs or map links" />
        </label>
        {!convertText && current ? <p className="gi-muted">Showing the current location.</p> : null}
        {converted && 'error' in converted ? <p className="gi-error" role="alert">{converted.error}</p> : null}
        {(converted ? 'point' in converted : !!current) ? (() => {
          const point = (converted && 'point' in converted ? converted.point : current?.point) as LatLon;
          return (
            <>
              <dl className="gi-rows">{allFormats(point).map(([label, value, tip]) => <CopyRow key={label} label={label} value={value} tip={tip} onCopy={props.onCopy} />)}</dl>
              {converted && 'point' in converted ? <div className="gi-actions"><button type="button" className="gi-btn primary" onClick={() => props.onLookup(point)} data-tip="Build a full location profile for this coordinate">Look up this point</button></div> : null}
            </>
          );
        })() : null}
      </section>

      <section className="gi-card" aria-labelledby="gi-plus-title">
        <h3 id="gi-plus-title" data-tip="Open Location Code, computed offline" tabIndex={0}>Plus Codes</h3>
        {current ? (
          <div className="gi-inline">
            <label className="gi-field compact"><span>Length</span>
              <select value={plusLength} onChange={(event) => setPlusLength(Number(event.target.value))} data-tip="More digits = smaller cell">
                {[4, 6, 8, 10, 11, 12, 13].map((n) => <option key={n} value={n}>{n} digits</option>)}
              </select>
            </label>
            <code className="gi-big">{encode(current.point.lat, current.point.lon, plusLength)}</code>
            <button type="button" className="gi-btn" onClick={() => props.onCopy(encode(current.point.lat, current.point.lon, plusLength), 'Plus Code')} data-tip="Copy this Plus Code">Copy</button>
          </div>
        ) : null}
        {current ? (() => {
          try {
            const full = encode(current.point.lat, current.point.lon, 10);
            return <p className="gi-muted">Cell {describeArea(decode(full))}. Short form near {current.label.split(',')[0]}: <code>{shorten(full, current.point.lat, current.point.lon)}</code></p>;
          } catch { return null; }
        })() : null}
        <label className="gi-field"><span>Decode a Plus Code</span>
          <input value={plusText} onChange={(event) => setPlusText(event.target.value)} placeholder="8FW4V75V+9R or V75V+9R" data-tip="Full codes decode anywhere; short codes are recovered near the current location" />
        </label>
        {plusDecoded && 'error' in plusDecoded ? <p className="gi-error" role="alert">{plusDecoded.error}</p> : null}
        {plusDecoded && 'area' in plusDecoded && plusDecoded.area ? (
          <>
            <dl className="gi-rows">
              <CopyRow label="Full code" value={plusDecoded.code} tip={plusDecoded.recovered ? 'Recovered relative to the current location' : 'As entered'} onCopy={props.onCopy} />
              <CopyRow label="Centre" value={formatDD({ lat: plusDecoded.area.latitudeCenter, lon: plusDecoded.area.longitudeCenter })} tip="Centre of the code's cell" onCopy={props.onCopy} />
              <CopyRow label="South-west" value={formatDD({ lat: plusDecoded.area.latitudeLo, lon: plusDecoded.area.longitudeLo })} tip="Lower-left corner of the cell" onCopy={props.onCopy} />
              <CopyRow label="North-east" value={formatDD({ lat: plusDecoded.area.latitudeHi, lon: plusDecoded.area.longitudeHi })} tip="Upper-right corner of the cell" onCopy={props.onCopy} />
              <div className="gi-row"><dt>Cell size</dt><dd>{describeArea(plusDecoded.area)}</dd></div>
            </dl>
            <div className="gi-actions"><button type="button" className="gi-btn primary" onClick={() => props.onLookup({ lat: plusDecoded.area.latitudeCenter, lon: plusDecoded.area.longitudeCenter })}>Look up this cell</button></div>
          </>
        ) : null}
      </section>

      <section className="gi-card" aria-labelledby="gi-dist-title">
        <h3 id="gi-dist-title" data-tip="Great-circle distance on a sphere of mean Earth radius (±0.5% vs. the WGS 84 ellipsoid)" tabIndex={0}>Distance & bearing</h3>
        <div className="gi-inline">
          {(['a', 'b'] as const).map((slot) => (
            <label key={slot} className="gi-field compact"><span>Point {slot.toUpperCase()}</span>
              <select value={slot === 'a' ? slotA : slotB} onChange={(event) => (slot === 'a' ? setSlotA : setSlotB)(event.target.value)} data-tip="Choose a resolved location, or “Clicked on map” and use Measure mode">
                <option value="current" disabled={!current}>Current location</option>
                {props.candidates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                <option value="map">Clicked on map ({slot.toUpperCase()})</option>
              </select>
            </label>
          ))}
        </div>
        <div className="gi-actions">
          <button type="button" className="gi-btn" aria-pressed={props.mode === 'measure'} onClick={() => props.onMode(props.mode === 'measure' ? 'select' : 'measure')} data-tip="While on, map clicks set point A then point B instead of looking up places">{props.mode === 'measure' ? 'Measuring… (click map)' : 'Measure on map'}</button>
          <button type="button" className="gi-btn" onClick={() => { props.onMeasure('a', null); props.onMeasure('b', null); }} disabled={!props.measure.a && !props.measure.b}>Clear points</button>
        </div>
        {distance ? (
          <dl className="gi-rows" data-testid="gi-distance">
            <div className="gi-row"><dt data-tip="Shortest path over the Earth's surface">Distance</dt><dd><strong>{formatDistance(distance.km, units)}</strong></dd></div>
            <div className="gi-row"><dt data-tip="Direction to set off in, clockwise from true north">Initial bearing</dt><dd>{distance.initial.toFixed(1)}° ({compassPoint(distance.initial)})</dd></div>
            <div className="gi-row"><dt data-tip="Direction of travel on arrival">Final bearing</dt><dd>{distance.final.toFixed(1)}° ({compassPoint(distance.final)})</dd></div>
            <div className="gi-row"><dt data-tip="Halfway point along the great circle">Midpoint</dt><dd><button type="button" className="gi-link" onClick={() => props.onLookup(distance.mid)}>{formatDD(distance.mid, 4)}</button></dd></div>
          </dl>
        ) : <p className="gi-muted">Pick two points{props.mode === 'measure' ? ' — click the map' : ''}.</p>}
      </section>

      <section className="gi-card" aria-labelledby="gi-box-title">
        <h3 id="gi-box-title" data-tip="Exact spherical area of a latitude/longitude rectangle" tabIndex={0}>Bounding box & area</h3>
        <div className="gi-actions">
          <button type="button" className="gi-btn" aria-pressed={props.mode === 'box'} onClick={() => props.onMode(props.mode === 'box' ? 'select' : 'box')} data-tip="While on, drag on the map to draw a box">{props.mode === 'box' ? 'Drawing… (drag on map)' : 'Draw on map'}</button>
          <button type="button" className="gi-btn" onClick={() => props.onBox(null)} disabled={!props.box}>Clear box</button>
        </div>
        <div className="gi-grid4">
          {(['north', 'west', 'east', 'south'] as const).map((edge) => (
            <label key={edge} className="gi-field compact"><span>{edge[0].toUpperCase() + edge.slice(1)}</span>
              <input inputMode="decimal" value={boxInput[edge]} placeholder={props.box ? props.box[edge].toFixed(4) : edge === 'north' || edge === 'south' ? 'lat' : 'lon'} onChange={(event) => setBoxInput({ ...boxInput, [edge]: event.target.value })} />
            </label>
          ))}
        </div>
        <div className="gi-actions"><button type="button" className="gi-btn" onClick={applyBox} data-tip="Draw the box from the four edges (degrees)">Apply edges</button></div>
        {props.box ? (
          <dl className="gi-rows" data-testid="gi-area">
            <div className="gi-row"><dt>Area</dt><dd><strong>{formatArea(bboxAreaKm2(props.box), units)}</strong></dd></div>
            <div className="gi-row"><dt>Edges (S, W, N, E)</dt><dd><code>{[props.box.south, props.box.west, props.box.north, props.box.east].map((v) => v.toFixed(4)).join(', ')}</code></dd></div>
            <div className="gi-row"><dt>Width × height</dt><dd>{formatDistance(distanceKm({ lat: (props.box.north + props.box.south) / 2, lon: props.box.west }, { lat: (props.box.north + props.box.south) / 2, lon: props.box.east }), units)} × {formatDistance(distanceKm({ lat: props.box.south, lon: props.box.west }, { lat: props.box.north, lon: props.box.west }), units)}</dd></div>
          </dl>
        ) : null}
      </section>

      <section className="gi-card" aria-labelledby="gi-choro-title">
        <h3 id="gi-choro-title" data-tip="Colour every country by one World Bank indicator (one request, cached 7 days)" tabIndex={0}>Country choropleth</h3>
        <div className="gi-inline">
          <label className="gi-field compact"><span>Indicator</span>
            <select value={props.choropleth.indicator} onChange={(event) => props.onChoropleth(event.target.value, props.choropleth.active)}>
              {WB_INDICATORS.map((item) => <option key={item.id} value={item.id}>{item.label.replace(' (country)', '')}</option>)}
            </select>
          </label>
          <button type="button" className="gi-btn" aria-pressed={props.choropleth.active} disabled={props.choropleth.loading} onClick={() => props.onChoropleth(props.choropleth.indicator, !props.choropleth.active)}>{props.choropleth.loading ? 'Loading…' : props.choropleth.active ? 'Hide' : 'Show on map'}</button>
        </div>
        {props.choropleth.error ? <p className="gi-error" role="alert">{props.choropleth.error}</p> : null}
        {props.choropleth.active && props.choropleth.legend ? (
          <div className="gi-legend" aria-label="Choropleth legend">
            <p><strong>{props.choropleth.legend.title}</strong></p>
            <ul>{props.choropleth.legend.stops.map((stop) => <li key={stop.label}><span style={{ background: stop.color }} aria-hidden="true" />{stop.label}</li>)}</ul>
            <p className="gi-muted">{props.choropleth.legend.note} Source: <a href="https://data.worldbank.org/" target="_blank" rel="noreferrer">World Bank</a> (CC BY 4.0)</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
