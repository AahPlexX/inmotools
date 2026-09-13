import type { ChangeEvent } from 'react';
import type { PdfBatesPlacement, PdfImageWatermarkPlacement, PdfOverlayAlignment } from './pdf-overlays';
import type { PdfOverlayDraft } from './pdf-overlay-stage';

type Props = {
  value: PdfOverlayDraft;
  error: string;
  onChange: (value: PdfOverlayDraft) => void;
};

const ALIGNMENTS: PdfOverlayAlignment[] = ['left', 'center', 'right'];
const BATES_PLACEMENTS: PdfBatesPlacement[] = ['header-left', 'header-center', 'header-right', 'footer-left', 'footer-center', 'footer-right'];
const IMAGE_PLACEMENTS: PdfImageWatermarkPlacement[] = ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'];

export default function PdfOverlayPanel({ value, error, onChange }: Props) {
  function update<Key extends keyof PdfOverlayDraft>(key: Key, next: PdfOverlayDraft[Key]) {
    onChange({ ...value, [key]: next });
  }

  function imageFileChanged(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    update('imageWatermarkFile', file);
    event.target.value = '';
  }

  return <section className="notice" style={{ marginTop: 18 }} aria-labelledby="pdf-overlay-title">
    <h3 id="pdf-overlay-title" style={{ margin: 0 }}>Bates, headers, footers &amp; watermarks</h3>
    <p className="help-text">Export-time overlays are drawn directly into the PDF. Available deterministic tokens: <code>{'{{page}}'}</code>, <code>{'{{pages}}'}</code>, <code>{'{{date}}'}</code>, <code>{'{{filename}}'}</code>, and <code>{'{{bates}}'}</code>. The date token is whatever you explicitly enter below; it never reads the clock automatically.</p>

    <div className="field" style={{ marginTop: 12, maxWidth: 320 }}><label htmlFor="pdf-token-date">Token date</label><input id="pdf-token-date" value={value.tokenDate} onChange={(event) => update('tokenDate', event.target.value)} placeholder="2026-09-12" autoComplete="off" /><small>Free text by design so legal/archive date formats remain under your control.</small></div>

    <div className="workspace-grid three" style={{ marginTop: 14 }}>
      <div className="field"><label htmlFor="pdf-header-template">Header template</label><input id="pdf-header-template" value={value.headerTemplate} onChange={(event) => update('headerTemplate', event.target.value)} placeholder={'{{filename}} · {{page}}/{{pages}}'} autoComplete="off" /></div>
      <div className="field"><label htmlFor="pdf-header-align">Header alignment</label><select id="pdf-header-align" value={value.headerAlign} onChange={(event) => update('headerAlign', event.target.value as PdfOverlayAlignment)}>{ALIGNMENTS.map((alignment) => <option key={alignment} value={alignment}>{alignment[0].toUpperCase() + alignment.slice(1)}</option>)}</select></div>
      <div className="field"><label htmlFor="pdf-header-size">Header font size</label><input id="pdf-header-size" type="number" min="1" step="1" value={value.headerFontSize} onChange={(event) => update('headerFontSize', Number(event.target.value))} /></div>
      <div className="field"><label htmlFor="pdf-footer-template">Footer template</label><input id="pdf-footer-template" value={value.footerTemplate} onChange={(event) => update('footerTemplate', event.target.value)} placeholder={'Filed {{date}}'} autoComplete="off" /></div>
      <div className="field"><label htmlFor="pdf-footer-align">Footer alignment</label><select id="pdf-footer-align" value={value.footerAlign} onChange={(event) => update('footerAlign', event.target.value as PdfOverlayAlignment)}>{ALIGNMENTS.map((alignment) => <option key={alignment} value={alignment}>{alignment[0].toUpperCase() + alignment.slice(1)}</option>)}</select></div>
      <div className="field"><label htmlFor="pdf-footer-size">Footer font size</label><input id="pdf-footer-size" type="number" min="1" step="1" value={value.footerFontSize} onChange={(event) => update('footerFontSize', Number(event.target.value))} /></div>
    </div>

    <fieldset style={{ marginTop: 18 }}>
      <legend>Bates numbering</legend>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={value.batesEnabled} onChange={(event) => update('batesEnabled', event.target.checked)} /> Enable Bates numbering</label>
      <div className="workspace-grid three" style={{ marginTop: 12 }}>
        <div className="field"><label htmlFor="pdf-bates-prefix">Prefix</label><input id="pdf-bates-prefix" value={value.batesPrefix} disabled={!value.batesEnabled} onChange={(event) => update('batesPrefix', event.target.value)} autoComplete="off" /></div>
        <div className="field"><label htmlFor="pdf-bates-start">Start number</label><input id="pdf-bates-start" type="number" min="0" step="1" value={value.batesStart} disabled={!value.batesEnabled} onChange={(event) => update('batesStart', Number(event.target.value))} /></div>
        <div className="field"><label htmlFor="pdf-bates-padding">Number padding</label><input id="pdf-bates-padding" type="number" min="1" max="20" step="1" value={value.batesPadding} disabled={!value.batesEnabled} onChange={(event) => update('batesPadding', Number(event.target.value))} /></div>
        <div className="field"><label htmlFor="pdf-bates-suffix">Suffix</label><input id="pdf-bates-suffix" value={value.batesSuffix} disabled={!value.batesEnabled} onChange={(event) => update('batesSuffix', event.target.value)} autoComplete="off" /></div>
        <div className="field"><label htmlFor="pdf-bates-placement">Placement</label><select id="pdf-bates-placement" value={value.batesPlacement} disabled={!value.batesEnabled} onChange={(event) => update('batesPlacement', event.target.value as PdfBatesPlacement)}>{BATES_PLACEMENTS.map((placement) => <option key={placement} value={placement}>{placement.replace('-', ' · ')}</option>)}</select></div>
        <div className="field"><label htmlFor="pdf-bates-size">Font size</label><input id="pdf-bates-size" type="number" min="1" step="1" value={value.batesFontSize} disabled={!value.batesEnabled} onChange={(event) => update('batesFontSize', Number(event.target.value))} /></div>
      </div>
    </fieldset>

    <fieldset style={{ marginTop: 18 }}>
      <legend>Text watermark</legend>
      <div className="workspace-grid three">
        <div className="field"><label htmlFor="pdf-text-watermark">Watermark template</label><input id="pdf-text-watermark" value={value.textWatermark} onChange={(event) => update('textWatermark', event.target.value)} placeholder={'DRAFT · {{page}}'} autoComplete="off" /></div>
        <div className="field"><label htmlFor="pdf-text-watermark-size">Font size</label><input id="pdf-text-watermark-size" type="number" min="1" step="1" value={value.textWatermarkFontSize} onChange={(event) => update('textWatermarkFontSize', Number(event.target.value))} /></div>
        <div className="field"><label htmlFor="pdf-text-watermark-opacity">Opacity</label><input id="pdf-text-watermark-opacity" type="number" min="0" max="1" step="0.01" value={value.textWatermarkOpacity} onChange={(event) => update('textWatermarkOpacity', Number(event.target.value))} /></div>
        <div className="field"><label htmlFor="pdf-text-watermark-rotation">Rotation (degrees)</label><input id="pdf-text-watermark-rotation" type="number" min="-360" max="360" step="1" value={value.textWatermarkRotation} onChange={(event) => update('textWatermarkRotation', Number(event.target.value))} /></div>
      </div>
    </fieldset>

    <fieldset style={{ marginTop: 18 }}>
      <legend>Image watermark</legend>
      <div className="field"><label htmlFor="pdf-image-watermark">PNG or JPEG watermark</label><input id="pdf-image-watermark" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={imageFileChanged} /><small>{value.imageWatermarkFile ? `Staged: ${value.imageWatermarkFile.name}` : 'No image watermark staged.'}</small></div>
      {value.imageWatermarkFile ? <div className="workspace-grid three" style={{ marginTop: 12 }}>
        <div className="field"><label htmlFor="pdf-image-watermark-opacity">Opacity</label><input id="pdf-image-watermark-opacity" type="number" min="0" max="1" step="0.01" value={value.imageWatermarkOpacity} onChange={(event) => update('imageWatermarkOpacity', Number(event.target.value))} /></div>
        <div className="field"><label htmlFor="pdf-image-watermark-rotation">Rotation (degrees)</label><input id="pdf-image-watermark-rotation" type="number" min="-360" max="360" step="1" value={value.imageWatermarkRotation} onChange={(event) => update('imageWatermarkRotation', Number(event.target.value))} /></div>
        <div className="field"><label htmlFor="pdf-image-watermark-width">Width (% of page)</label><input id="pdf-image-watermark-width" type="number" min="1" max="100" step="1" value={value.imageWatermarkWidthPercent} onChange={(event) => update('imageWatermarkWidthPercent', Number(event.target.value))} /></div>
        <div className="field"><label htmlFor="pdf-image-watermark-placement">Placement</label><select id="pdf-image-watermark-placement" value={value.imageWatermarkPlacement} onChange={(event) => update('imageWatermarkPlacement', event.target.value as PdfImageWatermarkPlacement)}>{IMAGE_PLACEMENTS.map((placement) => <option key={placement} value={placement}>{placement.replace('-', ' · ')}</option>)}</select></div>
        <div className="button-row" style={{ alignItems: 'end' }}><button className="action-button secondary" type="button" onClick={() => update('imageWatermarkFile', null)}>Remove image watermark</button></div>
      </div> : null}
    </fieldset>

    {error ? <p className="help-text" role="alert">{error}</p> : null}
    <p className="help-text">Text overlays currently use the built-in Helvetica font. Custom embedded fonts are intentionally deferred to the custom-font milestone rather than silently substituting unsupported glyphs.</p>
  </section>;
}
