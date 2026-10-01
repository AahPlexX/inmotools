import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Icon } from './ui/Icon';
import { downloadText } from '../../lib/download';
import { boundaryLayer, featureAt, boundaryAttribution, type AdmLevel } from './adapters/boundaries';
import { worldBankAllCountries, WB_INDICATORS } from './adapters/statistics';
import { nagerHolidays, solarTimes } from './adapters/environment';
import { formatDD } from './core/coords';
import { field, SOURCES, upsertFields } from './core/sources';
import { EMPTY_METADATA, type BBox, type ExportMetadata, type LatLon, type LocationProfile } from './core/types';
import { holidayFields, resolveLocation, solarFields, type ResolveInput } from './engine/synthesize';
import { attributionLines, buildHolidayCsv, buildIcs, fileSlug, parseProfileImport, resolveMetadata, type ResolvedMetadata } from './export/formats';
import { localDate } from './core/timezone';
import { clearHistory, deleteProfile, listProfiles, recordProfile, updateProfileMeta, type StoredProfile } from './net/store';
import { loadCountryShapes, placesNear, type NearbyPlace } from './offline/static-data';
import { boundaryPaths, choropleth, countryPaths, emptyScene, exportSvg, type Arc, type CountryPath, type Legend, type MapScene, type Pin } from './render/scene';
import { ComparePanel, COMPARE_LIMIT, HistoryPanel } from './ui/CollectionPanels';
import { ContextMenu, type MenuItem, type MenuState } from './ui/ContextMenu';
import { ExportDialog } from './ui/ExportDialog';
import { copyText, getClient, useMediaQuery, useSettings, useSourceHealth } from './ui/hooks';
import { MapCanvas, type MapCanvasHandle, type MapMode } from './ui/MapCanvas';
import { BatchPanel, PostalCountrySelect, SourcesPanel } from './ui/OpsPanels';
import { ProfilePanel, ProvenanceDialog, type BoundaryState } from './ui/ProfilePanel';
import { TooltipLayer } from './ui/Tooltip';
import { ToolsPanel, type NamedPoint } from './ui/ToolsPanel';
import './geo-intel.css';

type Tab = 'profile' | 'compare' | 'tools' | 'history' | 'batch' | 'sources';
const TABS: Array<{ id: Tab; label: string; tip: string }> = [
  { id: 'profile', label: 'Profile', tip: 'Everything known about the current location' },
  { id: 'compare', label: 'Compare', tip: 'Up to six locations side by side' },
  { id: 'tools', label: 'Tools', tip: 'Coordinate converter, Plus Codes, distance, area and choropleth' },
  { id: 'history', label: 'Saved', tip: 'Recent and starred locations stored on this device' },
  { id: 'batch', label: 'Batch', tip: 'Look up a CSV of postal codes' },
  { id: 'sources', label: 'Sources', tip: 'Data sources, their status and your settings' },
];

const EXAMPLES = ['Tokyo', 'US 90210', 'SW1A 1AA', '48.8584, 2.2945', '8FW4V75V+9R', '33UXP04', '40°26′46″N 79°58′56″W'];

const fitWidth = (profile: LocationProfile) => {
  const confidence = profile.fields.find((item) => item.key === 'location.lat')?.confidence_class;
  return confidence === 'rooftop' || confidence === 'street' ? 3 : confidence === 'postal_centroid' || confidence === 'locality_centroid' ? 6 : 24;
};
/** Deep link: #/tools/geo-intelligence-hub?q=… (typed query) or ?ll=lat,lon (map/device point). */
export function shareHash(profile: LocationProfile): string {
  const param = profile.queryKind === 'map' || profile.queryKind === 'device' ? `ll=${profile.lat.toFixed(6)},${profile.lon.toFixed(6)}` : `q=${encodeURIComponent(profile.query)}`;
  return `#/tools/geo-intelligence-hub?${param}`;
}

export function readShareHash(hash: string): ResolveInput | null {
  const query = hash.split('?')[1];
  if (!query) return null;
  const params = new URLSearchParams(query);
  const ll = params.get('ll');
  if (ll) {
    const [lat, lon] = ll.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { kind: 'map', lat, lon };
  }
  const q = params.get('q');
  return q && q.trim() ? { kind: 'text', text: q.slice(0, 200) } : null;
}

