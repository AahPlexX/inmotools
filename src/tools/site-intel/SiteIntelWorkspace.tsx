// Feature 34 — main workspace orchestration: input → Group 1 lexical
// forensics (synchronous) → Groups 2-6 telemetry engines (async, run
// concurrently) → Group 7 composite scorecard, node graph, export, and vault.
// Layout is responsive: a sticky horizontal tab bar + stacked accordion cards
// on narrow viewports, a dense multi-column grid on wide viewports (see
// site-intel-workspace.css for the breakpoint rules).

import { useMemo, useState } from 'react';
import './site-intel-workspace.css';
import { InfoBadge } from './components/InfoBadge';
import { ScoreRadar } from './components/ScoreRadar';
import { NodeGraph, type NodeGraphData } from './components/NodeGraph';
import {
  buildSanitizedUrl, classifyQueryParams, detectHomoglyphs, detectShortener,
  findTyposquatMatches, parseUrl, shannonEntropy,
} from './url-forensics';
import { fetchDnsTable, auditIpv6Readiness, validateCaaRecords, checkDnssecSignals, extractIps, extractNameservers, resolvePtrRecords } from './dns-engine';
import { profileHosting, checkNameserverRedundancy, detectAnycast } from './network-engine';
import { fetchRdap, assessDomainAge, assessExpiration, type RdapRecord } from './rdap-engine';
import { fetchWaybackTimeline, waybackCaptureUrl, type WaybackTimeline } from './wayback-engine';
import { scanDnsbl } from './blacklist-engine';
import { fetchCtLog, summarizeSanSubdomains, assessCertificateExpiry, type CtReport } from './ct-engine';
import { checkHstsPreload, describeHstsPreload } from './hsts-engine';
import { analyzeSchemeSecurity } from './mixed-content-engine';
import { fetchMxRecords, validateSpf, inspectDmarc, checkBimi } from './email-auth-engine';
import { fetchCruxReport, summarizeCrux } from './crux-engine';
import { classifyCdn, fingerprintCms } from './fingerprint-engine';
import { buildWellKnownPaths, previewWellKnownPath, type WellKnownPath } from './wellknown-engine';
import { computeScorecard, type ScoreVector } from './scoring-engine';
import { exportCsv, exportJson, exportMarkdown, exportPdf, type ReportMetadata } from './export-engine';
import { renderSocialCard } from './social-card-engine';
import { deleteAudit, getSetting, listAudits, purgeAllAudits, saveAudit, setSetting } from './vault-db';
import { downloadBlob, downloadText } from '../../lib/download';
import type { AsyncTaskState, Finding, ParsedUrl } from './site-intel-types';
import type { AuditRecord } from './site-intel-types';

const SECTIONS = [
  { key: 'lexical', label: 'URL Forensics' },
  { key: 'dns', label: 'DNS & Network' },
  { key: 'registration', label: 'Registration & History' },
  { key: 'tls', label: 'SSL/TLS & Security' },
  { key: 'email', label: 'Email Authentication' },
  { key: 'performance', label: 'Performance & Tech' },
  { key: 'scorecard', label: 'Scorecard & Export' },
] as const;
type SectionKey = typeof SECTIONS[number]['key'];

function Severity({ level }: { level: Finding['severity'] }) {
  return <span className={`severity-chip severity-${level}`}>{level.toUpperCase()}</span>;
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li className={`finding-row finding-${finding.severity}`}>
      <Severity level={finding.severity} />
      <div>
        <p className="finding-label">{finding.label}{finding.terms?.map((t) => <InfoBadge key={t} term={t} />)}</p>
        <p className="finding-detail">{finding.detail}</p>
      </div>
    </li>
  );
}

function TaskPanel<T>({ state, render }: { state: AsyncTaskState<T>; render: (data: T) => React.ReactNode }) {
  if (state.status === 'idle') return <p className="task-idle">Not yet run.</p>;
  if (state.status === 'loading') return <p className="task-loading" role="status">Loading…</p>;
  if (state.status === 'blocked') return <p className="task-blocked" role="status">{state.blockedReason}</p>;
  if (state.status === 'error') return <p className="task-error" role="alert">{state.error}</p>;
  if (state.data === undefined) return null;
  return <>{render(state.data)}</>;
}

