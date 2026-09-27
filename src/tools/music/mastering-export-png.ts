/**
 * Spectrum snapshot PNG for export telemetry (ledger 80).
 *
 * Draws the average spectrum of one exported file on a log-frequency axis
 * (20 Hz to Nyquist) against dB relative to a full-scale sine, with labelled
 * grid lines so the image reads on its own outside the app. Uses a detached
 * canvas and `toBlob`, which every supported browser provides.
 */
import type { Spectrum } from './dsp/analysis';

const WIDTH = 1200;
const HEIGHT = 600;
const MARGIN = { left: 72, right: 24, top: 56, bottom: 56 };
const FLOOR_DB = -120;
const FREQUENCY_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000];

const tickLabel = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : String(hz));

/**
 * Renders the spectrum to PNG bytes.
 * @param spectrum - Power per FFT bin in dB relative to a full-scale sine.
 * @param sampleRate - Rate of the analysed audio; sets the Nyquist edge of the axis.
 * @param title - Printed at the top, normally the exported file's name.
 * @throws {Error} when the browser cannot create a 2D canvas or encode PNG.
 */
export async function spectrumPng(spectrum: Spectrum, sampleRate: number, title: string): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot draw the spectrum snapshot.');

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const nyquist = sampleRate / 2;
  const lowHz = 20;
  const highHz = Math.max(lowHz * 2, nyquist);
  const xAt = (hz: number) => MARGIN.left + (Math.log(hz / lowHz) / Math.log(highHz / lowHz)) * plotWidth;
  const yAt = (db: number) => MARGIN.top + (Math.min(0, Math.max(FLOOR_DB, db)) / FLOOR_DB) * plotHeight;

  // A light, print-friendly palette: the snapshot is a report, not a screen theme.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.font = '14px system-ui, sans-serif';
  context.lineWidth = 1;

  context.strokeStyle = '#e2e5ea';
  context.fillStyle = '#4b5563';
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (let db = 0; db >= FLOOR_DB; db -= 20) {
    const y = yAt(db);
    context.beginPath(); context.moveTo(MARGIN.left, y); context.lineTo(WIDTH - MARGIN.right, y); context.stroke();
    context.fillText(`${db} dB`, MARGIN.left - 8, y);
  }
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (const hz of FREQUENCY_TICKS) {
    if (hz > highHz) continue;
    const x = xAt(hz);
    context.beginPath(); context.moveTo(x, MARGIN.top); context.lineTo(x, HEIGHT - MARGIN.bottom); context.stroke();
    context.fillText(tickLabel(hz), x, HEIGHT - MARGIN.bottom + 8);
  }

  // One point per horizontal pixel: the loudest bin that falls in it, so narrow peaks survive.
  context.strokeStyle = '#1d4ed8';
  context.lineWidth = 2;
  context.beginPath();
  let started = false;
  for (let pixel = 0; pixel <= plotWidth; pixel += 1) {
    const fromHz = lowHz * (highHz / lowHz) ** (pixel / plotWidth);
    const toHz = lowHz * (highHz / lowHz) ** ((pixel + 1) / plotWidth);
    const first = Math.max(1, Math.floor(fromHz / spectrum.binHz));
    const last = Math.min(spectrum.db.length - 1, Math.max(first, Math.floor(toHz / spectrum.binHz)));
    let peak = -Infinity;
    for (let bin = first; bin <= last; bin += 1) peak = Math.max(peak, spectrum.db[bin]);
    if (!Number.isFinite(peak)) continue;
    const x = MARGIN.left + pixel;
    const y = yAt(peak);
    if (started) context.lineTo(x, y); else { context.moveTo(x, y); started = true; }
  }
  context.stroke();

  context.fillStyle = '#111827';
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.font = '600 18px system-ui, sans-serif';
  context.fillText(title, MARGIN.left, 32);
  context.font = '13px system-ui, sans-serif';
  context.fillStyle = '#4b5563';
  context.textAlign = 'right';
  context.fillText(`Average spectrum · dB relative to a full-scale sine · ${sampleRate.toLocaleString('en')} Hz`, WIDTH - MARGIN.right, 32);
  context.textAlign = 'center';
  context.fillText('Frequency (Hz)', MARGIN.left + plotWidth / 2, HEIGHT - 16);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('This browser could not encode the spectrum snapshot.');
  return new Uint8Array(await blob.arrayBuffer());
}