/** Plain-text summary for pasting into notes, chat or email. */
export function summaryText(profile: LocationProfile): string {
  const get = (key: string) => profile.fields.find((item) => item.key === key)?.value;
  const lines = [
    profile.label,
    `${profile.lat.toFixed(6)}, ${profile.lon.toFixed(6)} (Plus Code ${get('codes.plusCode') ?? '—'})`,
    get('country.name') ? `Country: ${get('country.name')}` : '',
    profile.adminChain.length > 1 ? `Region: ${profile.adminChain.slice(1).map((level) => level.name).join(' › ')}` : '',
    profile.timezone ? `Time zone: ${profile.timezone} (${get('tz.offset') ?? ''})` : '',
    typeof get('elevation.metres') === 'number' ? `Elevation: ${get('elevation.metres')} m` : '',
    typeof get('wb.SP.POP.TOTL') === 'number' ? `Country population: ${(get('wb.SP.POP.TOTL') as number).toLocaleString('en-US')}` : '',
    `Sources: ${profile.sourcesUsed.filter((id) => !['computed', 'user', 'device'].includes(id)).join(', ')}`,
  ];
  return lines.filter(Boolean).join('\n');
}

const osmUrl = (point: LatLon) => `https://www.openstreetmap.org/?mlat=${point.lat.toFixed(6)}&mlon=${point.lon.toFixed(6)}#map=15/${point.lat.toFixed(6)}/${point.lon.toFixed(6)}`;

