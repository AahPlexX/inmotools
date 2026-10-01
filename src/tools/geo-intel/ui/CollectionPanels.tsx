import { useMemo, useState, type MouseEvent } from 'react';
import { Icon } from './Icon';
import { distanceKm } from '../core/geodesy';
import { formatOffset, offsetMinutes } from '../core/timezone';
import type { LocationProfile } from '../core/types';
import { parseTagInput, type StoredProfile } from '../net/store';
import { formatDistance, formatDurationSeconds, formatElevation, formatTime, type Units } from './format';
import { useLongPress, useNow } from './hooks';

export const COMPARE_LIMIT = 6;

const value = (profile: LocationProfile, key: string) => profile.fields.find((item) => item.key === key)?.value ?? null;

function CompareCard({ profile, index, base, units, now, onRemove, onOpen, onMenu }: { profile: LocationProfile; index: number; base: LocationProfile; units: Units; now: Date; onRemove: () => void; onOpen: () => void; onMenu: (x: number, y: number) => void }) {
  const longPress = useLongPress((x, y) => onMenu(x, y));
  const zone = profile.timezone;
  const population = value(profile, 'wb.SP.POP.TOTL');
  const elevation = value(profile, 'elevation.metres');
  const rows: Array<[string, string, string]> = [
    ['Country', String(value(profile, 'country.name') ?? '—'), 'Country containing the point'],
    ['Local time', zone ? formatTime(now.toISOString(), zone) : '—', 'Current local time there'],
    ['UTC offset', zone ? formatOffset(offsetMinutes(zone, now)) : '—', 'Offset right now, including daylight saving'],
    ['Time zone', zone ?? '—', 'IANA time-zone name'],
    ['Population (country)', typeof population === 'number' ? population.toLocaleString() : '—', 'World Bank total population of the country'],
    ['Elevation', typeof elevation === 'number' ? formatElevation(elevation, units) : '—', 'Terrain height at the point'],
    ['Sunrise / sunset', profile.solar ? `${formatTime(profile.solar.sunrise, zone)} / ${formatTime(profile.solar.sunset, zone)}` : '—', 'Local sunrise and sunset on the looked-up date'],
    ['Daylight', profile.solar?.dayLengthSeconds !== null && profile.solar?.dayLengthSeconds !== undefined ? formatDurationSeconds(profile.solar.dayLengthSeconds) : '—', 'Time between sunrise and sunset'],
    ['From #1', index === 0 ? '—' : formatDistance(distanceKm(base, profile), units), 'Great-circle distance from the first card'],
  ];
  return (
    <article className="gi-compare-card" aria-label={`Comparison ${index + 1}: ${profile.label}`} onContextMenu={(event: MouseEvent) => { event.preventDefault(); onMenu(event.clientX, event.clientY); }} {...longPress}>
      <header>
        <span className="gi-index" aria-hidden="true">{index + 1}</span>
        <button type="button" className="gi-link" onClick={onOpen} data-tip="Show this location's full profile">{profile.label}</button>
        <button type="button" className="gi-icon" aria-label={`Remove ${profile.label} from comparison`} data-tip="Remove from comparison" onClick={onRemove}><Icon name="close" /></button>
      </header>
      <dl className="gi-rows">{rows.map(([label, text, tip]) => <div className="gi-row" key={label}><dt data-tip={tip} tabIndex={0}>{label}</dt><dd>{text}</dd></div>)}</dl>
    </article>
  );
}

export function ComparePanel({ profiles, units, onRemove, onOpen, onExport, onClear, onMenu }: { profiles: LocationProfile[]; units: Units; onRemove: (id: string) => void; onOpen: (profile: LocationProfile) => void; onExport: () => void; onClear: () => void; onMenu: (profile: LocationProfile, x: number, y: number) => void }) {
  const now = useNow(30_000);
  if (!profiles.length) return <p className="gi-empty" data-testid="gi-compare">Pin up to {COMPARE_LIMIT} locations with “Compare” (or the right-click / long-press menu) to see them side by side.</p>;
  return (
    <div data-testid="gi-compare">
      <div className="gi-actions">
        <button type="button" className="gi-btn primary" onClick={onExport} data-tip="Export all compared locations together">Export comparison…</button>
        <button type="button" className="gi-btn" onClick={onClear}>Clear all</button>
        <span className="gi-muted">{profiles.length} of {COMPARE_LIMIT}</span>
      </div>
      <div className="gi-compare-grid">
        {profiles.map((profile, index) => <CompareCard key={profile.id} profile={profile} index={index} base={profiles[0]} units={units} now={now} onRemove={() => onRemove(profile.id)} onOpen={() => onOpen(profile)} onMenu={(x, y) => onMenu(profile, x, y)} />)}
      </div>
    </div>
  );
}

