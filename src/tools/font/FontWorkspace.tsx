import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadBytes, downloadText } from '../../lib/download';
import { collectRequiredCodePoints, inspectFont, subsetToWoff2, type FontInspection, type FontPreset } from './font-engine';

const PRESET_OPTIONS: Array<{ id: FontPreset; label: string }> = [
  { id: 'basic-latin', label: 'Basic Latin' },
  { id: 'latin-1', label: 'Latin-1 supplement' },
  { id: 'digits', label: 'Digits' },
  { id: 'punctuation', label: 'Punctuation' },
];

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

export default function FontWorkspace() {
  const faceRef = useRef<FontFace | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [inspection, setInspection] = useState<FontInspection | null>(null);
  const [presets, setPresets] = useState<FontPreset[]>(['basic-latin']);
  const [customText, setCustomText] = useState('');
  const [query, setQuery] = useState('');
  const [subsetBytes, setSubsetBytes] = useState<Uint8Array | null>(null);
  const [subsetCount, setSubsetCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Choose a TTF, OTF, WOFF, or WOFF2 font to inspect it locally.');

  useEffect(() => () => { if (faceRef.current) document.fonts.delete(faceRef.current); }, []);

  const requested = useMemo(() => collectRequiredCodePoints({ presets, customText }), [customText, presets]);
  const filteredGlyphs = useMemo(() => {
    if (!inspection) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return inspection.glyphs.slice(0, 500);
    return inspection.glyphs.filter((glyph) => glyph.name.toLowerCase().includes(needle) || glyph.character.includes(query) || `u+${glyph.codePoint.toString(16).padStart(4, '0')}`.includes(needle)).slice(0, 500);
  }, [inspection, query]);

  const css = inspection ? `@font-face {\n  font-family: '${inspection.familyName.replace(/'/g, "\\'")} Subset';\n  src: url('./${file?.name.replace(/\.[^.]+$/, '') || 'font'}.subset.woff2') format('woff2');\n  font-style: normal;\n  font-weight: 400;\n  font-display: swap;\n}\n` : '';

  async function chooseFile(next: File | undefined) {
    if (!next) return;
    setBusy(true); setFile(next); setInspection(null); setSubsetBytes(null); setStatus('Parsing font tables and cmap locally…');
    try {
      const bytes = await next.arrayBuffer();
      const result = await inspectFont(bytes, next.name);
      setBuffer(bytes); setInspection(result);
      if (typeof FontFace !== 'undefined') {
        if (faceRef.current) document.fonts.delete(faceRef.current);
        try {
          const face = new FontFace(`InmoPreview-${Date.now()}`, bytes);
          await face.load(); document.fonts.add(face); faceRef.current = face;
        } catch { faceRef.current = null; }
      }
      setStatus(`Parsed ${result.glyphCount.toLocaleString()} glyphs and ${result.glyphs.length.toLocaleString()} cmap mappings locally.`);
    } catch (error) {
      setBuffer(null); setStatus(`Font inspection failed: ${error instanceof Error ? error.message : 'unsupported font'}`);
    } finally { setBusy(false); }
  }

  function togglePreset(preset: FontPreset) {
    setPresets((current) => current.includes(preset) ? current.filter((value) => value !== preset) : [...current, preset]);
    setSubsetBytes(null);
  }

  async function buildSubset() {
    if (!buffer || !inspection) return;
    setBusy(true); setStatus('Building a new SFNT font and compressing it to WOFF2 locally…');
    try {
      const result = await subsetToWoff2(buffer, { presets, customText });
      setSubsetBytes(result.bytes); setSubsetCount(result.glyphCount);
      setStatus(`Subset ready: ${result.glyphCount.toLocaleString()} glyphs · ${formatBytes(result.bytes.byteLength)} WOFF2.`);
    } catch (error) { setStatus(`Subset failed: ${error instanceof Error ? error.message : 'font encoding error'}`); }
    finally { setBusy(false); }
  }

  function downloadSubset() {
    if (!subsetBytes || !file) return;
    downloadBytes(subsetBytes, `${file.name.replace(/\.[^.]+$/, '')}.subset.woff2`, 'font/woff2');
    setStatus('Downloaded the locally generated WOFF2 subset.');
  }

  return <>
    <div className="workspace-header"><div><h2>Font glyph subsetter</h2><p>Inspect cmap coverage and source metrics, choose Unicode coverage, then build a smaller WOFF2 locally.</p></div></div>
    <div className="workspace-body">
      <div className="field"><label htmlFor="font-file">Font file</label><input id="font-file" type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" onChange={(event) => void chooseFile(event.target.files?.[0])}/><small>WOFF2 is decompressed locally before OpenType inspection; originals are never modified.</small></div>

      {inspection ? <>
        <div className="metric-row"><div className="metric"><span>Family</span><strong>{inspection.familyName}</strong></div><div className="metric"><span>Style</span><strong>{inspection.styleName}</strong></div><div className="metric"><span>Units/em</span><strong>{inspection.unitsPerEm}</strong></div><div className="metric"><span>Ascender</span><strong>{inspection.ascender}</strong></div><div className="metric"><span>Descender</span><strong>{inspection.descender}</strong></div><div className="metric"><span>Source</span><strong>{formatBytes(inspection.inputBytes)}</strong></div></div>

        <div className="workspace-grid" style={{ marginTop: 20 }}>
          <div><span className="field-label">Unicode presets</span><div className="check-list">{PRESET_OPTIONS.map((option) => <label className="check-item" key={option.id}><input type="checkbox" checked={presets.includes(option.id)} onChange={() => togglePreset(option.id)}/><span>{option.label}</span></label>)}</div></div>
          <div className="field"><label htmlFor="font-custom">Custom characters / sample text</label><textarea id="font-custom" value={customText} onChange={(event) => { setCustomText(event.target.value); setSubsetBytes(null); }} placeholder="Paste the exact text or extra characters the subset must support."/><small>{requested.length.toLocaleString()} unique requested code points before checking source coverage.</small></div>
        </div>

        <div className="button-row"><button className="action-button" type="button" disabled={busy || requested.length === 0} onClick={() => void buildSubset()}>{busy ? 'Working locally…' : 'Build WOFF2 subset'}</button>{subsetBytes ? <button className="action-button secondary" type="button" onClick={downloadSubset}>Download WOFF2</button> : null}{subsetBytes ? <button className="action-button secondary" type="button" onClick={() => { downloadText(css, `${file?.name.replace(/\.[^.]+$/, '') || 'font'}.subset.css`, 'text/css;charset=utf-8'); setStatus('Downloaded the matching @font-face snippet.'); }}>Download CSS</button> : null}</div>

        {subsetBytes ? <div className="workspace-grid" style={{ marginTop: 18 }}><div className="notice"><strong>Subset result</strong><br/>{subsetCount.toLocaleString()} glyphs · {formatBytes(subsetBytes.byteLength)}<br/><small>Source: {inspection.glyphCount.toLocaleString()} glyphs · {formatBytes(inspection.inputBytes)}</small></div><div className="field"><label htmlFor="font-css">@font-face snippet</label><textarea id="font-css" readOnly value={css}/></div></div> : null}

        <h3 style={{ marginTop: 24 }}>Glyph coverage</h3>
        <div className="field"><label htmlFor="glyph-search">Search glyphs</label><input id="glyph-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Character, glyph name, or U+0041"/><small>Showing up to 500 cmap mappings at once for responsive rendering.</small></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8, marginTop: 14 }} role="list" aria-label="Font glyph coverage">{filteredGlyphs.map((glyph) => <div role="listitem" key={`${glyph.codePoint}-${glyph.glyphIndex}`} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: 10, minWidth: 0 }}><div aria-hidden="true" style={{ fontSize: 30, lineHeight: 1.2, overflow: 'hidden' }}>{glyph.character}</div><strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{glyph.name}</strong><small>U+{glyph.codePoint.toString(16).toUpperCase().padStart(4, '0')} · aw {glyph.advanceWidth}</small></div>)}</div>
      </> : null}
      <div className={`status-line ${inspection ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
