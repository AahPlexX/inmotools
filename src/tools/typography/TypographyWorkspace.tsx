import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadText } from '../../lib/download';
import { buildClamp, buildScaleMatrix, resolveGeneratedCssAt, type FluidUnit } from './fluid-engine';

function parsePreviewWidths(value: string): { widths: number[]; error: string } {
  const tokens = value.trim().split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) return { widths: [], error: 'Enter at least one preview width.' };
  const widths = tokens.map(Number);
  if (widths.some((width) => !Number.isInteger(width) || width <= 0 || width > 10_000)) {
    return { widths: [], error: 'Preview widths must be whole pixel values from 1 to 10,000.' };
  }
  const unique = Array.from(new Set(widths));
  if (unique.length > 8) return { widths: [], error: 'Use at most eight preview widths.' };
  return { widths: unique, error: '' };
}

function endpointPass(actual: number, expected: number) {
  return Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-4);
}

export default function TypographyWorkspace() {
  const [unit, setUnit] = useState<FluidUnit>('rem');
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(2);
  const [minVp, setMinVp] = useState(320);
  const [maxVp, setMaxVp] = useState(1440);
  const [rootFontPx, setRootFontPx] = useState(16);
  const [ratio, setRatio] = useState(1.25);
  const [lowestStep, setLowestStep] = useState(-1);
  const [highestStep, setHighestStep] = useState(3);
  const [previewText, setPreviewText] = useState('Aa Responsive');
  const [previewWidthsText, setPreviewWidthsText] = useState('320, 768, 1024, 1440');
  const [copied, setCopied] = useState('');
  const [liveComputedPx, setLiveComputedPx] = useState<number | null>(null);
  const [actualRootPx, setActualRootPx] = useState(rootFontPx);
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
    unit,
    rootFontPx,
  }), [min, max, minVp, maxVp, unit, rootFontPx]);

  const base = useMemo(() => {
    try {
      return { value: buildClamp(clampInput), error: '' };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : 'Invalid range' };
    }
  }, [clampInput]);

  const matrixState = useMemo(() => {
    if (base.error) return { items: [], error: base.error };
    try {
      return { items: buildScaleMatrix({ minBase: min, maxBase: max, ratio, steps, minViewport: minVp, maxViewport: maxVp, unit, rootFontPx }), error: '' };
    } catch (error) {
      return { items: [], error: error instanceof Error ? error.message : 'Scale matrix could not be generated.' };
    }
  }, [base.error, min, max, ratio, steps, minVp, maxVp, unit, rootFontPx]);

  const previewWidths = useMemo(() => parsePreviewWidths(previewWidthsText), [previewWidthsText]);
  const css = matrixState.items.map((step) => `--${step.name}: ${step.css};`).join('\n');
  const assumption = unit === 'rem' ? `Viewport interpolation assumes 1rem = ${rootFontPx}px.` : 'Type values are emitted directly in CSS pixels.';
  const cssBlock = `/* ${assumption} */\n:root {\n${css.split('\n').map((line) => `  ${line}`).join('\n')}\n}`;

  const endpointChecks = useMemo(() => {
    if (base.error) return null;
    try {
      const minResolved = resolveGeneratedCssAt(clampInput, minVp);
      const maxResolved = resolveGeneratedCssAt(clampInput, maxVp);
      return {
        minResolved,
        maxResolved,
        minPass: endpointPass(minResolved, min),
        maxPass: endpointPass(maxResolved, max),
      };
    } catch {
      return null;
    }
  }, [base.error, clampInput, minVp, maxVp, min, max]);

  useEffect(() => {
    const element = livePreviewRef.current;
    if (!element || base.error) {
      setLiveComputedPx(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const value = Number.parseFloat(getComputedStyle(element).fontSize);
        const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
        setLiveComputedPx(Number.isFinite(value) ? value : null);
        if (Number.isFinite(root)) setActualRootPx(root);
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(document.documentElement);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [base.value?.css, base.error, previewText]);

  function changeUnit(next: FluidUnit) {
    if (next === unit) return;
    if (next === 'px') {
      setMin((value) => value * rootFontPx);
      setMax((value) => value * rootFontPx);
    } else {
      setMin((value) => value / rootFontPx);
      setMax((value) => value / rootFontPx);
    }
    setUnit(next);
  }

  function updateStep(setter: (value: number) => void, raw: string) {
    const value = Math.trunc(Number(raw));
    setter(Math.max(-8, Math.min(8, Number.isFinite(value) ? value : 0)));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(cssBlock);
      setCopied('Copied the custom properties to the clipboard.');
    } catch {
      setCopied('This browser blocked clipboard access; select the text to copy it.');
    }
  }

  function downloadCss() {
    if (!matrixState.items.length) return;
    downloadText(cssBlock, 'fluid-type-scale.css', 'text/css;charset=utf-8');
    setCopied('Downloaded fluid-type-scale.css with its unit assumptions documented in the file.');
  }

  return <>
    <div className="workspace-header"><div><h2>Fluid scale matrix</h2><p>Generate rem or px fluid rules and verify the CSS that is actually emitted.</p></div></div>
    <div className="workspace-body">
      <div className="workspace-grid three">
        <div className="field"><label htmlFor="type-unit">Type size unit</label><select id="type-unit" value={unit} onChange={(e) => changeUnit(e.target.value as FluidUnit)}><option value="rem">rem</option><option value="px">px</option></select><small>Switching units preserves the current physical sizes using the configured root.</small></div>
        <div className="field"><label htmlFor="min-type">Minimum size ({unit})</label><input id="min-type" type="number" step="any" value={min} onChange={(e) => setMin(Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="max-type">Maximum size ({unit})</label><input id="max-type" type="number" step="any" value={max} onChange={(e) => setMax(Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="root-font">Root font size px</label><input id="root-font" type="number" min="1" step="0.5" value={rootFontPx} onChange={(e) => setRootFontPx(Number(e.target.value))} /><small>{unit === 'rem' ? 'The vw coefficient depends on this explicit rem-to-pixel assumption.' : 'Used when converting between px and rem.'}</small></div>
        <div className="field"><label htmlFor="ratio">Scale ratio</label><input id="ratio" type="number" step="0.01" value={ratio} onChange={(e) => setRatio(Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="min-vp">Minimum viewport px</label><input id="min-vp" type="number" value={minVp} onChange={(e) => setMinVp(Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="max-vp">Maximum viewport px</label><input id="max-vp" type="number" value={maxVp} onChange={(e) => setMaxVp(Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="low-step">Lowest step</label><input id="low-step" type="number" step="1" min="-8" max="8" value={lowestStep} onChange={(e) => updateStep(setLowestStep, e.target.value)} /></div>
        <div className="field"><label htmlFor="high-step">Highest step</label><input id="high-step" type="number" step="1" min="-8" max="8" value={highestStep} onChange={(e) => updateStep(setHighestStep, e.target.value)} /></div>
        <div className="field"><label htmlFor="preview-text">Preview text</label><input id="preview-text" type="text" value={previewText} onChange={(e) => setPreviewText(e.target.value)} /></div>
        <div className="field"><label htmlFor="preview-widths">Preview widths px</label><input id="preview-widths" type="text" value={previewWidthsText} onChange={(e) => setPreviewWidthsText(e.target.value)} spellCheck={false} /><small>Comma or space separated; up to eight whole widths.</small></div>
      </div>

      <div className="notice" style={{ marginTop: 18, overflowWrap: 'anywhere' }}>
        <strong>Base clamp</strong>
        <div><code data-testid="base-clamp">{base.error || base.value?.css}</code></div>
        {!base.error ? <small>{assumption}</small> : null}
      </div>

      {matrixState.error && matrixState.error !== base.error ? <div className="notice" role="alert" data-testid="scale-matrix-error" style={{ marginTop: 18 }}>Scale matrix unavailable: {matrixState.error}</div> : null}

      {endpointChecks ? <div className="workspace-grid" style={{ marginTop: 18 }} data-testid="endpoint-checks">
        <div className="metric"><span>Minimum emitted endpoint</span><strong>{endpointChecks.minResolved.toPrecision(6)}{unit}</strong><small>{endpointChecks.minPass ? 'Pass' : 'Mismatch'} at {minVp}px</small></div>
        <div className="metric"><span>Maximum emitted endpoint</span><strong>{endpointChecks.maxResolved.toPrecision(6)}{unit}</strong><small>{endpointChecks.maxPass ? 'Pass' : 'Mismatch'} at {maxVp}px</small></div>
      </div> : null}

      <div className="notice" style={{ marginTop: 18 }}>
        <strong>Browser CSS validation at the current viewport</strong>
        <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <span ref={livePreviewRef} style={{ fontSize: base.error ? undefined : base.value?.css, display: 'inline-block', maxWidth: '100%', overflowWrap: 'anywhere' }} data-testid="live-css-preview">{previewText || ' '}</span>
        </div>
        <small data-testid="live-css-size">
          Browser-computed size: {liveComputedPx === null ? 'unavailable' : `${liveComputedPx.toFixed(4)}px`} · actual page root: {actualRootPx.toFixed(2)}px · configured root assumption: {rootFontPx}px.
          {unit === 'rem' && Math.abs(actualRootPx - rootFontPx) > 0.01 ? ' The live page root differs from the configured assumption.' : ''}
        </small>
      </div>

      {previewWidths.error ? <div className="notice" role="alert" data-testid="preview-width-error" style={{ marginTop: 18 }}>{previewWidths.error}</div> : <div className="workspace-grid" style={{ marginTop: 18 }} data-testid="viewport-previews">
        {previewWidths.widths.map((width) => {
          const resolved = base.error ? min : resolveGeneratedCssAt(clampInput, width);
          const sizePx = unit === 'rem' ? resolved * rootFontPx : resolved;
          return <div className="metric" key={width} style={{ minWidth: 0 }}>
            <span>{width}px viewport</span>
            <strong style={{ fontSize: `${sizePx}px`, overflowWrap: 'anywhere' }} data-testid={`preview-${width}`}>{previewText || ' '}</strong>
            <p className="help-text">Resolves to {resolved.toPrecision(5)}{unit} ({sizePx.toFixed(3)}px).</p>
          </div>;
        })}
      </div>}

      <h3>CSS custom properties</h3>
      <div className="button-row">
        <button className="action-button secondary" type="button" onClick={() => void copy()} disabled={!matrixState.items.length}>Copy CSS</button>
        <button className="action-button secondary" type="button" onClick={downloadCss} disabled={!matrixState.items.length}>Download CSS</button>
      </div>
      {copied ? <div className="status-line" role="status">{copied}</div> : null}
      <pre className="code-output" tabIndex={0} aria-label="Generated CSS custom properties" data-testid="generated-css">{matrixState.items.length ? cssBlock : matrixState.error || 'Adjust the inputs to generate a scale.'}</pre>
    </div>
  </>;
}
