import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadText } from '../../lib/download';
import { buildClamp, buildScaleMatrix, resolveClampAt, resolveGeneratedCssAt } from './fluid-engine';

const PREVIEW_WIDTHS = [320, 768, 1024, 1440];

export default function TypographyWorkspace() {
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(2);
  const [minVp, setMinVp] = useState(320);
  const [maxVp, setMaxVp] = useState(1440);
  const [rootFontPx, setRootFontPx] = useState(16);
  const [ratio, setRatio] = useState(1.25);
  const [lowestStep, setLowestStep] = useState(-1);
  const [highestStep, setHighestStep] = useState(3);
  const [previewText, setPreviewText] = useState('Aa Responsive');
  const [copied, setCopied] = useState('');
  const [liveComputedPx, setLiveComputedPx] = useState<number | null>(null);
  const livePreviewRef = useRef<HTMLSpanElement>(null);

  const steps = useMemo(() => {
    const low = Math.min(lowestStep, highestStep);
    const high = Math.max(lowestStep, highestStep);
    return Array.from({ length: high - low + 1 }, (_, index) => low + index);
  }, [lowestStep, highestStep]);

  const clampInput = useMemo(() => ({
    minValue: min,
    maxValue: max,
    minViewport: minVp,
    maxViewport: maxVp,
    unit: 'rem' as const,
    rootFontPx,
  }), [min, max, minVp, maxVp, rootFontPx]);

  const base = useMemo(() => {
    try {
      return { css: buildClamp(clampInput).css, error: '' };
    } catch (error) {
      return { css: '', error: error instanceof Error ? error.message : 'Invalid range' };
    }
  }, [clampInput]);

  const matrix = useMemo(() => {
    if (base.error) return [];
    try {
      return buildScaleMatrix({ minBase: min, maxBase: max, ratio, steps, minViewport: minVp, maxViewport: maxVp, unit: 'rem', rootFontPx });
    } catch {
      return [];
    }
  }, [base.error, min, max, ratio, steps, minVp, maxVp, rootFontPx]);

  const css = matrix.map((step) => `--${step.name}: ${step.css};`).join('\n');
  const cssBlock = `/* Viewport interpolation assumes 1rem = ${rootFontPx}px. */\n:root {\n${css.split('\n').map((line) => `  ${line}`).join('\n')}\n}`;

  const endpointChecks = useMemo(() => {
    if (base.error) return null;
    const minResolved = resolveGeneratedCssAt(clampInput, minVp);
    const maxResolved = resolveGeneratedCssAt(clampInput, maxVp);
    return {
      minResolved,
      maxResolved,
      minPass: Math.abs(minResolved - min) < 0.0001,
      maxPass: Math.abs(maxResolved - max) < 0.0001,
    };
  }, [base.error, clampInput, minVp, maxVp, min, max]);

  useEffect(() => {
    const element = livePreviewRef.current;
    if (!element || base.error) {
      setLiveComputedPx(null);
      return;
    }
    const frame = requestAnimationFrame(() => {
      const value = Number.parseFloat(getComputedStyle(element).fontSize);
      setLiveComputedPx(Number.isFinite(value) ? value : null);
    });
    return () => cancelAnimationFrame(frame);
  }, [base.css, base.error, previewText]);

  const actualRootPx = typeof document === 'undefined' ? rootFontPx : Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || rootFontPx;

  async function copy() {
    try {
      await navigator.clipboard.writeText(cssBlock);
      setCopied('Copied the custom properties to the clipboard.');
    } catch {
      setCopied('This browser blocked clipboard access; select the text to copy it.');
    }
  }

  function downloadCss() {
    if (!matrix.length) return;
    downloadText(cssBlock, 'fluid-type-scale.css', 'text/css;charset=utf-8');
    setCopied('Downloaded fluid-type-scale.css with the root-size assumption documented in the file.');
  }

  return <>
    <div className="workspace-header"><div><h2>Fluid scale matrix</h2><p>Generate mixed rem + vw rules from consistent units and verify their endpoints.</p></div></div>
    <div className="workspace-body">
      <div className="workspace-grid three">
        <div className="field"><label htmlFor="min-type">Minimum rem</label><input id="min-type" type="number" step="0.125" value={min} onChange={(e) => setMin(Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="max-type">Maximum rem</label><input id="max-type" type="number" step="0.125" value={max} onChange={(e) => setMax(Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="root-font">Root font size px</label><input id="root-font" type="number" min="1" step="0.5" value={rootFontPx} onChange={(e) => setRootFontPx(Number(e.target.value))} /><small>The vw coefficient depends on this explicit rem-to-pixel assumption.</small></div>
        <div className="field"><label htmlFor="ratio">Scale ratio</label><input id="ratio" type="number" step="0.01" value={ratio} onChange={(e) => setRatio(Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="min-vp">Minimum viewport px</label><input id="min-vp" type="number" value={minVp} onChange={(e) => setMinVp(Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="max-vp">Maximum viewport px</label><input id="max-vp" type="number" value={maxVp} onChange={(e) => setMaxVp(Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="low-step">Lowest step</label><input id="low-step" type="number" min="-8" max="8" value={lowestStep} onChange={(e) => setLowestStep(Math.max(-8, Math.min(8, Number(e.target.value) || 0)))} /></div>
        <div className="field"><label htmlFor="high-step">Highest step</label><input id="high-step" type="number" min="-8" max="8" value={highestStep} onChange={(e) => setHighestStep(Math.max(-8, Math.min(8, Number(e.target.value) || 0)))} /></div>
        <div className="field"><label htmlFor="preview-text">Preview text</label><input id="preview-text" type="text" value={previewText} onChange={(e) => setPreviewText(e.target.value)} /></div>
      </div>

      <div className="notice" style={{ marginTop: 18, overflowWrap: 'anywhere' }}>
        <strong>Base clamp</strong>
        <div><code data-testid="base-clamp">{base.error || base.css}</code></div>
        {!base.error ? <small>Assumption: 1rem = {rootFontPx}px while deriving the viewport slope.</small> : null}
      </div>

      {endpointChecks ? <div className="workspace-grid" style={{ marginTop: 18 }} data-testid="endpoint-checks">
        <div className="metric"><span>Minimum endpoint</span><strong>{endpointChecks.minResolved.toFixed(4)}rem</strong><small>{endpointChecks.minPass ? 'Pass' : 'Mismatch'} at {minVp}px</small></div>
        <div className="metric"><span>Maximum endpoint</span><strong>{endpointChecks.maxResolved.toFixed(4)}rem</strong><small>{endpointChecks.maxPass ? 'Pass' : 'Mismatch'} at {maxVp}px</small></div>
      </div> : null}

      <div className="notice" style={{ marginTop: 18 }}>
        <strong>Browser CSS validation at the current viewport</strong>
        <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <span ref={livePreviewRef} style={{ fontSize: base.error ? undefined : base.css, display: 'inline-block', maxWidth: '100%', overflowWrap: 'anywhere' }} data-testid="live-css-preview">{previewText || ' '}</span>
        </div>
        <small>
          Browser-computed size: {liveComputedPx === null ? 'unavailable' : `${liveComputedPx.toFixed(2)}px`} · actual page root: {actualRootPx.toFixed(2)}px · configured root assumption: {rootFontPx}px.
          {Math.abs(actualRootPx - rootFontPx) > 0.01 ? ' The live page root differs from the configured assumption, so endpoint interpolation will differ until the target document uses that root size.' : ' The live page root matches the configured assumption.'}
        </small>
      </div>

      <div className="workspace-grid" style={{ marginTop: 18 }} data-testid="viewport-previews">
        {PREVIEW_WIDTHS.map((width) => {
          const rem = base.error ? 1 : resolveClampAt(clampInput, width);
          return <div className="metric" key={width} style={{ minWidth: 0 }}>
            <span>{width}px viewport</span>
            <strong style={{ fontSize: `${rem * rootFontPx}px`, overflowWrap: 'anywhere' }} data-testid={`preview-${width}`}>{previewText || ' '}</strong>
            <p className="help-text">Resolves to {rem.toFixed(3)}rem ({(rem * rootFontPx).toFixed(2)}px at the configured root).</p>
          </div>;
        })}
      </div>

      <h3>CSS custom properties</h3>
      <div className="button-row">
        <button className="action-button secondary" type="button" onClick={() => void copy()} disabled={!matrix.length}>Copy CSS</button>
        <button className="action-button secondary" type="button" onClick={downloadCss} disabled={!matrix.length}>Download CSS</button>
      </div>
      {copied ? <div className="status-line" role="status">{copied}</div> : null}
      <pre className="code-output" tabIndex={0} aria-label="Generated CSS custom properties" data-testid="generated-css">{matrix.length ? cssBlock : base.error || 'Adjust the inputs to generate a scale.'}</pre>
    </div>
  </>;
}
