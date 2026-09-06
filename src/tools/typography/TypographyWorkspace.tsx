import { useMemo, useState } from 'react';
import { buildClamp, buildScaleMatrix, resolveClampAt } from './fluid-engine';

const PREVIEW_WIDTHS = [320, 768, 1024, 1440];
const ROOT_FONT_PX = 16;

export default function TypographyWorkspace() {
  const [min, setMin] = useState(1);
  const [max, setMax] = useState(2);
  const [minVp, setMinVp] = useState(320);
  const [maxVp, setMaxVp] = useState(1440);
  const [ratio, setRatio] = useState(1.25);
  const [lowestStep, setLowestStep] = useState(-1);
  const [highestStep, setHighestStep] = useState(3);
  const [copied, setCopied] = useState('');

  const steps = useMemo(() => {
    const low = Math.min(lowestStep, highestStep);
    const high = Math.max(lowestStep, highestStep);
    return Array.from({ length: high - low + 1 }, (_, index) => low + index);
  }, [lowestStep, highestStep]);

  const base = useMemo(() => {
    try {
      return { css: buildClamp({ minValue: min, maxValue: max, minViewport: minVp, maxViewport: maxVp, unit: 'rem' }).css, error: '' };
    } catch (error) {
      return { css: '', error: error instanceof Error ? error.message : 'Invalid range' };
    }
  }, [min, max, minVp, maxVp]);

  // Each step carries its own clamp, computed from its own bounds by the engine.
  const matrix = useMemo(() => {
    if (base.error) return [];
    try {
      return buildScaleMatrix({ minBase: min, maxBase: max, ratio, steps, minViewport: minVp, maxViewport: maxVp, unit: 'rem' });
    } catch {
      return [];
    }
  }, [base.error, min, max, ratio, steps, minVp, maxVp]);

  const css = matrix.map((step) => `--${step.name}: ${step.css};`).join('\n');
  const cssBlock = `:root {\n${css.split('\n').map((line) => `  ${line}`).join('\n')}\n}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cssBlock);
      setCopied('Copied the custom properties to the clipboard.');
    } catch {
      setCopied('This browser blocked clipboard access; select the text to copy it.');
    }
  };

  return (
    <>
      <div className="workspace-header">
        <div>
          <h2>Fluid scale matrix</h2>
          <p>Compare one responsive rule at four representative widths.</p>
        </div>
      </div>
      <div className="workspace-body">
        <div className="workspace-grid three">
          <div className="field"><label htmlFor="min-type">Minimum rem</label><input id="min-type" type="number" step="0.125" value={min} onChange={(e) => setMin(Number(e.target.value))} /></div>
          <div className="field"><label htmlFor="max-type">Maximum rem</label><input id="max-type" type="number" step="0.125" value={max} onChange={(e) => setMax(Number(e.target.value))} /></div>
          <div className="field"><label htmlFor="ratio">Scale ratio</label><input id="ratio" type="number" step="0.01" value={ratio} onChange={(e) => setRatio(Number(e.target.value))} /></div>
          <div className="field"><label htmlFor="min-vp">Minimum viewport px</label><input id="min-vp" type="number" value={minVp} onChange={(e) => setMinVp(Number(e.target.value))} /></div>
          <div className="field"><label htmlFor="max-vp">Maximum viewport px</label><input id="max-vp" type="number" value={maxVp} onChange={(e) => setMaxVp(Number(e.target.value))} /></div>
          <div className="field"><label htmlFor="low-step">Lowest step</label><input id="low-step" type="number" min="-8" max="8" value={lowestStep} onChange={(e) => setLowestStep(Math.max(-8, Math.min(8, Number(e.target.value) || 0)))} /><small>Negative steps are smaller than the base.</small></div>
          <div className="field"><label htmlFor="high-step">Highest step</label><input id="high-step" type="number" min="-8" max="8" value={highestStep} onChange={(e) => setHighestStep(Math.max(-8, Math.min(8, Number(e.target.value) || 0)))} /><small>Extend for display headings or sub-captions.</small></div>
        </div>

        <div className="notice" style={{ marginTop: 18 }}>
          <strong>Base clamp</strong>
          <div><code data-testid="base-clamp">{base.error || base.css}</code></div>
        </div>

        {/* Sizes are resolved arithmetically at each simulated width. Applying the
            clamp inline would resolve its vw term against the real viewport, so
            every card rendered identically while claiming to show four widths. */}
        <div className="workspace-grid" style={{ marginTop: 18 }} data-testid="viewport-previews">
          {PREVIEW_WIDTHS.map((width) => {
            const rem = base.error ? 1 : resolveClampAt({ minValue: min, maxValue: max, minViewport: minVp, maxViewport: maxVp, unit: 'rem' }, width);
            return (
              <div className="metric" key={width}>
                <span>{width}px viewport</span>
                <strong style={{ fontSize: `${rem * ROOT_FONT_PX}px` }} data-testid={`preview-${width}`}>Aa Responsive</strong>
                <p className="help-text">Resolves to {rem.toFixed(3)}rem at this width.</p>
              </div>
            );
          })}
        </div>

        <h3>CSS custom properties</h3>
        <div className="button-row">
          <button className="action-button secondary" type="button" onClick={() => void copy()} disabled={!matrix.length}>Copy CSS</button>
        </div>
        {copied ? <div className="status-line" role="status">{copied}</div> : null}
        <pre className="code-output" tabIndex={0} aria-label="Generated CSS custom properties" data-testid="generated-css">
          {matrix.length ? cssBlock : base.error || 'Adjust the inputs to generate a scale.'}
        </pre>
      </div>
    </>
  );
}