export default function GeoIntelWorkspace() {
  const client = getClient();
  const health = useSourceHealth(client);
  const [settings, updateSettings] = useSettings();
  const isMobile = useMediaQuery('(max-width: 760px)');
  const root = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const map = useRef<MapCanvasHandle>(null);
  const inflight = useRef<AbortController | null>(null);

  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [profile, setProfile] = useState<LocationProfile | null>(null);
  const [history, setHistory] = useState<StoredProfile[]>([]);
  const [compare, setCompare] = useState<LocationProfile[]>([]);
  const [tab, setTab] = useState<Tab>('profile');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [consent, setConsent] = useState(false);

  const [countries, setCountries] = useState<CountryPath[]>([]);
  const [mode, setMode] = useState<MapMode>('select');
  const [measure, setMeasure] = useState<{ a: LatLon | null; b: LatLon | null }>({ a: null, b: null });
  const [arc, setArc] = useState<{ from: LatLon; to: LatLon } | null>(null);
  const [box, setBox] = useState<BBox | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [boundary, setBoundary] = useState<BoundaryState>({ level: null, loading: false, layer: null, error: null, hit: null });
  const [choro, setChoro] = useState<{ indicator: string; active: boolean; loading: boolean; fills: Map<string, string> | null; legend: Legend | null; error: string | null }>({ indicator: 'EN.POP.DNST', active: false, loading: false, fills: null, legend: null, error: null });

  const [exportFor, setExportFor] = useState<LocationProfile[] | null>(null);
  const [inspect, setInspect] = useState<{ key: string | null } | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const announce = useCallback((message: string) => { setStatus(message); }, []);
  const refreshHistory = useCallback(() => listProfiles().then(setHistory).catch(() => undefined), []);

  useEffect(() => { refreshHistory(); }, [refreshHistory]);
  const deepLinked = useRef(false);
  useEffect(() => { loadCountryShapes().then((shapes) => setCountries(countryPaths(shapes))).catch(() => setError('Could not load the bundled world map.')); }, []);
  useEffect(() => { setChoro((c) => ({ ...c, indicator: settings.choroplethIndicator })); }, [settings.choroplethIndicator]);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) { event.preventDefault(); searchInput.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => () => inflight.current?.abort(), []);

  useEffect(() => {
    if (!profile) { setNearby([]); return; }
    let alive = true;
    placesNear(profile, radiusKm, 200).then((list) => { if (alive) setNearby(list); }).catch(() => undefined);
    return () => { alive = false; };
  }, [profile, radiusKm]);

  // Late responses must not land on a location or indicator the user has already left.
  const profileIdRef = useRef<string | null>(null);
  profileIdRef.current = profile?.id ?? null;
  const choroToken = useRef(0);

  const stored = profile ? history.find((item) => item.id === profile.id) ?? null : null;

  const show = useCallback((next: LocationProfile, fit = true) => {
    setProfile(next);
    setBoundary({ level: null, loading: false, layer: null, error: null, hit: null });
    if (fit) map.current?.fit(next, fitWidth(next));
  }, []);

  const run = useCallback(async (input: ResolveInput) => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setBusy('Looking it up…'); setError(null);
    try {
      const next = await resolveLocation(input, { client, settings, signal: controller.signal, referencePoint: profile ? { lat: profile.lat, lon: profile.lon } : null, onStep: setBusy });
      if (controller.signal.aborted) return;
      show(next);
      await recordProfile(next).catch(() => undefined);
      // Keep the address bar shareable without adding a history entry per lookup.
      if (window.location.hash.startsWith('#/tools/geo-intelligence-hub')) window.history.replaceState(null, '', shareHash(next));
      await refreshHistory();
      setTab('profile');
      if (isMobile) setSheetOpen(false);
      announce(`Found ${next.label}.`);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError((caught as Error).message);
    } finally {
      if (inflight.current === controller) { inflight.current = null; setBusy(null); }
    }
  }, [client, settings, profile, show, refreshHistory, isMobile, announce]);

  // Open a shared link once, on first render.
  useEffect(() => {
    if (deepLinked.current) return;
    deepLinked.current = true;
    const input = readShareHash(window.location.hash);
    if (input) { if (input.kind === 'text') setQuery(input.text); run(input); }
  }, [run]);

  const share = useCallback(async (target: LocationProfile) => {
    const url = `${window.location.origin}${window.location.pathname}${shareHash(target)}`;
    const nav = navigator as Navigator & { share?: (data: { title: string; url: string }) => Promise<void> };
    if (nav.share && matchMedia('(pointer: coarse)').matches) {
      try { await nav.share({ title: target.label, url }); return; } catch (error) { if ((error as Error).name === 'AbortError') return; }
    }
    announce((await copyText(url)) ? 'Link copied. Anyone who opens it re-runs this lookup in their own browser.' : 'Could not copy the link.');
  }, [announce]);

  const changeSolarDate = useCallback(async (date: string) => {
    if (!profile || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setBusy('Updating sun times…');
    try {
      const { solar, warnings } = await solarTimes(client, profile.lat, profile.lon, date);
      const next = { ...profile, solar, fields: upsertFields(profile.fields, solarFields(solar)), warnings: [...new Set([...profile.warnings, ...warnings])] };
      setProfile(next);
      recordProfile(next).then(refreshHistory).catch(() => undefined);
      announce(`Sun times for ${date}.`);
    } finally { setBusy(null); }
  }, [client, profile, refreshHistory, announce]);

  const changeHolidayYear = useCallback(async (year: number) => {
    if (!profile?.countryCode) return;
    setBusy(`Loading holidays for ${year}…`);
    try {
      const calendar = await nagerHolidays(client, year, profile.countryCode);
      if (!calendar) { announce(`No holiday calendar for ${year}.`); return; }
      const today = profile.timezone ? localDate(profile.timezone, new Date()) : new Date().toISOString().slice(0, 10);
      const next = { ...profile, holidays: calendar, fields: upsertFields(profile.fields, holidayFields(calendar, today)) };
      setProfile(next);
      recordProfile(next).then(refreshHistory).catch(() => undefined);
    } catch (caught) { setError(`Nager.Date: ${(caught as Error).message}`); }
    finally { setBusy(null); }
  }, [client, profile, refreshHistory, announce]);

  const importFile = useCallback(async (file: File) => {
    try {
      const { profiles, rejected } = parseProfileImport(await file.text());
      for (const item of profiles) await recordProfile(item);
      await refreshHistory();
      announce(`Imported ${profiles.length} location${profiles.length === 1 ? '' : 's'}${rejected ? `; skipped ${rejected} invalid entr${rejected === 1 ? 'y' : 'ies'}` : ''}.`);
    } catch (caught) { setError((caught as Error).message); }
  }, [refreshHistory, announce]);

  const submit = (event: FormEvent) => { event.preventDefault(); if (query.trim()) run({ kind: 'text', text: query }); };

  const locateDevice = () => {
    setConsent(false);
    if (!('geolocation' in navigator)) { setError('This browser does not offer device location.'); return; }
    setBusy('Waiting for your device location…');
    navigator.geolocation.getCurrentPosition(
      (position) => run({ kind: 'device', lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy ?? null }),
      (failure) => { setBusy(null); setError(failure.code === failure.PERMISSION_DENIED ? 'Location permission was denied. You can still search or click the map.' : `Device location unavailable: ${failure.message}`); },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const copy = useCallback(async (text: string, what: string) => { announce((await copyText(text)) ? `${what} copied.` : `Could not copy ${what.toLowerCase()}.`); }, [announce]);

  const togglePin = useCallback((target: LocationProfile) => {
    setCompare((list) => {
      if (list.some((item) => item.id === target.id)) { announce(`Removed ${target.label} from comparison.`); return list.filter((item) => item.id !== target.id); }
      if (list.length >= COMPARE_LIMIT) { announce(`The comparison holds ${COMPARE_LIMIT} locations; remove one first.`); return list; }
      announce(`Added ${target.label} to comparison.`);
      return [...list, target];
    });
  }, [announce]);

  const toggleStar = useCallback(async (id: string) => {
    const item = history.find((entry) => entry.id === id);
    if (!item) return;
    await updateProfileMeta(id, { starred: !item.starred });
    await refreshHistory();
    announce(item.starred ? `Unstarred ${item.name}.` : `Starred ${item.name}.`);
  }, [history, refreshHistory, announce]);

  const removeFromHistory = useCallback(async (id: string) => {
    await deleteProfile(id);
    await refreshHistory();
    announce('Deleted from history.');
  }, [refreshHistory, announce]);

  const onMetadata = useCallback((metadata: ExportMetadata) => {
    const id = exportFor?.[0]?.id;
    if (!id) return;
    updateProfileMeta(id, { metadata }).then(() => refreshHistory()).catch(() => undefined);
  }, [exportFor, refreshHistory]);

  const profileMenu = useCallback((target: LocationProfile, x: number, y: number) => {
    const record = history.find((item) => item.id === target.id);
    const pinned = compare.some((item) => item.id === target.id);
    const items: MenuItem[] = [
      { id: 'copy', label: 'Copy coordinates', run: () => copy(formatDD(target), 'Coordinates') },
      { id: 'summary', label: 'Copy summary as text', run: () => copy(summaryText(target), 'Summary') },
      { id: 'share', label: 'Copy share link', run: () => share(target) },
      { id: 'osm', label: 'Open in OpenStreetMap', run: () => window.open(osmUrl(target), '_blank', 'noopener,noreferrer') },
      { id: 'star', label: record?.starred ? 'Unstar' : 'Star', disabled: !record, run: () => toggleStar(target.id) },
      { id: 'compare', label: pinned ? 'Remove from comparison' : 'Add to comparison', run: () => togglePin(target) },
      { id: 'export', label: 'Export this location…', run: () => setExportFor([target]) },
      { id: 'delete', label: 'Delete from history', danger: true, disabled: !record, run: () => removeFromHistory(target.id) },
    ];
    setMenu({ x, y, title: target.label, items });
  }, [history, compare, copy, share, toggleStar, togglePin, removeFromHistory]);

  const pinMenu = useCallback((pinId: string, x: number, y: number) => {
    const target = pinId === 'current' ? profile : compare.find((item) => item.id === pinId) ?? null;
    if (target) profileMenu(target, x, y);
  }, [profile, compare, profileMenu]);

  const mapMenu = useCallback((point: LatLon, x: number, y: number) => {
    setMenu({
      x, y, title: formatDD(point, 4),
      items: [
        { id: 'lookup', label: 'Look up this point', run: () => run({ kind: 'map', lat: point.lat, lon: point.lon }) },
        { id: 'a', label: 'Measure from here (A)', run: () => { setMeasure((m) => ({ ...m, a: point })); setTab('tools'); } },
        { id: 'b', label: 'Measure to here (B)', run: () => { setMeasure((m) => ({ ...m, b: point })); setTab('tools'); } },
        { id: 'copy', label: 'Copy coordinates', run: () => copy(formatDD(point), 'Coordinates') },
        { id: 'osm', label: 'Open in OpenStreetMap', run: () => window.open(osmUrl(point), '_blank', 'noopener,noreferrer') },
      ],
    });
  }, [run, copy]);

  const onMeasurePoint = useCallback((point: LatLon) => {
    setMeasure((m) => (!m.a || (m.a && m.b) ? { a: point, b: null } : { ...m, b: point }));
  }, []);

  const loadBoundary = useCallback(async (level: AdmLevel | null) => {
    if (!profile || !level) { setBoundary({ level: null, loading: false, layer: null, error: null, hit: null }); return; }
    const iso3 = profile.fields.find((item) => item.key === 'country.a3')?.value;
    if (typeof iso3 !== 'string') { setBoundary((b) => ({ ...b, error: 'No country code for this location.' })); return; }
    setBoundary({ level, loading: true, layer: null, error: null, hit: null });
    try {
      const layer = await boundaryLayer(client, iso3, level);
      if (profileIdRef.current !== profile.id) return;
      const hit = featureAt(layer, profile.lon, profile.lat);
      setBoundary({ level, loading: false, layer, error: null, hit: hit?.properties.shapeName ?? null });
      if (hit?.properties.shapeName) {
        const updated = { ...profile, fields: upsertFields(profile.fields, [field(`admin.geoboundaries.${level}`, `${level} unit (geoBoundaries)`, 'admin', `${hit.properties.shapeName}${hit.properties.shapeISO ? ` (${hit.properties.shapeISO})` : ''}`, {
          source: 'geoboundaries', geography: level === 'ADM0' ? 'country' : level === 'ADM1' ? 'admin1' : 'admin2', confidence: 'admin_centroid', retrievedAt: layer.retrievedAt,
          recordId: hit.properties.shapeID ?? null, geometryId: layer.meta.boundaryID, year: Number(layer.meta.boundaryYearRepresented) || null, license: layer.meta.boundaryLicense, attribution: boundaryAttribution(layer.meta),
          note: 'Point-in-polygon on the simplified geoBoundaries layer.',
        })]), sourcesUsed: [...new Set([...profile.sourcesUsed, 'geoboundaries' as const])] };
        setProfile(updated);
        recordProfile(updated).then(refreshHistory).catch(() => undefined);
      }
    } catch (caught) {
      if (profileIdRef.current === profile.id) setBoundary({ level, loading: false, layer: null, error: `geoBoundaries: ${(caught as Error).message}`, hit: null });
    }
  }, [client, profile, refreshHistory]);

  const toggleChoropleth = useCallback(async (indicator: string, active: boolean) => {
    if (indicator !== settings.choroplethIndicator) updateSettings({ choroplethIndicator: indicator });
    const token = ++choroToken.current;
    if (!active) { setChoro((c) => ({ ...c, indicator, active: false, loading: false })); return; }
    setChoro((c) => ({ ...c, indicator, loading: true, error: null }));
    try {
      const data = await worldBankAllCountries(client, indicator);
      if (token !== choroToken.current) return;
      const def = WB_INDICATORS.find((item) => item.id === indicator);
      const { fills, legend } = choropleth(data.values, def?.label.replace(' (country)', '') ?? indicator, def?.unit ?? '');
      setChoro({ indicator, active: true, loading: false, fills, legend, error: null });
    } catch (caught) {
      if (token === choroToken.current) setChoro((c) => ({ ...c, loading: false, active: false, error: `World Bank: ${(caught as Error).message}` }));
    }
  }, [client, settings.choroplethIndicator, updateSettings]);

  const scene: MapScene = useMemo(() => {
    const highlightA3 = profile?.fields.find((item) => item.key === 'country.a3')?.value;
    const pins: Pin[] = compare.map((item, index) => ({ id: item.id, lat: item.lat, lon: item.lon, label: item.label, active: item.id === profile?.id, index: index + 1 }));
    if (profile && !compare.some((item) => item.id === profile.id)) pins.push({ id: 'current', lat: profile.lat, lon: profile.lon, label: profile.label, active: true });
    const arcs: Arc[] = arc ? [{ ...arc, label: 'Great-circle route' }] : [];
    for (const point of [measure.a, measure.b]) if (point) pins.push({ id: `m-${point.lat}-${point.lon}`, lat: point.lat, lon: point.lon, label: point === measure.a ? 'Point A' : 'Point B', active: false });
    return {
      ...emptyScene(countries),
      fills: choro.active ? choro.fills : null,
      legend: choro.active ? choro.legend : null,
      highlight: typeof highlightA3 === 'string' ? highlightA3 : null,
      boundaries: boundary.layer ? boundaryPaths(boundary.layer.features) : [],
      pins, arcs, boxes: box ? [box] : [],
      radius: profile && tab === 'profile' ? { center: { lat: profile.lat, lon: profile.lon }, km: radiusKm } : null,
    };
  }, [countries, choro, profile, compare, arc, measure, boundary.layer, box, radiusKm, tab]);

  const mapSvg = useCallback((meta: ResolvedMetadata) => {
    const profiles = exportFor ?? (profile ? [profile] : []);
    return exportSvg(scene, { metadata: meta, title: meta.title, date: meta.date, viewBox: map.current?.viewBox(), attribution: ['Map: Made with Natural Earth (public domain) · Equal Earth projection', ...attributionLines(profiles)] });
  }, [scene, exportFor, profile]);

  const downloadHolidays = (kind: 'ics' | 'csv') => {
    if (!profile?.holidays) return;
    const meta = resolveMetadata(stored?.metadata ?? EMPTY_METADATA, [profile]);
    const name = `${fileSlug(profile.label)}-holidays-${profile.holidays.year}`;
    if (kind === 'ics') downloadText(buildIcs(profile, meta, ''), `${name}.ics`, 'text/calendar;charset=utf-8');
    else downloadText(buildHolidayCsv(profile), `${name}.csv`, 'text/csv;charset=utf-8');
  };

  const candidates: NamedPoint[] = compare.map((item) => ({ id: item.id, label: item.label, point: { lat: item.lat, lon: item.lon } }));
  const current: NamedPoint | null = profile ? { id: profile.id, label: profile.label, point: { lat: profile.lat, lon: profile.lon } } : null;
  const units = settings.units;

  const panel = (() => {
    switch (tab) {
      case 'profile': return profile ? (
        <ProfilePanel
          profile={profile} units={units} starred={!!stored?.starred} pinned={compare.some((item) => item.id === profile.id)} nearby={nearby} radiusKm={radiusKm} boundary={boundary}
          onInspect={(key) => setInspect({ key })} onCopy={copy} onPin={() => togglePin(profile)} onStar={() => toggleStar(profile.id)} onExport={() => setExportFor([profile])}
          onRefresh={() => run(profile.queryKind === 'map' || profile.queryKind === 'device' ? { kind: 'map', lat: profile.lat, lon: profile.lon } : { kind: 'text', text: profile.query })}
          onRadius={setRadiusKm} onLookupPlace={(place) => run({ kind: 'map', lat: place.lat, lon: place.lon })} onBoundary={loadBoundary}
          onExportIcs={() => downloadHolidays('ics')} onExportHolidayCsv={() => downloadHolidays('csv')} onMenu={(x, y) => profileMenu(profile, x, y)}
          onPickAlternative={(alt) => run({ kind: 'map', lat: alt.lat, lon: alt.lon })}
          onShare={() => share(profile)} onCopySummary={() => copy(summaryText(profile), 'Summary')} onSolarDate={changeSolarDate} onHolidayYear={changeHolidayYear}
        />
      ) : (
        <div className="gi-intro" data-testid="gi-intro">
          <h2>Look up any place on Earth</h2>
          <p>Type a place name, postal code, coordinates in any notation, a Plus Code, UTM or MGRS — or click the map. Results combine {Object.values(SOURCES).filter((source) => source.network).length} open, keyless sources with bundled offline data, and every value shows where it came from.</p>
          <div className="gi-chips" role="group" aria-label="Examples">
            {EXAMPLES.map((example) => <button key={example} type="button" onClick={() => { setQuery(example); run({ kind: 'text', text: example }); }} data-tip={`Try “${example}”`}>{example}</button>)}
          </div>
        </div>
      );
      case 'compare': return <ComparePanel profiles={compare} units={units} onRemove={(id) => setCompare((list) => list.filter((item) => item.id !== id))} onOpen={(p) => { show(p); setTab('profile'); }} onExport={() => setExportFor(compare)} onClear={() => setCompare([])} onMenu={profileMenu} />;
      case 'tools': return (
        <ToolsPanel current={current} candidates={candidates} units={units} mode={mode} measure={measure} box={box} choropleth={choro}
          onMode={setMode} onMeasure={(slot, point) => setMeasure((m) => ({ ...m, [slot]: point }))} onBox={setBox} onLookup={(point) => run({ kind: 'map', lat: point.lat, lon: point.lon })}
          onCopy={copy} onChoropleth={toggleChoropleth} onArc={setArc} />
      );
      case 'history': return (
        <HistoryPanel items={history} onImport={importFile} handlers={{
          onOpen: (item) => { show(item.profile); setTab('profile'); },
          onStar: (item) => toggleStar(item.id),
          onSave: (item, name, tags) => updateProfileMeta(item.id, { name, tags }).then(refreshHistory),
          onDelete: (item) => removeFromHistory(item.id),
          onCompare: (item) => togglePin(item.profile),
          onExport: (item) => setExportFor([item.profile]),
          onClear: () => clearHistory(true).then(refreshHistory).then(() => announce('Cleared unstarred history.')),
          onMenu: (item, x, y) => profileMenu(item.profile, x, y),
        }} />
      );
      case 'batch': return <BatchPanel client={client} defaultCountry={settings.defaultPostalCountry} />;
      case 'sources': return <SourcesPanel client={client} settings={settings} onSettings={updateSettings} health={health} onStatus={announce} />;
    }
  })();

  const selectTab = (next: Tab) => { setTab(next); if (isMobile) setSheetOpen(next !== 'profile'); };
  const inSheet = isMobile && sheetOpen && tab !== 'profile';

  return (
    <div className="gi workspace-body" ref={root} data-testid="geo-intel-hub">
      <form className="gi-search" role="search" onSubmit={submit}>
        <label className="gi-visually-hidden" htmlFor="gi-query">Search for a place, postal code, coordinates, Plus Code, UTM or MGRS</label>
        <input
          id="gi-query" ref={searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" spellCheck={false} enterKeyHint="search"
          placeholder="Place, postal code, 48.8584, 2.2945, 8FW4V75V+9R, 33UXP04…" data-testid="gi-query" list="gi-recent"
          data-tip="Press / to focus. Examples: “Tokyo”, “US 90210”, “SW1A 1AA”, “48°51′30″N 2°17′40″E”, “V75V+9R Paris”, “31N 448251 5411932”"
        />
        <datalist id="gi-recent">{[...new Set(history.map((item) => item.profile.query))].filter((q) => !q.startsWith('Map point') && q !== 'Device location').slice(0, 12).map((q) => <option key={q} value={q} />)}</datalist>
        <button type="submit" className="gi-btn primary" disabled={!query.trim() || !!busy} data-testid="gi-search" data-tip="Look it up (Enter). Searches run only when you ask — there is no search-as-you-type.">Look up</button>
        <button type="button" className="gi-btn" onClick={() => setConsent(true)} disabled={!!busy} data-tip="Use this device's location — you will be asked first">Use my location</button>
        <PostalCountrySelect value={settings.defaultPostalCountry} onChange={(code) => updateSettings({ defaultPostalCountry: code })} label="Postal country" tip="Country assumed for postal codes typed without one (e.g. “10115”)" />
      </form>

      <div className="gi-statusbar">
        {!online ? <span className="gi-badge warn" data-tip="Bundled data and anything you looked up before still work">Offline — using cached and bundled data</span> : null}
        {busy ? <span className="gi-busy" role="status">{busy}</span> : null}
        {error ? <p className="gi-error" role="alert">{error} <button type="button" className="gi-link" onClick={() => setError(null)}>Dismiss</button></p> : null}
        <span className="gi-visually-hidden" role="status" aria-live="polite">{status}</span>
        {status && !busy ? <span className="gi-muted" aria-hidden="true">{status}</span> : null}
      </div>

      <div className="gi-layout">
        <div className="gi-map-col">
          <MapCanvas ref={map} scene={scene} mode={mode} onPick={(point, metresPerPx) => run({ kind: 'map', lat: point.lat, lon: point.lon, precisionMetres: metresPerPx })} onMeasure={onMeasurePoint} onBox={(next) => { setBox(next); setMode('select'); setTab('tools'); }} onPinMenu={pinMenu} onMapMenu={mapMenu} />
          {mode !== 'select' ? <p className="gi-mode-note" role="status">{mode === 'measure' ? 'Measure mode: click point A, then point B.' : 'Box mode: drag on the map.'} <button type="button" className="gi-link" onClick={() => setMode('select')}>Done</button></p> : null}
          {scene.legend ? (
            <div className="gi-legend compact" aria-label="Map legend">
              <p><strong>{scene.legend.title}</strong></p>
              <ul>{scene.legend.stops.map((stop) => <li key={stop.label}><span style={{ background: stop.color }} aria-hidden="true" />{stop.label}</li>)}</ul>
            </div>
          ) : null}
        </div>

        <div className="gi-side">
          <div className="gi-tabs" role="tablist" aria-label="Workspace sections" onKeyDown={(event) => {
            const order = TABS.map((t) => t.id);
            const index = order.indexOf(tab);
            const next = event.key === 'ArrowRight' ? order[(index + 1) % order.length] : event.key === 'ArrowLeft' ? order[(index - 1 + order.length) % order.length] : event.key === 'Home' ? order[0] : event.key === 'End' ? order[order.length - 1] : null;
            if (!next) return;
            event.preventDefault();
            selectTab(next);
            document.getElementById(`gi-tab-${next}`)?.focus();
          }}>
            {TABS.map((item) => (
              <button key={item.id} type="button" role="tab" id={`gi-tab-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} aria-controls="gi-panel" data-tip={item.tip} onClick={() => selectTab(item.id)} data-testid={`gi-tab-${item.id}`}>
                {item.label}{item.id === 'compare' && compare.length ? <span className="gi-count">{compare.length}</span> : null}
              </button>
            ))}
          </div>
          {!inSheet ? (
            <div className="gi-panel" id="gi-panel" role="tabpanel" aria-labelledby={`gi-tab-${tab}`} tabIndex={0}>{panel}</div>
          ) : (
            <div className="gi-panel" id="gi-panel" role="tabpanel" aria-labelledby="gi-tab-profile" tabIndex={0}>
              {profile ? <p className="gi-muted">Showing {TABS.find((t) => t.id === tab)?.label} in the sheet below.</p> : null}
            </div>
          )}
        </div>
      </div>

      {inSheet ? (
        <div className="gi-sheet-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setSheetOpen(false); }}>
          <div className="gi-sheet" role="dialog" aria-modal="true" aria-labelledby="gi-sheet-title" onKeyDown={(event) => { if (event.key === 'Escape') setSheetOpen(false); }}>
            <header className="gi-sheet-head">
              <span className="gi-grip" aria-hidden="true" />
              <h2 id="gi-sheet-title">{TABS.find((t) => t.id === tab)?.label}</h2>
              <button type="button" className="gi-icon" aria-label="Close panel" onClick={() => { setSheetOpen(false); setTab('profile'); }} autoFocus><Icon name="close" size={20} /></button>
            </header>
            <div className="gi-sheet-body" tabIndex={0} role="region" aria-label={`${TABS.find((t) => t.id === tab)?.label} panel`}>{panel}</div>
          </div>
        </div>
      ) : null}

      {consent ? (
        <div className="gi-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setConsent(false); }}>
          <div className="gi-dialog" role="alertdialog" aria-modal="true" aria-labelledby="gi-consent-title" aria-describedby="gi-consent-text" onKeyDown={(event) => { if (event.key === 'Escape') setConsent(false); }}>
            <h2 id="gi-consent-title">Share this device’s location?</h2>
            <p id="gi-consent-text">Your browser will ask for permission. If you allow it, your coordinates are sent once to BigDataCloud’s free client-side reverse-geocoding service (and to the other sources used for any location) to name the place. Nothing is stored except in this browser’s history.</p>
            <div className="gi-actions">
              <button type="button" className="gi-btn primary" onClick={locateDevice} autoFocus>Continue</button>
              <button type="button" className="gi-btn" onClick={() => setConsent(false)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {exportFor ? <ExportDialog profiles={exportFor} metadata={history.find((item) => item.id === exportFor[0].id)?.metadata ?? EMPTY_METADATA} onMetadata={onMetadata} mapSvg={mapSvg} onClose={() => setExportFor(null)} onStatus={announce} /> : null}
      {inspect && profile ? <ProvenanceDialog profile={profile} focusKey={inspect.key} onClose={() => setInspect(null)} units={units} /> : null}
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      <TooltipLayer root={root} />
    </div>
  );
}
