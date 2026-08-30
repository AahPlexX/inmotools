import { useMemo, useState } from 'react';
import { downloadText } from '../../lib/download';
import { buildContrastMatrix, parseTokenLines, type ColorToken, type ContrastRole } from './contrast-engine';

const DEFAULT_TOKENS = `--ink: #101820;
--paper: #ffffff;
--signal: #205bd6;
--signal-soft: oklch(95% 0.025 255);
--muted: hsl(215 12% 42%);
--danger: #a52a2a;`;

type PreviewMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

const CVD_MATRICES: Record<Exclude<PreviewMode, 'none'>, number[]> = {
  protanopia: [0.56667, 0.43333, 0, 0.55833, 0.44167, 0, 0, 0.24167, 0.75833],
  deuteranopia: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7],
  tritanopia: [0.95, 0.05, 0, 0, 0.43333, 0.56667, 0, 0.475, 0.525],
};

function simulate(hex: string, mode: PreviewMode): string {
  if (mode === 'none') return hex;
  const value = hex.replace('#', '');
  const rgb = [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
  const matrix = CVD_MATRICES[mode];
  const next = [0, 1, 2].map((row) => Math.max(0, Math.min(255, Math.round(
    rgb[0] * matrix[row * 3] + rgb[1] * matrix[row * 3 + 1] + rgb[2] * matrix[row * 3 + 2],
  ))));
  return `#${next.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function cssName(token: ColorToken): string {
  return token.name.startsWith('--') ? token.name : `--${token.name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}`;
}

export default function ContrastWorkspace() {
  const [source, setSource] = useState(DEFAULT_TOKENS);
  const [role, setRole] = useState<ContrastRole>('body');
  const [view, setView] = useState<'table' | 'heatmap'>('table');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('none');
  const [foregroundName, setForegroundName] = useState('--ink');
  const [backgroundName, setBackgroundName] = useState('--paper');
  const [status, setStatus] = useState('Edit color tokens to build a local APCA/WCAG comparison matrix.');

  const parsed = useMemo(() => parseTokenLines(source), [source]);
  const cells = useMemo(() => buildContrastMatrix(parsed.tokens, role), [parsed.tokens, role]);
  const foreground = parsed.tokens.find((token) => token.name === foregroundName) ?? parsed.tokens[0];
  const background = parsed.tokens.find((token) => token.name === backgroundName) ?? parsed.tokens[1] ?? parsed.tokens[0];
  const selectedCell = cells.find((cell) => cell.foreground === foreground && cell.background === background);

  const css = useMemo(() => `:root {\n${parsed.tokens.map((token) => `  ${cssName(token)}: ${token.source};`).join('\n')}\n}\n`, [parsed.tokens]);

  async function copyCss() {
    try {
      await navigator.clipboard.writeText(css);
      setStatus(`Copied ${parsed.tokens.length} CSS custom properties.`);
    } catch {
      setStatus('Clipboard access was unavailable. Use Download CSS instead.');
    }
  }

  return <>
    <div className="workspace-header"><div><h2>APCA / OKLCH token matrix</h2><p>Compare directional APCA guidance with the conventional WCAG 2 contrast ratio.</p></div></div>
    <div className="workspace-body">
      <div className="notice"><strong>Important:</strong> APCA Lc is shown as perceptual guidance, not as a WCAG 2.x conformance result. The WCAG ratio is reported separately.</div>
      <div className="workspace-grid" style={{ marginTop: 18 }}>
        <div className="field"><label htmlFor="contrast-tokens">Color tokens</label><textarea id="contrast-tokens" value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false}/><small>Use <code>name: CSS-color;</code> or <code>name = CSS-color;</code>. Hex, RGB, HSL, and OKLCH are accepted.</small></div>
        <div>
          <div className="field"><label htmlFor="contrast-role">APCA guidance role</label><select id="contrast-role" value={role} onChange={(event) => setRole(event.target.value as ContrastRole)}><option value="body">Body text guidance</option><option value="large">Large text guidance</option><option value="ui">UI graphics/text guidance</option></select></div>
          <div className="field" style={{ marginTop: 14 }}><label htmlFor="contrast-view">Matrix view</label><select id="contrast-view" value={view} onChange={(event) => setView(event.target.value as 'table' | 'heatmap')}><option value="table">Accessible table</option><option value="heatmap">Compact visual matrix</option></select></div>
          <div className="metric-row"><div className="metric"><span>Valid tokens</span><strong>{parsed.tokens.length}</strong></div><div className="metric"><span>Pairings</span><strong>{cells.length}</strong></div><div className="metric"><span>Source errors</span><strong>{parsed.errors.length}</strong></div></div>
          {parsed.errors.length ? <div className="notice" style={{ marginTop: 14 }}><strong>Lines to fix:</strong><ul style={{ marginBottom: 0 }}>{parsed.errors.map((error) => <li key={`${error.line}-${error.source}`}>Line {error.line}: {error.source}</li>)}</ul></div> : null}
        </div>
      </div>

      {parsed.tokens.length ? <>
        <h3 style={{ marginTop: 24 }}>Contrast matrix</h3>
        {view === 'table' ? <div className="result-table-wrap" tabIndex={0} aria-label="APCA and WCAG contrast matrix"><table><thead><tr><th scope="col">Foreground</th><th scope="col">Background</th><th scope="col">APCA Lc</th><th scope="col">WCAG 2 ratio</th><th scope="col">Guidance</th></tr></thead><tbody>{cells.map((cell) => <tr key={`${cell.foreground.name}-${cell.background.name}`}><td><span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: cell.foreground.hex, marginRight: 8, border: '1px solid var(--line)' }}/>{cell.foreground.name}</td><td><span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: cell.background.hex, marginRight: 8, border: '1px solid var(--line)' }}/>{cell.background.name}</td><td>{cell.apcaLc.toFixed(1)}</td><td>{cell.wcag.toFixed(2)}:1</td><td>{cell.guidanceLabel}</td></tr>)}</tbody></table></div> : <div className="result-table-wrap" tabIndex={0} aria-label="Compact contrast heatmap"><div style={{ display: 'grid', gridTemplateColumns: `repeat(${parsed.tokens.length}, minmax(104px, 1fr))`, minWidth: parsed.tokens.length * 104 }}>{cells.map((cell) => <button key={`${cell.foreground.name}-${cell.background.name}`} type="button" onClick={() => { setForegroundName(cell.foreground.name); setBackgroundName(cell.background.name); }} aria-label={`${cell.foreground.name} on ${cell.background.name}: APCA ${cell.apcaLc.toFixed(1)}, WCAG ${cell.wcag.toFixed(2)} to 1`} style={{ minHeight: 88, border: '1px solid rgba(127,127,127,.35)', background: cell.background.hex, color: cell.foreground.hex, padding: 8, textAlign: 'left' }}><strong>{cell.apcaLc.toFixed(0)} Lc</strong><br/><small>{cell.wcag.toFixed(1)}:1</small></button>)}</div></div>}

        <h3 style={{ marginTop: 24 }}>Component sandbox</h3>
        <div className="workspace-grid three">
          <div className="field"><label htmlFor="sandbox-fg">Foreground</label><select id="sandbox-fg" value={foreground?.name ?? ''} onChange={(event) => setForegroundName(event.target.value)}>{parsed.tokens.map((token) => <option key={token.name} value={token.name}>{token.name}</option>)}</select></div>
          <div className="field"><label htmlFor="sandbox-bg">Background</label><select id="sandbox-bg" value={background?.name ?? ''} onChange={(event) => setBackgroundName(event.target.value)}>{parsed.tokens.map((token) => <option key={token.name} value={token.name}>{token.name}</option>)}</select></div>
          <div className="field"><label htmlFor="sandbox-cvd">Color-vision preview</label><select id="sandbox-cvd" value={previewMode} onChange={(event) => setPreviewMode(event.target.value as PreviewMode)}><option value="none">No simulation</option><option value="protanopia">Protanopia preview</option><option value="deuteranopia">Deuteranopia preview</option><option value="tritanopia">Tritanopia preview</option></select><small>Preview aid only; simulation is not a pass/fail accessibility test.</small></div>
        </div>
        {foreground && background ? <div style={{ marginTop: 16, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: 22, background: simulate(background.hex, previewMode), color: simulate(foreground.hex, previewMode) }}><p style={{ marginTop: 0, fontSize: 18, fontWeight: 750 }}>Readable interface sample</p><p>Use the matrix to compare perceptual APCA guidance and WCAG 2 contrast without conflating the two systems.</p><button type="button" style={{ border: `1px solid ${simulate(foreground.hex, previewMode)}`, borderRadius: 8, padding: '10px 14px', background: 'transparent', color: 'inherit', fontWeight: 700 }}>Example action</button>{selectedCell ? <p style={{ marginBottom: 0, marginTop: 16, fontSize: 12 }}>APCA {selectedCell.apcaLc.toFixed(1)} Lc · WCAG {selectedCell.wcag.toFixed(2)}:1</p> : null}</div> : null}

        <div className="button-row"><button className="action-button" type="button" onClick={() => void copyCss()}>Copy CSS variables</button><button className="action-button secondary" type="button" onClick={() => { downloadText(css, 'color-tokens.css', 'text/css;charset=utf-8'); setStatus('Downloaded CSS token variables locally.'); }}>Download CSS</button></div>
      </> : null}
      <div className={`status-line ${parsed.tokens.length ? 'good' : ''}`} role="status">{status}</div>
    </div>
  </>;
}
