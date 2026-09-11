import { useMemo, useState } from 'react';
import { downloadText } from '../../lib/download';
import { compileSvgSprite, type SvgCompiledFile } from './svg-engine';
import { consumeFileInput } from '../../lib/file-input';
import VectorStudio from './VectorStudio';

type Source = { name: string; text: string };

function previewDataUri(file: SvgCompiledFile, color: '#111' | '#fff'): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" color="${color}"><defs>${file.symbol}</defs><use href="#${file.id}" width="64" height="64"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

export default function SvgWorkspace() {
  const [sources, setSources] = useState<Source[]>([]);
  const [currentColor, setCurrentColor] = useState(true);
  const [result, setResult] = useState<ReturnType<typeof compileSvgSprite> | null>(null);
  const [status, setStatus] = useState('Choose SVG files to inspect and compile.');
  const [search, setSearch] = useState('');

  const visibleFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!result || !query) return result?.files ?? [];
    return result.files.filter((file) => file.name.toLowerCase().includes(query) || file.id.toLowerCase().includes(query));
  }, [result, search]);

  async function load(list: FileList | null) {
    if (!list) return;
    const next = await Promise.all(Array.from(list).map(async (file) => ({ name: file.name, text: await file.text() })));
    setSources(next);
    setResult(null);
    setSearch('');
    setStatus(`${next.length} SVG${next.length === 1 ? '' : 's'} ready for local optimization.`);
  }

  function updateCurrentColor(value: boolean) {
    setCurrentColor(value);
    setResult(null);
    setStatus('Normalization changed. Recompile to generate output with the new setting.');
  }

  function compile() {
    const output = compileSvgSprite(sources, { currentColor });
    setResult(output);
    if (!output.files.length && output.errors.length) {
      setStatus(`No symbols compiled. ${output.errors.length} file${output.errors.length === 1 ? '' : 's'} failed validation.`);
      return;
    }
    const issueParts: string[] = [];
    if (output.errors.length) issueParts.push(`${output.errors.length} failed`);
    if (output.warnings.length) issueParts.push(`${output.warnings.length} warning${output.warnings.length === 1 ? '' : 's'}`);
    setStatus(`Compiled ${output.files.length} symbol${output.files.length === 1 ? '' : 's'} locally${issueParts.length ? `; ${issueParts.join(', ')}.` : '.'}`);
  }

  async function copyUse(id: string) {
    try {
      await navigator.clipboard.writeText(`<svg aria-hidden="true"><use href="#${id}"></use></svg>`);
      setStatus(`Copied <use> snippet for ${id}.`);
    } catch {
      setStatus('Clipboard access was unavailable. Select the sprite output and copy manually.');
    }
  }

  return <>
    <div className="workspace-body" style={{ paddingBottom: 24 }}><VectorStudio /></div>
    <div className="workspace-header"><div><h2>Sprite & asset compiler</h2><p>Batch-optimize finished SVG assets and compile deterministic, collision-safe symbol sprites without leaving the browser.</p></div></div>
    <div className="workspace-body">
      <div className="field"><label htmlFor="svg-files">Choose SVG files</label><input id="svg-files" type="file" accept="image/svg+xml,.svg" multiple onChange={(event) => consumeFileInput(event.target, () => load(event.target.files))} /></div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}><input type="checkbox" checked={currentColor} onChange={(event) => updateCurrentColor(event.target.checked)} /> Normalize literal fill/stroke colors to currentColor</label>
      <p className="help-text">Paint-server references, CSS variables and inherited/context paint semantics are preserved. Executable script and SVG event-handler content is removed during compilation.</p>
      <div className="button-row"><button className="action-button" type="button" disabled={!sources.length} onClick={compile}>Compile sprite</button><button className="action-button secondary" type="button" disabled={!result?.files.length} onClick={() => result && downloadText(result.sprite, 'inmotools-sprite.svg', 'image/svg+xml')}>Download sprite</button></div>
      <div className="status-line" role="status">{status}</div>

      {result ? <>
        {result.errors.length ? <div className="notice" data-testid="svg-errors"><strong>Files not compiled</strong><ul>{result.errors.map((error) => <li key={`${error.name}-${error.message}`}><strong>{error.name}:</strong> {error.message}</li>)}</ul></div> : null}
        {result.warnings.length ? <div className="notice" data-testid="svg-warnings"><strong>Compiled with warnings</strong><ul>{result.warnings.map((warning) => <li key={`${warning.name}-${warning.message}`}><strong>{warning.name}:</strong> {warning.message}</li>)}</ul></div> : null}
        {result.files.length ? <>
          <div className="field" style={{ marginTop: 16, maxWidth: 420 }}><label htmlFor="svg-search">Search compiled symbols</label><input id="svg-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filename or symbol ID" /></div>
          <div aria-label="Compiled symbol previews" className="workspace-grid" style={{ marginTop: 16 }}>
            {visibleFiles.map((file) => <article className="notice" key={file.id} style={{ minWidth: 0 }}>
              <strong style={{ overflowWrap: 'anywhere' }}>{file.name}</strong>
              <div className="help-text" style={{ overflowWrap: 'anywhere' }}>{file.id}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginTop: 10 }}>
                <div style={{ background: '#fff', color: '#111', padding: 12, borderRadius: 10, textAlign: 'center' }}>
                  <span className="help-text">Light</span>
                  <img src={previewDataUri(file, '#111')} alt={`${file.id} light preview`} width="64" height="64" style={{ display: 'block', width: 64, height: 64, maxWidth: '100%', margin: '8px auto 0' }} />
                </div>
                <div style={{ background: '#111', color: '#fff', padding: 12, borderRadius: 10, textAlign: 'center' }}>
                  <span className="help-text">Dark</span>
                  <img src={previewDataUri(file, '#fff')} alt={`${file.id} dark preview`} width="64" height="64" style={{ display: 'block', width: 64, height: 64, maxWidth: '100%', margin: '8px auto 0' }} />
                </div>
              </div>
              <button className="action-button secondary" type="button" style={{ marginTop: 10 }} onClick={() => void copyUse(file.id)}>Copy &lt;use&gt;</button>
            </article>)}
          </div>
          <div className="result-table-wrap" role="region" aria-label="Compiled SVG symbols" tabIndex={0}><table><thead><tr><th scope="col">File</th><th scope="col">Symbol ID</th><th scope="col">Original</th><th scope="col">Optimized</th><th scope="col">Savings</th></tr></thead><tbody>{visibleFiles.map((file) => <tr key={file.id}><td>{file.name}</td><td>{file.id}</td><td>{file.originalBytes} B</td><td>{file.optimizedBytes} B</td><td>{file.originalBytes ? Math.max(0, Math.round((1 - file.optimizedBytes / file.originalBytes) * 100)) : 0}%</td></tr>)}</tbody></table></div>
          <pre className="code-output" tabIndex={0} aria-label="Compiled SVG sprite source">{result.sprite}</pre>
        </> : null}
      </> : null}
    </div>
  </>;
}