const initialTask = <T,>(): AsyncTaskState<T> => ({ status: 'idle' });

export default function SiteIntelWorkspace() {
  const [rawInput, setRawInput] = useState('');
  const [parsed, setParsed] = useState<ParsedUrl | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>('lexical');

  const [dnsTable, setDnsTable] = useState(initialTask<Awaited<ReturnType<typeof fetchDnsTable>>>());
  const [ptrMap, setPtrMap] = useState<Record<string, string | null>>({});
  const [caa, setCaa] = useState(initialTask<{ findings: Finding[] }>());
  const [dnssec, setDnssec] = useState(initialTask<{ finding: Finding }>());
  const [hosting, setHosting] = useState(initialTask<{ findings: Finding[]; intel: Awaited<ReturnType<typeof profileHosting>>['intel'] }>());
  const [nsRedundancy, setNsRedundancy] = useState(initialTask<{ finding: Finding }>());
  const [anycast, setAnycast] = useState<Finding | null>(null);
  const [dnsbl, setDnsbl] = useState(initialTask<{ finding: Finding; results: Awaited<ReturnType<typeof scanDnsbl>>['results'] }>());

  const [rdap, setRdap] = useState<AsyncTaskState<RdapRecord>>({ status: 'idle' });
  const [wayback, setWayback] = useState(initialTask<WaybackTimeline>());

  const [ct, setCt] = useState(initialTask<CtReport>());
  const [hsts, setHsts] = useState(initialTask<{ finding: Finding }>());

  const [mx, setMx] = useState(initialTask<{ finding: Finding }>());
  const [spf, setSpf] = useState(initialTask<{ findings: Finding[] }>());
  const [dmarc, setDmarc] = useState(initialTask<{ findings: Finding[] }>());
  const [bimi, setBimi] = useState(initialTask<{ finding: Finding }>());

  const [cruxKey, setCruxKey] = useState('');
  const [crux, setCrux] = useState(initialTask<ReturnType<typeof summarizeCrux>>());
  const [cdnFindings, setCdnFindings] = useState<Finding[]>([]);
  const [cmsFindings, setCmsFindings] = useState<Finding[]>([]);
  const [wellKnown, setWellKnown] = useState<WellKnownPath[]>([]);
  const [wellKnownPreview, setWellKnownPreview] = useState<Record<string, { ok: boolean; body?: string; error?: string }>>({});

  const [metadata, setMetadata] = useState<ReportMetadata>({ auditorName: '', organization: '', notes: '', auditTimestamp: Date.now() });
  const [vault, setVault] = useState<AuditRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const sanitizedUrl = useMemo(() => (parsed ? buildSanitizedUrl(parsed) : ''), [parsed]);
  const homoglyphs = useMemo(() => (parsed ? detectHomoglyphs(parsed.hostnameUnicode) : null), [parsed]);
  const entropy = useMemo(() => (parsed ? shannonEntropy(parsed.sld || parsed.host) : null), [parsed]);
  const typosquats = useMemo(() => (parsed ? findTyposquatMatches(parsed.registrableDomain) : []), [parsed]);
  const trackingParams = useMemo(() => (parsed ? classifyQueryParams(parsed.queryParams) : []), [parsed]);
  const shortener = useMemo(() => (parsed ? detectShortener(parsed.host, parsed.normalized) : null), [parsed]);
  const schemeFindings = useMemo(() => (parsed ? analyzeSchemeSecurity(parsed) : []), [parsed]);

  async function runAnalysis() {
    const result = parseUrl(rawInput);
    setParsed(result);
    if (!result.normalized) return;
    setBusy(true);
    const hostname = result.host.split(':')[0];
    const origin = `${result.protocol}://${result.host}`;

    setDnsTable({ status: 'loading' });
    setRdap({ status: 'loading' });
    setWayback({ status: 'loading' });
    setCt({ status: 'loading' });
    setHsts({ status: 'loading' });
    setMx({ status: 'loading' });
    setSpf({ status: 'loading' });
    setDmarc({ status: 'loading' });
    setBimi({ status: 'loading' });
    setCaa({ status: 'loading' });
    setDnssec({ status: 'loading' });
    setDnsbl({ status: 'loading' });

    const storedKey = await getSetting<string>('crux-api-key');
    if (storedKey) setCruxKey(storedKey);

    const [dnsRes, rdapRes, waybackRes, ctRes, hstsRes, mxRes, spfRes, dmarcRes, bimiRes, caaRes, dnssecRes, dnsblRes] = await Promise.all([
      fetchDnsTable(hostname),
      fetchRdap(result.registrableDomain || hostname),
      fetchWaybackTimeline(hostname),
      fetchCtLog(hostname),
      checkHstsPreload(hostname),
      fetchMxRecords(hostname),
      validateSpf(hostname),
      inspectDmarc(hostname),
      checkBimi(hostname),
      validateCaaRecords(hostname),
      checkDnssecSignals(hostname),
      scanDnsbl({ domain: hostname }),
    ]);

    setDnsTable({ status: 'ready', data: dnsRes, fetchedAt: Date.now() });
    setRdap(rdapRes);
    setWayback(waybackRes);
    setCt(ctRes);
    setHsts({ status: 'ready', data: { finding: describeHstsPreload(hstsRes.status === 'ready' && hstsRes.data ? hstsRes.data : { status: 'unknown', raw: null }) }, fetchedAt: Date.now() });
    setMx({ status: 'ready', data: { finding: mxRes.finding }, fetchedAt: Date.now() });
    setSpf({ status: 'ready', data: { findings: spfRes.findings }, fetchedAt: Date.now() });
    setDmarc({ status: 'ready', data: { findings: dmarcRes.findings }, fetchedAt: Date.now() });
    setBimi({ status: 'ready', data: { finding: bimiRes.finding }, fetchedAt: Date.now() });
    setCaa({ status: 'ready', data: { findings: caaRes.findings }, fetchedAt: Date.now() });
    setDnssec({ status: 'ready', data: { finding: dnssecRes.finding }, fetchedAt: Date.now() });
    setDnsbl({ status: 'ready', data: { finding: dnsblRes.finding, results: dnsblRes.results }, fetchedAt: Date.now() });

    const { v4, v6 } = extractIps(dnsRes);
    const nameservers = extractNameservers(dnsRes);
    const [ptrs, hostingRes, nsRedundancyRes] = await Promise.all([
      resolvePtrRecords(v4),
      profileHosting(v4),
      checkNameserverRedundancy(nameservers),
    ]);
    setPtrMap(ptrs);
    setHosting({ status: 'ready', data: hostingRes, fetchedAt: Date.now() });
    setNsRedundancy({ status: 'ready', data: { finding: nsRedundancyRes.finding }, fetchedAt: Date.now() });
    setAnycast(detectAnycast(hostingRes.intel));

    setCdnFindings(classifyCdn([...dnsRes.CNAME.answers.map((a) => a.data), ...nameservers]));
    setCmsFindings(fingerprintCms(result.normalized));
    setWellKnown(buildWellKnownPaths(origin));

    setCrux({ status: 'loading' });
    const cruxRes = await fetchCruxReport(origin, storedKey ?? null);
    if (cruxRes.status === 'ready' && cruxRes.data) setCrux({ status: 'ready', data: summarizeCrux(cruxRes.data), fetchedAt: Date.now() });
    else setCrux({ status: cruxRes.status, error: cruxRes.error, blockedReason: cruxRes.blockedReason });

    setBusy(false);
    void v6; // reserved for future dual-stack detail panel
  }

  async function persistCruxKey(key: string) {
    setCruxKey(key);
    await setSetting('crux-api-key', key);
  }

  const scorecard = useMemo(() => {
    const byVector: Record<ScoreVector, Finding[]> = { security: [], dnsHygiene: [], networkInfrastructure: [], domainLongevity: [], webStandards: [] };
    byVector.security.push(...schemeFindings);
    if (homoglyphs?.confusableChars.length) byVector.security.push({ id: 'homoglyph-risk', severity: 'risk', label: 'Homoglyph characters detected', detail: 'The hostname contains lookalike characters from another script.', terms: ['homoglyph'] });
    typosquats.slice(0, 3).forEach((m) => byVector.security.push({ id: `typosquat-${m.brand}`, severity: m.risk, label: `Possible typosquat of ${m.brand}`, detail: `Edit distance ${m.distance}.`, terms: ['typosquatting'] }));
    if (dnsbl.data) byVector.security.push(dnsbl.data.finding);
    if (ct.data) byVector.security.push(assessCertificateExpiry(ct.data));
    if (hsts.data) byVector.security.push(hsts.data.finding);
    if (dmarc.data) byVector.security.push(...dmarc.data.findings);
    if (spf.data) byVector.security.push(...spf.data.findings);

    if (dnsTable.data) byVector.dnsHygiene.push(auditIpv6Readiness(dnsTable.data.AAAA));
    if (caa.data) byVector.dnsHygiene.push(...caa.data.findings);
    if (dnssec.data) byVector.dnsHygiene.push(dnssec.data.finding);
    if (mx.data) byVector.dnsHygiene.push(mx.data.finding);
    if (bimi.data) byVector.dnsHygiene.push(bimi.data.finding);

    if (nsRedundancy.data) byVector.networkInfrastructure.push(nsRedundancy.data.finding);
    if (anycast) byVector.networkInfrastructure.push(anycast);
    if (hosting.data) byVector.networkInfrastructure.push(...hosting.data.findings.slice(0, 3));
    byVector.networkInfrastructure.push(...cdnFindings);

    if (rdap.status === 'ready' && rdap.data) {
      byVector.domainLongevity.push(assessDomainAge(rdap.data));
      byVector.domainLongevity.push(assessExpiration(rdap.data));
    }

    byVector.webStandards.push(...cmsFindings);
    if (crux.data) byVector.webStandards.push(...crux.data);

    return computeScorecard(byVector);
  }, [schemeFindings, homoglyphs, typosquats, dnsbl.data, ct.data, hsts.data, dmarc.data, spf.data, dnsTable.data, caa.data, dnssec.data, mx.data, bimi.data, nsRedundancy.data, anycast, hosting.data, cdnFindings, rdap, cmsFindings, crux.data]);

  const graphData: NodeGraphData = useMemo(() => {
    if (!parsed || !dnsTable.data) return { nodes: [], edges: [] };
    const nodes: NodeGraphData['nodes'] = [{ id: 'root', label: parsed.host, layer: 0, detail: parsed.normalized }];
    const edges: NodeGraphData['edges'] = [];
    for (const cname of dnsTable.data.CNAME.answers) {
      nodes.push({ id: `cname-${cname.data}`, label: cname.data.replace(/\.$/, ''), layer: 1, detail: `CNAME alias, TTL ${cname.ttl}s` });
      edges.push({ from: 'root', to: `cname-${cname.data}` });
    }
    const { v4 } = extractIps(dnsTable.data);
    const intel = hosting.data?.intel ?? [];
    for (const ip of v4) {
      const nodeId = `ip-${ip}`;
      nodes.push({ id: nodeId, label: ip, layer: 2, detail: ptrMap[ip] ? `Reverse DNS: ${ptrMap[ip]}` : 'No reverse DNS' });
      edges.push({ from: dnsTable.data.CNAME.answers[0] ? `cname-${dnsTable.data.CNAME.answers[0].data}` : 'root', to: nodeId });
      const match = intel.find((i) => i.ip === ip);
      if (match?.asn) {
        const asnId = `asn-${match.asn}`;
        if (!nodes.some((n) => n.id === asnId)) nodes.push({ id: asnId, label: match.asn, layer: 3, detail: match.organization ?? 'Unknown organization' });
        edges.push({ from: nodeId, to: asnId });
        if (match.country) {
          const countryId = `country-${match.country}`;
          if (!nodes.some((n) => n.id === countryId)) nodes.push({ id: countryId, label: match.country, layer: 4, detail: `${match.city ?? ''} ${match.country}`.trim() });
          edges.push({ from: asnId, to: countryId });
        }
      }
    }
    return { nodes, edges };
  }, [parsed, dnsTable.data, hosting.data, ptrMap]);

  async function refreshVault() { setVault(await listAudits()); }

  async function saveCurrentAudit() {
    if (!parsed) return;
    await saveAudit({
      url: parsed.normalized, createdAt: Date.now(), updatedAt: Date.now(), tags: [], notes: metadata.notes,
      auditorName: metadata.auditorName, organization: metadata.organization,
      snapshot: { parsed, scorecard }, scorecard,
    });
    await refreshVault();
  }

  const exportBundle = useMemo(() => ({
    url: parsed?.normalized ?? rawInput,
    metadata,
    scorecard,
    findingsByVector: Object.fromEntries(scorecard.vectors.map((v) => [v.vector, v.findings])),
  }), [parsed, rawInput, metadata, scorecard]);

  return (
    <div className="site-intel-workspace">
      <div className="site-intel-input-row">
        <label htmlFor="site-intel-url">URL, domain, or partial address</label>
        <div className="site-intel-input-controls">
          <input
            id="site-intel-url"
            type="text"
            placeholder="example.com or https://sub.domain.co.uk:8080/path?q=1"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void runAnalysis(); }}
          />
          <button type="button" onClick={() => void runAnalysis()} disabled={busy || !rawInput.trim()}>
            {busy ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
      </div>

      <nav className="site-intel-tabs" aria-label="Report sections">
        {SECTIONS.map((s) => (
          <button key={s.key} type="button" className={activeSection === s.key ? 'active' : ''} onClick={() => setActiveSection(s.key)}>{s.label}</button>
        ))}
      </nav>

      {parsed?.errors.length ? <p className="task-error" role="alert">{parsed.errors.join(' ')}</p> : null}

      {parsed ? (
        <div className="site-intel-sections">
          <section className={`site-intel-section ${activeSection === 'lexical' ? 'open' : ''}`} aria-labelledby="sec-lexical">
            <h2 id="sec-lexical">URL Forensics</h2>
            <div className="url-breadcrumb">
              {parsed.tokens.map((t, i) => <span key={i} className={`url-token url-token-${t.kind}`}>{t.label}: {t.value}</span>)}
            </div>
            {homoglyphs ? (
              <div className="lexical-card">
                <h3>Homoglyph / IDN spoofing <InfoBadge term="homoglyph" /></h3>
                <p>Unicode: {homoglyphs.unicodeForm} · Punycode: {homoglyphs.punycodeForm}</p>
                {homoglyphs.confusableChars.length ? (
                  <ul>{homoglyphs.confusableChars.map((c) => <li key={c.codePoint}>{c.char} ({c.codePoint}, {c.script}) looks like "{c.looksLike}"</li>)}</ul>
                ) : <p>No confusable characters detected.</p>}
              </div>
            ) : null}
            {entropy ? (
              <div className="lexical-card">
                <h3>Lexical entropy <InfoBadge term="entropy" /></h3>
                <p>{entropy.entropyBits} bits ({entropy.classification})</p>
              </div>
            ) : null}
            {typosquats.length ? (
              <div className="lexical-card">
                <h3>Typosquat candidates <InfoBadge term="typosquatting" /></h3>
                <ul>{typosquats.map((m) => <li key={m.brand}>{parsed.registrableDomain} vs {m.brand} — distance {m.distance}</li>)}</ul>
              </div>
            ) : null}
            <div className="lexical-card">
              <h3>Query parameters <InfoBadge term="tracking-token" /></h3>
              <ul>{trackingParams.map((p) => <li key={p.key}>{p.key} — {p.category}{p.service ? ` (${p.service})` : ''}</li>)}</ul>
              {sanitizedUrl ? <p>Sanitized: <code>{sanitizedUrl}</code> <button type="button" onClick={() => navigator.clipboard.writeText(sanitizedUrl)}>Copy</button></p> : null}
            </div>
            {shortener?.isShortener ? <p className="finding-row finding-warn"><Severity level="warn" /> {shortener.note}</p> : null}
            <ul className="finding-list">{schemeFindings.map((f) => <FindingRow key={f.id} finding={f} />)}</ul>
          </section>

          <section className={`site-intel-section ${activeSection === 'dns' ? 'open' : ''}`} aria-labelledby="sec-dns">
            <h2 id="sec-dns">DNS & Network</h2>
            <TaskPanel state={dnsTable} render={(table) => (
              <div className="dns-table">
                {(['A', 'AAAA', 'CNAME', 'NS', 'SOA', 'TXT', 'MX'] as const).map((type) => (
                  <div key={type} className="dns-row">
                    <strong>{type}</strong>
                    <ul>{table[type].answers.map((a, i) => (
                      <li key={i} title={ptrMap[a.data] ?? undefined}>{a.data} (TTL {a.ttl}s)</li>
                    ))}</ul>
                  </div>
                ))}
              </div>
            )} />
            <h3>IPv6 readiness <InfoBadge term="ipv6" /></h3>
            {dnsTable.data ? <FindingRow finding={auditIpv6Readiness(dnsTable.data.AAAA)} /> : null}
            <h3>CAA records <InfoBadge term="caa" /></h3>
            <TaskPanel state={caa} render={(d) => <ul className="finding-list">{d.findings.map((f) => <FindingRow key={f.id} finding={f} />)}</ul>} />
            <h3>DNSSEC <InfoBadge term="dnssec" /></h3>
            <TaskPanel state={dnssec} render={(d) => <FindingRow finding={d.finding} />} />
            <h3>Nameserver redundancy <InfoBadge term="asn" /></h3>
            <TaskPanel state={nsRedundancy} render={(d) => <FindingRow finding={d.finding} />} />
            <h3>Hosting / ASN profile</h3>
            <TaskPanel state={hosting} render={(d) => <ul className="finding-list">{d.findings.map((f) => <FindingRow key={f.id} finding={f} />)}</ul>} />
            {anycast ? <FindingRow finding={anycast} /> : null}
            <h3>DNSBL reputation <InfoBadge term="dnsbl" /></h3>
            <TaskPanel state={dnsbl} render={(d) => <FindingRow finding={d.finding} />} />
            <h3>Network graph</h3>
            <NodeGraph data={graphData} />
          </section>

          <section className={`site-intel-section ${activeSection === 'registration' ? 'open' : ''}`} aria-labelledby="sec-reg">
            <h2 id="sec-reg">Registration & History</h2>
            <TaskPanel state={rdap} render={(d) => (
              <>
                <FindingRow finding={assessDomainAge(d)} />
                <FindingRow finding={assessExpiration(d)} />
                <p>Registrar: {d.registrarName ?? 'Unknown'} · Abuse contact: {d.abuseEmail ?? 'Unknown'}</p>
              </>
            )} />
            <h3>Wayback Machine timeline <InfoBadge term="wayback-cdx" /></h3>
            <TaskPanel state={wayback} render={(d) => (
              <>
                <p>{d.totalCaptures} capture(s){d.truncated ? ' (index truncated)' : ''}{d.earliest ? ` · earliest ${d.earliest.timestamp.slice(0, 8)}` : ''}</p>
                {d.earliest ? <a href={waybackCaptureUrl(d.earliest)} target="_blank" rel="noreferrer">View earliest snapshot</a> : null}
                {d.contentChangePoints.length ? <p>{d.contentChangePoints.length} detected content-change point(s).</p> : null}
              </>
            )} />
          </section>

          <section className={`site-intel-section ${activeSection === 'tls' ? 'open' : ''}`} aria-labelledby="sec-tls">
            <h2 id="sec-tls">SSL/TLS & Security</h2>
            <TaskPanel state={ct} render={(d) => (
              <>
                <FindingRow finding={summarizeSanSubdomains(d)} />
                <FindingRow finding={assessCertificateExpiry(d)} />
              </>
            )} />
            <h3>HSTS preload <InfoBadge term="hsts" /></h3>
            <TaskPanel state={hsts} render={(d) => <FindingRow finding={d.finding} />} />
          </section>

          <section className={`site-intel-section ${activeSection === 'email' ? 'open' : ''}`} aria-labelledby="sec-email">
            <h2 id="sec-email">Email Authentication</h2>
            <TaskPanel state={mx} render={(d) => <FindingRow finding={d.finding} />} />
            <TaskPanel state={spf} render={(d) => <ul className="finding-list">{d.findings.map((f) => <FindingRow key={f.id} finding={f} />)}</ul>} />
            <TaskPanel state={dmarc} render={(d) => <ul className="finding-list">{d.findings.map((f) => <FindingRow key={f.id} finding={f} />)}</ul>} />
            <TaskPanel state={bimi} render={(d) => <FindingRow finding={d.finding} />} />
          </section>

          <section className={`site-intel-section ${activeSection === 'performance' ? 'open' : ''}`} aria-labelledby="sec-perf">
            <h2 id="sec-perf">Performance & Tech</h2>
            <label>CrUX API key (stored locally only) <InfoBadge term="core-web-vitals" />
              <input type="password" value={cruxKey} onChange={(e) => void persistCruxKey(e.target.value)} placeholder="Optional — your own Google CrUX API key" />
            </label>
            <TaskPanel state={crux} render={(findings) => <ul className="finding-list">{findings.map((f) => <FindingRow key={f.id} finding={f} />)}</ul>} />
            <h3>CDN / edge platform <InfoBadge term="cdn" /></h3>
            <ul className="finding-list">{cdnFindings.map((f) => <FindingRow key={f.id} finding={f} />)}</ul>
            <h3>CMS / platform fingerprint <InfoBadge term="cms-fingerprint" /></h3>
            <ul className="finding-list">{cmsFindings.map((f) => <FindingRow key={f.id} finding={f} />)}</ul>
            <h3>robots.txt / sitemap / security.txt</h3>
            <ul className="wellknown-list">
              {wellKnown.map((w) => (
                <li key={w.path}>
                  <strong>{w.label}</strong>
                  <a href={w.url} target="_blank" rel="noreferrer">Open directly</a>
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await previewWellKnownPath(w.url);
                      setWellKnownPreview((prev) => ({ ...prev, [w.path]: result }));
                    }}
                  >Fetch preview</button>
                  {wellKnownPreview[w.path]?.body ? <pre className="wellknown-preview">{wellKnownPreview[w.path].body}</pre> : null}
                  {wellKnownPreview[w.path]?.error ? <p className="task-error">{wellKnownPreview[w.path].error}</p> : null}
                </li>
              ))}
            </ul>
          </section>

          <section className={`site-intel-section ${activeSection === 'scorecard' ? 'open' : ''}`} aria-labelledby="sec-score">
            <h2 id="sec-score">Scorecard & Export</h2>
            <ScoreRadar scorecard={scorecard} onSelectVector={(vector) => {
              const map: Record<string, SectionKey> = { security: 'tls', dnsHygiene: 'dns', networkInfrastructure: 'dns', domainLongevity: 'registration', webStandards: 'performance' };
              setActiveSection(map[vector] ?? 'scorecard');
            }} />

            <div className="metadata-editor">
              <h3>Audit metadata (Feature 37)</h3>
              <label>Auditor name <input value={metadata.auditorName} onChange={(e) => setMetadata((m) => ({ ...m, auditorName: e.target.value }))} /></label>
              <label>Organization <input value={metadata.organization} onChange={(e) => setMetadata((m) => ({ ...m, organization: e.target.value }))} /></label>
              <label>Notes <textarea value={metadata.notes} onChange={(e) => setMetadata((m) => ({ ...m, notes: e.target.value }))} /></label>
            </div>

            <div className="export-actions">
              <button type="button" onClick={() => downloadText(exportJson(exportBundle), 'site-intelligence-audit.json', 'application/json')}>Export JSON</button>
              <button type="button" onClick={() => downloadText(exportMarkdown(exportBundle), 'site-intelligence-audit.md', 'text/markdown')}>Export Markdown</button>
              <button type="button" onClick={() => downloadText(exportCsv(exportBundle), 'site-intelligence-audit.csv', 'text/csv')}>Export CSV</button>
              <button type="button" onClick={() => downloadBlob(exportPdf(exportBundle), 'site-intelligence-audit.pdf')}>Export PDF</button>
              <button type="button" onClick={async () => downloadBlob(await renderSocialCard(exportBundle.url, scorecard, metadata), 'site-intelligence-card.png')}>Generate social card</button>
              <button type="button" onClick={() => void saveCurrentAudit()}>Save to local vault</button>
            </div>

            <div className="vault-panel">
              <h3>Offline report vault (Feature 38)</h3>
              <button type="button" onClick={() => void refreshVault()}>Refresh vault</button>
              <button type="button" onClick={async () => { await purgeAllAudits(); await refreshVault(); }}>Purge all local records</button>
              <ul className="vault-list">
                {vault.map((a) => (
                  <li key={a.id}>
                    <span>{a.url}</span>
                    <span>{new Date(a.updatedAt).toLocaleString()}</span>
                    <button type="button" onClick={async () => { if (a.id) { await deleteAudit(a.id); await refreshVault(); } }}>Delete</button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      ) : (
        <p className="site-intel-placeholder">Enter a URL or domain above and choose Analyze to run the full passive audit.</p>
      )}
    </div>
  );
}
