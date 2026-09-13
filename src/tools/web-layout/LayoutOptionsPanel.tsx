import { useEffect, useState } from 'react';
import { DEFAULT_OPTIONS, parseOptions, type LayoutOptions } from './layout-options';
import type { LayoutProject } from './layout-engine';

type Props = { project: LayoutProject; panel: 'layout' | 'metadata'; onChange: (options: LayoutOptions) => void };
export function LayoutOptionsPanel({ project, panel, onChange }: Props) {
  const options = project.options ?? DEFAULT_OPTIONS;
  const [tracks, setTracks] = useState(options.tracks);
  const [metaDraft, setMetaDraft] = useState(JSON.stringify(options.customMeta, null, 2));
  const [error, setError] = useState('');
  const committedMeta = JSON.stringify(options.customMeta, null, 2);
  useEffect(() => setTracks(options.tracks), [options.tracks]);
  useEffect(() => setMetaDraft(committedMeta), [committedMeta]);
  function commit(patch: Partial<LayoutOptions>) {
    try { onChange(parseOptions({ ...options, ...patch })); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to apply options.'); }
  }
  return <details className="wl-advanced"><summary>{panel === 'layout' ? 'Tracks, wrapping and reading direction' : 'Custom document and social metadata'}</summary>
    {panel === 'layout' ? <>
      <label className="wl-field">Custom grid tracks<input value={tracks} onChange={e => setTracks(e.target.value)} placeholder="1fr 2fr 1fr" /></label>
      <p className="help-text">Examples: 1fr 2fr 1fr; repeat(3, minmax(0, 1fr)); repeat(auto-fit, minmax(12rem, 1fr)). Leave empty for automatic responsive tracks. Named areas take priority. Fixed tracks can overflow: inspect narrow previews.</p>
      <button type="button" onClick={() => { if (tracks.trim() && !CSS.supports('grid-template-columns', tracks)) { setError('This browser does not support that track definition.'); return; } commit({ tracks }); }}>Apply tracks</button>
      <label className="wl-field">Flexbox wrapping<select aria-label="Flexbox wrapping" value={options.wrap} onChange={e => commit({ wrap: e.target.value as LayoutOptions['wrap'] })}><option value="wrap">Wrap onto new lines</option><option value="nowrap">Keep one line</option><option value="wrap-reverse">Wrap in reverse</option></select></label>
      <p className="help-text">No-wrap layouts can overflow when items cannot shrink. Check every target viewport.</p>
      <label className="wl-field">Text direction<select aria-label="Text direction" value={options.textDirection} onChange={e => commit({ textDirection: e.target.value as LayoutOptions['textDirection'] })}><option value="ltr">Left to right</option><option value="rtl">Right to left</option></select></label>
      <label className="wl-field">Writing mode<select aria-label="Writing mode" value={options.writingMode} onChange={e => commit({ writingMode: e.target.value as LayoutOptions['writingMode'] })}><option value="horizontal-tb">Horizontal</option><option value="vertical-rl">Vertical, right to left</option><option value="vertical-lr">Vertical, left to right</option></select></label>
    </> : <>
      <p className="help-text">Empty title and description overrides inherit the page heading and introduction. Social overrides inherit document metadata.</p>
      {([['metaTitle','Document title'],['metaDescription','Document description'],['keywords','Tags / keywords'],['socialTitle','Social title'],['socialDescription','Social description']] as const).map(([key,label]) => <label className="wl-field" key={key}>{label}<textarea value={options[key]} maxLength={2000} onChange={e => commit({ [key]: e.target.value })} /></label>)}
      <label className="wl-field">Additional meta fields (JSON)<textarea spellCheck={false} value={metaDraft} onChange={e => setMetaDraft(e.target.value)} /></label>
      <p className="help-text">Use an array of objects with name and content. Standard metadata uses the dedicated controls. Metadata does not guarantee search indexing or rankings.</p>
      <button type="button" onClick={() => { try { commit({ customMeta: JSON.parse(metaDraft) }); } catch { setError('Custom metadata must be valid JSON.'); } }}>Apply metadata fields</button>
      <figure className="wl-social-card"><figcaption>Illustrative share preview</figcaption><strong>{options.socialTitle || options.metaTitle || project.title}</strong><p>{options.socialDescription || options.metaDescription || project.description}</p><small>{project.canonical || 'Add a canonical URL'}</small></figure>
    </>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
