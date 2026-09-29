import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { Icon } from './Icon';
import { SOURCES } from '../core/sources';
import { abbreviation, formatOffset, offsetMinutes } from '../core/timezone';
import { FIELD_GROUP_LABELS, type FieldGroup, type LocationProfile, type ProfileField } from '../core/types';
import type { BoundaryLayer } from '../adapters/boundaries';
import { boundaryAttribution } from '../adapters/boundaries';
import { CONFIDENCE_HELP, CONFIDENCE_LABEL, displayValue, formatDistance, formatTime, type Units } from './format';
import { useLongPress, useNow } from './hooks';
import type { NearbyPlace } from '../offline/static-data';
import { sourcesFor } from '../export/formats';

export function fieldHelp(item: ProfileField): string {
  const source = SOURCES[item.source]?.name ?? item.source;
  return `${item.label} — ${source}${item.reference_year ? `, ${item.reference_year}` : ''}. ${item.note ?? CONFIDENCE_HELP[item.confidence_class] ?? ''}`.trim();
}

export function FieldRow({ item, zone, units, onInspect }: { item: ProfileField; zone: string | null; units: Units; onInspect: (key: string) => void }) {
  return (
    <div className="gi-row" data-field={item.key}>
      <dt data-tip={fieldHelp(item)}>{item.label}</dt>
      <dd>
        <span className="gi-value">{displayValue(item, zone, units)}</span>
        {item.reference_year ? <span className="gi-year">{item.reference_year}</span> : null}
        <button type="button" className="gi-prov" aria-label={`Provenance for ${item.label}`} data-tip={`${fieldHelp(item)} Press for the full record.`} onClick={() => onInspect(item.key)}><Icon name="info" /></button>
      </dd>
    </div>
  );
}

function Card({ title, tip, children, id }: { title: string; tip: string; children: ReactNode; id: string }) {
  return (
    <section className="gi-card" aria-labelledby={`gi-card-${id}`}>
      <h3 id={`gi-card-${id}`} data-tip={tip}>{title}</h3>
      {children}
    </section>
  );
}

const GROUP_TIPS: Record<FieldGroup, string> = {
  location: 'The resolved coordinate and how precise it is.',
  address: 'Address parts from the postal or geocoding source.',
  admin: 'Administrative areas that contain the point.',
  country: 'Country facts from the bundled GeoNames/Natural Earth/Wikidata table (works offline).',
  population: 'Population figures, each labelled with the geography it actually describes.',
  indicators: 'Latest World Bank World Development Indicators for the country.',
  eu: 'Eurostat statistics for the NUTS regions containing the point (EU, EFTA and candidate countries).',
  timezone: 'IANA time zone from bundled boundaries; offsets from this browser’s time-zone database.',
  solar: 'Sun and twilight times for the location’s local date.',
  elevation: 'Terrain height from a gridded elevation model.',
  holidays: 'Public holidays from Nager.Date for the local year.',
  codes: 'The same coordinate in other notations.',
};

export function LiveClock({ zone }: { zone: string }) {
  const now = useNow(1000);
  let time = '—'; let date = '';
  try {
    time = new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now);
    date = new Intl.DateTimeFormat(undefined, { timeZone: zone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now);
  } catch { /* invalid zone */ }
  const offset = formatOffset(offsetMinutes(zone, now));
  return (
    <div className="gi-clock" data-tip="Current local time at this location, updated every second from your device clock (works offline)." tabIndex={0}>
      <span className="gi-clock-time" aria-live="off">{time}</span>
      <span className="gi-clock-meta">{date} · {abbreviation(zone, now)} · {offset}</span>
    </div>
  );
}