function HistoryItem({ item, onOpen, onStar, onSave, onDelete, onCompare, onExport, onMenu }: {
  item: StoredProfile; onOpen: () => void; onStar: () => void; onSave: (name: string, tags: string[]) => void; onDelete: () => void; onCompare: () => void; onExport: () => void; onMenu: (x: number, y: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [tags, setTags] = useState(item.tags.join(', '));
  const longPress = useLongPress((x, y) => onMenu(x, y));
  return (
    <li className="gi-history-item" onContextMenu={(event) => { event.preventDefault(); onMenu(event.clientX, event.clientY); }} {...longPress}>
      <button type="button" className="gi-star" aria-pressed={item.starred} aria-label={item.starred ? `Unstar ${item.name}` : `Star ${item.name}`} data-tip={item.starred ? 'Unstar (may then be trimmed from history)' : 'Star to keep permanently'} onClick={onStar}><Icon name={item.starred ? 'star' : 'starOutline'} size={22} /></button>
      <div className="gi-history-main">
        {editing ? (
          <form className="gi-edit" onSubmit={(event) => { event.preventDefault(); onSave(name, parseTagInput(tags)); setEditing(false); }}>
            <label className="gi-field compact"><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label>
            <label className="gi-field compact"><span>Tags (comma-separated)</span><input value={tags} onChange={(event) => setTags(event.target.value)} /></label>
            <div className="gi-actions"><button type="submit" className="gi-btn primary">Save</button><button type="button" className="gi-btn" onClick={() => { setEditing(false); setName(item.name); setTags(item.tags.join(', ')); }}>Cancel</button></div>
          </form>
        ) : (
          <>
            <button type="button" className="gi-link gi-history-name" onClick={onOpen} data-tip="Open (works offline from your saved copy)">{item.name}</button>
            <p className="gi-muted">{item.profile.query} · {new Date(item.updatedAt).toLocaleString()}</p>
            {item.tags.length ? <p className="gi-tags">{item.tags.map((tag) => <span key={tag} className="gi-badge">#{tag}</span>)}</p> : null}
          </>
        )}
      </div>
      {!editing ? (
        <div className="gi-history-actions">
          <button type="button" className="gi-btn small" onClick={() => { setName(item.name); setTags(item.tags.join(', ')); setEditing(true); }} data-tip="Rename and tag">Edit</button>
          <button type="button" className="gi-btn small" onClick={onCompare} data-tip="Add to comparison">Compare</button>
          <button type="button" className="gi-btn small" onClick={onExport} data-tip="Export this saved location">Export</button>
          <button type="button" className="gi-btn small danger" onClick={onDelete} data-tip="Delete from this device">Delete</button>
        </div>
      ) : null}
    </li>
  );
}

export interface HistoryHandlers {
  onOpen: (item: StoredProfile) => void;
  onStar: (item: StoredProfile) => void;
  /** Name and tags are saved together in one write. */
  onSave: (item: StoredProfile, name: string, tags: string[]) => void;
  onDelete: (item: StoredProfile) => void;
  onCompare: (item: StoredProfile) => void;
  onExport: (item: StoredProfile) => void;
  onClear: () => void;
  onMenu: (item: StoredProfile, x: number, y: number) => void;
}

export function HistoryPanel({ items, handlers, onImport }: { items: StoredProfile[]; handlers: HistoryHandlers; onImport: (file: File) => void }) {
  const [filter, setFilter] = useState('');
  const [starredOnly, setStarredOnly] = useState(false);
  const visible = useMemo(() => items.filter((item) => (!starredOnly || item.starred) && `${item.name} ${item.profile.query} ${item.tags.join(' ')}`.toLowerCase().includes(filter.trim().toLowerCase())), [items, filter, starredOnly]);
  return (
    <div data-testid="gi-history">
      <div className="gi-inline">
        <label className="gi-field compact grow"><span>Search history</span><input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Name, query or #tag" /></label>
        <label className="gi-btn file" data-tip="Restore locations from a Geo Intelligence Hub JSON export (e.g. from another device)">Import JSON…
          <input type="file" accept=".json,application/json" className="gi-visually-hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ''; }} />
        </label>
        <label className="gi-check"><input type="checkbox" checked={starredOnly} onChange={(event) => setStarredOnly(event.target.checked)} /> Starred only</label>
      </div>
      <p className="gi-muted">The last 50 lookups are kept on this device; starred ones are kept until you delete them. Nothing is uploaded.</p>
      {visible.length ? <ul className="gi-history">{visible.map((item) => (
        <HistoryItem key={item.id} item={item} onOpen={() => handlers.onOpen(item)} onStar={() => handlers.onStar(item)} onSave={(name, tags) => handlers.onSave(item, name, tags)} onDelete={() => handlers.onDelete(item)} onCompare={() => handlers.onCompare(item)} onExport={() => handlers.onExport(item)} onMenu={(x, y) => handlers.onMenu(item, x, y)} />
      ))}</ul> : <p className="gi-empty">{items.length ? 'No saved location matches.' : 'No lookups yet.'}</p>}
      {items.some((item) => !item.starred) ? <div className="gi-actions"><button type="button" className="gi-btn danger" onClick={handlers.onClear} data-tip="Remove all unstarred history from this device">Clear unstarred history</button></div> : null}
    </div>
  );
}
