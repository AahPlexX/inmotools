import { normalizeRawSettings } from './photo-raw-settings';
import type { PhotoRawSettings, PhotoRawSource } from './photo-types';

export default function PhotoRawControls({ value, source, onChange }: {
  value?: PhotoRawSettings;
  source: PhotoRawSource;
  onChange: (settings: PhotoRawSettings) => void;
}) {
  const settings = normalizeRawSettings(value);
  const patch = (next: Partial<PhotoRawSettings>) => onChange(normalizeRawSettings({ ...settings, ...next }));
  return (
    <details className="photo-section" open data-testid="photo-raw-controls">
      <summary>RAW development</summary>
      <p className="photo-export-note">These settings develop the original RAW before ordinary raster adjustments.</p>
      <div className="photo-control-list">
        <label className="photo-control photo-raw-control">
          <span className="photo-inline-actions">
            <span>RAW exposure (EV)</span>
            <button type="button" disabled={settings.exposureEv === 0} aria-label="Reset RAW exposure"
              onClick={(event) => { event.preventDefault(); patch({ exposureEv: 0 }); }}>Reset</button>
          </span>
          <input key={`exposureEv:${settings.exposureEv}`} type="number" min="-5" max="5" step="0.1" aria-label="RAW exposure (EV)" defaultValue={settings.exposureEv}
            onBlur={(event) => {
              const input = event.currentTarget;
              if (input.value !== '' && Number.isFinite(input.valueAsNumber)) patch({ exposureEv: input.valueAsNumber });
              input.value = String(normalizeRawSettings({ ...settings, exposureEv: input.value !== '' && Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : settings.exposureEv }).exposureEv);
            }}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
        </label>
        {source.colorControls ? <>
          <label className="photo-control photo-raw-control">
            <span>RAW white balance</span>
            <select aria-label="RAW white balance" value={settings.whiteBalance} onChange={(event) => patch({ whiteBalance: event.target.value as PhotoRawSettings['whiteBalance'] })}>
              <option value="camera">Camera / as shot{source.cameraWhiteBalance ? '' : ' (decoder fallback)'}</option>
              <option value="daylight">Camera daylight reference</option>
              <option value="custom">Custom RGB multipliers</option>
            </select>
          </label>
          {settings.whiteBalance === 'custom' ? (['redMultiplier', 'blueMultiplier'] as const).map((key) => (
            <label className="photo-control photo-raw-control" key={key}>
              <span className="photo-inline-actions">
                <span>RAW {key === 'redMultiplier' ? 'red' : 'blue'} multiplier (green = 1)</span>
                <button type="button" disabled={settings[key] === 1} aria-label={`Reset RAW ${key === 'redMultiplier' ? 'red' : 'blue'} multiplier`}
                  onClick={(event) => { event.preventDefault(); patch({ [key]: 1 }); }}>Reset</button>
              </span>
              <input key={`${key}:${settings[key]}`} type="number" min="0.25" max="4" step="0.05" aria-label={`RAW ${key === 'redMultiplier' ? 'red' : 'blue'} multiplier`} defaultValue={settings[key]}
                onBlur={(event) => {
                  const input = event.currentTarget;
                  if (input.value !== '' && Number.isFinite(input.valueAsNumber)) patch({ [key]: input.valueAsNumber });
                  input.value = String(normalizeRawSettings({ ...settings, [key]: input.value !== '' && Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : settings[key] })[key]);
                }}
                onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
            </label>
          )) : null}
          <label className="photo-control photo-raw-control">
            <span>RAW highlight handling</span>
            <select aria-label="RAW highlight handling" value={settings.highlight} onChange={(event) => patch({ highlight: event.target.value as PhotoRawSettings['highlight'] })}>
              <option value="clip">Clip</option><option value="unclip">Unclip</option><option value="blend">Blend</option>
            </select>
          </label>
        </> : <p className="photo-export-note">This source does not expose a supported three-color RGB layout; white balance and highlight controls are unavailable.</p>}
        {source.demosaicControl ? <label className="photo-control photo-raw-control">
          <span>RAW demosaic</span>
          <select aria-label="RAW demosaic" value={settings.demosaic} onChange={(event) => patch({ demosaic: event.target.value as PhotoRawSettings['demosaic'] })}>
            <option value="ahd">AHD</option><option value="bilinear">Bilinear</option><option value="vng">VNG</option><option value="ppg">PPG</option>
          </select>
        </label> : <p className="photo-export-note">Demosaic choice is available for supported Bayer RGB sources only.</p>}
      </div>
      <button type="button" onClick={() => onChange(normalizeRawSettings(undefined))}>Reset RAW development</button>
    </details>
  );
}