function DaylightBar({ profile }: { profile: LocationProfile }) {
  const s = profile.solar;
  if (!s || !s.solarNoon) return null;
  const zone = profile.timezone;
  const dayStart = new Date(s.solarNoon).getTime() - 12 * 3_600_000;
  const pct = (iso: string | null) => (iso ? Math.max(0, Math.min(100, ((new Date(iso).getTime() - dayStart) / 86_400_000) * 100)) : null);
  const segments: Array<{ cls: string; from: number | null; to: number | null; label: string }> = [
    { cls: 'astro', from: pct(s.astronomicalDawn), to: pct(s.nauticalDawn), label: 'Astronomical twilight' },
    { cls: 'nautical', from: pct(s.nauticalDawn), to: pct(s.civilDawn), label: 'Nautical twilight' },
    { cls: 'blue', from: pct(s.blueMorning?.[0] ?? s.civilDawn), to: pct(s.blueMorning?.[1] ?? s.sunrise), label: 'Blue hour' },
    { cls: 'golden', from: pct(s.goldenMorning?.[0] ?? null), to: pct(s.goldenMorning?.[1] ?? null), label: 'Golden hour' },
    { cls: 'day', from: pct(s.sunrise), to: pct(s.sunset), label: 'Daylight' },
    { cls: 'golden', from: pct(s.goldenEvening?.[0] ?? null), to: pct(s.goldenEvening?.[1] ?? null), label: 'Golden hour' },
    { cls: 'blue', from: pct(s.blueEvening?.[0] ?? s.sunset), to: pct(s.blueEvening?.[1] ?? s.civilDusk), label: 'Blue hour' },
    { cls: 'nautical', from: pct(s.civilDusk), to: pct(s.nauticalDusk), label: 'Nautical twilight' },
    { cls: 'astro', from: pct(s.nauticalDusk), to: pct(s.astronomicalDusk), label: 'Astronomical twilight' },
  ];
  const all = s.status === 'polar_day' ? 'day' : s.status === 'polar_night' ? 'night' : null;
  return (
    <div className="gi-daylight" role="img" aria-label={`Daylight chart around solar noon. Sunrise ${formatTime(s.sunrise, zone)}, sunset ${formatTime(s.sunset, zone)}.`}>
      <div className={`gi-daylight-track ${all ? `is-${all}` : ''}`}>
        {!all ? segments.filter((seg) => seg.from !== null && seg.to !== null && seg.to > seg.from).map((seg, i) => (
          <span key={i} className={`gi-seg ${seg.cls}`} style={{ left: `${seg.from}%`, width: `${(seg.to as number) - (seg.from as number)}%` }} data-tip={seg.label} />
        )) : null}
        <span className="gi-noon" style={{ left: '50%' }} data-tip={`Solar noon ${formatTime(s.solarNoon, zone)}`} />
      </div>
      <div className="gi-daylight-scale" aria-hidden="true"><span>−12 h</span><span>Solar noon</span><span>+12 h</span></div>
    </div>
  );
}

const MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, i, 1))));

function HolidaysCard({ profile, onExportIcs, onExportCsv, onYear }: { profile: LocationProfile; onExportIcs: () => void; onExportCsv: () => void; onYear: (year: number) => void }) {
  const [month, setMonth] = useState<number | 'all'>('all');
  const calendar = profile.holidays;
  if (!calendar) return null;
  const items = calendar.items.filter((item) => month === 'all' || Number(item.date.slice(5, 7)) === month + 1);
  return (
    <Card id="holidays" title={`Public holidays ${calendar.year}`} tip={GROUP_TIPS.holidays}>
      <div className="gi-inline">
        <button type="button" className="gi-btn small" onClick={() => onYear(calendar.year - 1)} aria-label={`Holidays for ${calendar.year - 1}`} data-tip="Previous year">‹ {calendar.year - 1}</button>
        <button type="button" className="gi-btn small" onClick={() => onYear(calendar.year + 1)} aria-label={`Holidays for ${calendar.year + 1}`} data-tip="Next year">{calendar.year + 1} ›</button>
      </div>
      <div className="gi-chips" role="group" aria-label="Filter holidays by month">
        <button type="button" aria-pressed={month === 'all'} onClick={() => setMonth('all')}>All</button>
        {MONTHS.map((label, i) => <button key={label} type="button" aria-pressed={month === i} onClick={() => setMonth(i)} data-tip={`Holidays in ${label}`}>{label}</button>)}
      </div>
      {items.length ? (
        <ul className="gi-holidays">
          {items.map((item) => (
            <li key={`${item.date}-${item.name}`}>
              <time dateTime={item.date}>{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${item.date}T00:00:00Z`))}</time>
              <span>{item.name}{item.localName !== item.name ? <em> · {item.localName}</em> : null}</span>
              {!item.global ? <span className="gi-badge" data-tip={`Regional: ${(item.counties ?? []).join(', ')}`}>Regional</span> : null}
            </li>
          ))}
        </ul>
      ) : <p className="gi-muted">No public holidays in this month.</p>}
      <div className="gi-actions">
        <button type="button" className="gi-btn" onClick={onExportIcs} data-tip="Download an iCalendar (.ics) file you can import into any calendar app">Download .ics</button>
        <button type="button" className="gi-btn" onClick={onExportCsv} data-tip="Download the holiday list as CSV">Download CSV</button>
      </div>
      <p className="gi-source">Source: <a href="https://date.nager.at/" target="_blank" rel="noreferrer">Nager.Date</a></p>
    </Card>
  );
}

export interface BoundaryState { level: 'ADM0' | 'ADM1' | 'ADM2' | null; loading: boolean; layer: BoundaryLayer | null; error: string | null; hit: string | null }

export interface ProfilePanelProps {
  profile: LocationProfile;
  units: Units;
  starred: boolean;
  pinned: boolean;
  nearby: NearbyPlace[];
  radiusKm: number;
  boundary: BoundaryState;
  onInspect: (key: string | null) => void;
  onCopy: (text: string, what: string) => void;
  onPin: () => void;
  onStar: () => void;
  onExport: () => void;
  onRefresh: () => void;
  onRadius: (km: number) => void;
  onLookupPlace: (place: NearbyPlace) => void;
  onBoundary: (level: 'ADM0' | 'ADM1' | 'ADM2' | null) => void;
  onExportIcs: () => void;
  onExportHolidayCsv: () => void;
  onMenu: (x: number, y: number) => void;
  onShare: () => void;
  onPickAlternative: (alt: { label: string; lat: number; lon: number }) => void;
  onCopySummary: () => void;
  onSolarDate: (date: string) => void;
  onHolidayYear: (year: number) => void;
}

export function ProfilePanel(props: ProfilePanelProps) {
  const { profile, units } = props;
  const grouped = useMemo(() => {
    const out = new Map<FieldGroup, ProfileField[]>();
    for (const item of profile.fields) out.set(item.group, [...(out.get(item.group) ?? []), item]);
    return out;
  }, [profile]);
  const lat = profile.fields.find((item) => item.key === 'location.lat');
  const country = profile.fields.find((item) => item.key === 'country.name');
  const longPress = useLongPress((x, y) => props.onMenu(x, y));
  const onContextMenu = (event: MouseEvent) => { event.preventDefault(); props.onMenu(event.clientX, event.clientY); };
  const coordText = `${profile.lat.toFixed(6)}, ${profile.lon.toFixed(6)}`;
  const rows = (group: FieldGroup, skip: string[] = []) => (grouped.get(group) ?? []).filter((item) => !skip.includes(item.key)).map((item) => <FieldRow key={item.key} item={item} zone={profile.timezone} units={units} onInspect={props.onInspect} />);
  const sections: Array<[FieldGroup, string[]]> = [['address', []], ['country', []], ['population', []], ['indicators', []], ['eu', []], ['timezone', []], ['solar', []], ['elevation', []], ['codes', []]];

  return (
    <div className="gi-profile" data-testid="gi-profile">
      <section className="gi-summary" aria-label="Resolved location" onContextMenu={onContextMenu} {...longPress}>
        <div className="gi-summary-head">
          <div>
            <p className="gi-kicker">{profile.countryCode ? <span className="gi-cc">{profile.countryCode}</span> : null}{country ? String(country.value) : 'No country'}</p>
            <h2 className="gi-title" data-testid="gi-profile-title">{profile.label}</h2>
            <p className="gi-coords">
              <button type="button" className="gi-link" onClick={() => props.onCopy(coordText, 'Coordinates')} data-tip="Copy latitude, longitude">{coordText}</button>
              {lat ? <span className={`gi-conf conf-${lat.confidence_class}`} data-tip={CONFIDENCE_HELP[lat.confidence_class]} tabIndex={0}>{CONFIDENCE_LABEL[lat.confidence_class]}</span> : null}
            </p>
          </div>
          {profile.timezone ? <LiveClock zone={profile.timezone} /> : null}
        </div>
        <div className="gi-actions">
          <button type="button" className="gi-btn primary" onClick={props.onExport} data-tip="Export JSON, CSV, PDF, iCal, PNG, SVG, social card or a ZIP bundle, with editable metadata">Export…</button>
          <button type="button" className="gi-btn" aria-pressed={props.pinned} onClick={props.onPin} data-tip="Add to the side-by-side comparison (up to 6)">{props.pinned ? 'In comparison' : 'Compare'}</button>
          <button type="button" className="gi-btn" aria-pressed={props.starred} onClick={props.onStar} data-tip="Starred locations are never removed from history"><Icon name={props.starred ? 'star' : 'starOutline'} />{props.starred ? 'Starred' : 'Star'}</button>
          <button type="button" className="gi-btn" onClick={() => props.onInspect(null)} data-tip="Open the provenance inspector for every value">Provenance</button>
          <button type="button" className="gi-btn" onClick={props.onShare} data-tip="Copy a link that re-runs this lookup (nothing is uploaded; the link holds only the query)">Share link</button>
          <button type="button" className="gi-btn" onClick={props.onCopySummary} data-tip="Copy a short plain-text summary for notes or messages">Copy summary</button>
          <button type="button" className="gi-btn" onClick={props.onRefresh} data-tip="Look this location up again (cached answers are reused until they expire)">Refresh</button>
        </div>
        {profile.alternatives?.length ? (
          <div className="gi-alternatives">
            <p>Not the right place? Other matches:</p>
            <div className="gi-chips">{profile.alternatives.map((alt) => <button key={`${alt.lat},${alt.lon}`} type="button" onClick={() => props.onPickAlternative(alt)} data-tip={`${alt.lat.toFixed(4)}, ${alt.lon.toFixed(4)}`}>{alt.label}</button>)}</div>
          </div>
        ) : null}
        {profile.warnings.length ? (
          <details className="gi-warnings">
            <summary>{profile.warnings.length} note{profile.warnings.length === 1 ? '' : 's'} about this result</summary>
            <ul>{profile.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </details>
        ) : null}
      </section>

      <div className="gi-cards">
        {profile.adminChain.length ? (
          <Card id="admin" title="Administrative hierarchy" tip={GROUP_TIPS.admin}>
            <ol className="gi-admin">
              {profile.adminChain.map((level) => (
                <li key={`${level.level}-${level.name}`}>
                  <span className="gi-adm" data-tip={`ADM${level.level}: ${level.level === 0 ? 'country' : level.level === 1 ? 'first-level subdivision (state, province, region)' : level.level === 2 ? 'second-level subdivision (county, district)' : 'lower-level subdivision'}`}>ADM{level.level}</span>
                  <span>{level.name}</span>
                  {level.code ? <code>{level.code}</code> : null}
                  <span className="gi-muted" data-tip={`From ${SOURCES[level.source].name}`}>{SOURCES[level.source].name.split(' ')[0]}</span>
                </li>
              ))}
            </ol>
            <dl className="gi-rows">{rows('admin')}</dl>
          </Card>
        ) : null}
        {sections.map(([group, skip]) => {
          const content = rows(group, skip);
          if (!content.length) return null;
          return (
            <Card key={group} id={group} title={FIELD_GROUP_LABELS[group]} tip={GROUP_TIPS[group]}>
              {group === 'solar' ? (
                <>
                  <label className="gi-field compact"><span>Date</span>
                    <input key={profile.id} type="date" defaultValue={profile.solar?.solarNoon?.slice(0, 10) ?? ''} min="1900-01-01" max="2100-12-31" onChange={(event) => { if (event.target.value) props.onSolarDate(event.target.value); }} data-tip="Show sun, twilight and moon times for another day at this place" />
                  </label>
                  <DaylightBar profile={profile} />
                </>
              ) : null}
              <dl className="gi-rows">{content}</dl>
              {group === 'solar' ? <p className="gi-source">Sun times: <a href={SOURCES[profile.solar?.provenance.source ?? 'sunrise-sunset-org'].homepage || 'https://sunrise-sunset.org/'} target="_blank" rel="noreferrer">{SOURCES[profile.solar?.provenance.source ?? 'sunrise-sunset-org'].name}</a></p> : null}
            </Card>
          );
        })}
        <HolidaysCard profile={profile} onExportIcs={props.onExportIcs} onExportCsv={props.onExportHolidayCsv} onYear={props.onHolidayYear} />

        <Card id="nearby" title="Nearby places" tip="Populated places from the bundled Natural Earth table within the chosen radius (works offline).">
          <label className="gi-range">
            <span>Radius <output>{props.radiusKm} km</output></span>
            <input type="range" min={1} max={500} step={1} value={props.radiusKm} onChange={(event) => props.onRadius(Number(event.target.value))} aria-label="Search radius in kilometres" data-tip="Drag to change the search radius (1–500 km); the circle is drawn on the map" />
          </label>
          {props.nearby.length ? (
            <ol className="gi-nearby">
              {props.nearby.slice(0, 25).map((place) => (
                <li key={`${place.name}-${place.lat}-${place.lon}`}>
                  <button type="button" className="gi-link" onClick={() => props.onLookupPlace(place)} data-tip={`Look up ${place.name}`}>{place.name}</button>
                  <span className="gi-muted">{[place.adm1, place.a2].filter(Boolean).join(', ')}</span>
                  <span>{formatDistance(place.distanceKm, units)}</span>
                  <span className="gi-muted" data-tip="Natural Earth pop_max: urban agglomeration estimate">≈{place.popMax.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          ) : <p className="gi-muted">No bundled populated places within {props.radiusKm} km.</p>}
          {props.nearby.length > 25 ? <p className="gi-muted">Showing the nearest 25 of {props.nearby.length}.</p> : null}
        </Card>

        <Card id="boundaries" title="Administrative boundaries" tip="Official-source boundary polygons from geoBoundaries, downloaded only when you ask and cached for 30 days.">
          <div className="gi-chips" role="group" aria-label="Boundary level">
            {(['ADM0', 'ADM1', 'ADM2'] as const).map((level) => (
              <button key={level} type="button" aria-pressed={props.boundary.level === level} disabled={!profile.countryCode || props.boundary.loading} onClick={() => props.onBoundary(props.boundary.level === level ? null : level)}
                data-tip={`${level === 'ADM0' ? 'Country outline' : level === 'ADM1' ? 'First-level units (states, provinces)' : 'Second-level units (counties, districts)'} — downloads from geoBoundaries`}>{level}</button>
            ))}
          </div>
          {props.boundary.loading ? <p role="status">Downloading boundaries…</p> : null}
          {props.boundary.error ? <p className="gi-error" role="alert">{props.boundary.error}</p> : null}
          {props.boundary.layer ? (
            <>
              <p>{props.boundary.layer.features.length} units drawn{props.boundary.hit ? <> · this point is in <strong>{props.boundary.hit}</strong></> : null}.</p>
              <p className="gi-source">{boundaryAttribution(props.boundary.layer.meta)} · <a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries</a></p>
            </>
          ) : null}
        </Card>
      </div>

      <footer className="gi-attribution" aria-label="Sources used for this location">
        <h3>Sources</h3>
        <ul>
          {sourcesFor([profile]).map((source) => (
            <li key={source.id}>{source.homepage ? <a href={source.homepage} target="_blank" rel="noreferrer">{source.name}</a> : source.name} — <span className="gi-muted">{source.attribution}</span></li>
          ))}
        </ul>
      </footer>
    </div>
  );
}

export function ProvenanceDialog({ profile, focusKey, onClose, units }: { profile: LocationProfile; focusKey: string | null; onClose: () => void; units: Units }) {
  const [filter, setFilter] = useState('');
  const fields = focusKey ? profile.fields.filter((item) => item.key === focusKey) : profile.fields.filter((item) => `${item.label} ${item.source} ${item.group}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="gi-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="gi-dialog wide" role="dialog" aria-modal="true" aria-labelledby="gi-prov-title" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
        <header className="gi-dialog-head">
          <h2 id="gi-prov-title">{focusKey ? 'Value provenance' : 'Provenance inspector'}</h2>
          <button type="button" className="gi-icon" aria-label="Close" onClick={onClose} autoFocus><Icon name="close" size={20} /></button>
        </header>
        {!focusKey ? <label className="gi-field"><span>Filter</span><input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Field, source or group" /></label> : null}
        <div className="gi-table-wrap" tabIndex={0} role="region" aria-label="Provenance table">
          <table className="gi-table">
            <thead><tr><th>Field</th><th>Value</th><th>Source</th><th>Record</th><th>Year</th><th>Retrieved</th><th>Geography</th><th>Confidence</th><th>License</th></tr></thead>
            <tbody>
              {fields.map((item) => (
                <tr key={item.key}>
                  <th scope="row">{item.label}<small>{item.key}</small></th>
                  <td>{displayValue(item, profile.timezone, units)}{item.unit ? <small>{item.unit}</small> : null}</td>
                  <td>{SOURCES[item.source].name}</td>
                  <td><code>{item.source_record_id ?? '—'}</code></td>
                  <td>{item.reference_year ?? '—'}</td>
                  <td><time dateTime={item.retrieved_at}>{item.retrieved_at.replace('T', ' ').slice(0, 19)}Z</time></td>
                  <td>{item.geography_type}{item.geometry_id ? <small>{item.geometry_id}</small> : null}</td>
                  <td>{CONFIDENCE_LABEL[item.confidence_class]}</td>
                  <td>{item.license}<small>{item.attribution}</small>{item.note ? <small className="gi-note">{item.note}</small> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
