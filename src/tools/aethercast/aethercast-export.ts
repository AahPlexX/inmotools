import Papa from 'papaparse';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { downloadBlob, downloadBytes, downloadText } from '../../lib/download';
import type { AetherCastDataset, AnomalyEvent, HourlyAssessment } from './aethercast-types';

function formatBurnMinutes(minutes: number | null): string {
  if (minutes === null) return '';
  if (!Number.isFinite(minutes)) return 'Never (UVI < 0.5)';
  return minutes < 1 ? '< 1' : minutes.toFixed(1);
}

export function exportCsv(assessments: readonly HourlyAssessment[]): void {
  const rows = assessments.map((assessment) => ({
    timestamp: assessment.point.isoTimestamp,
    pm25_ugm3: assessment.point.pm25 ?? '',
    pm10_ugm3: assessment.point.pm10 ?? '',
    co_ugm3: assessment.point.carbonMonoxideUgM3 ?? '',
    no2_ugm3: assessment.point.nitrogenDioxide ?? '',
    so2_ugm3: assessment.point.sulphurDioxide ?? '',
    o3_ugm3: assessment.point.ozone ?? '',
    uv_index: assessment.point.uvIndex ?? '',
    composite_aqi: assessment.compositeAqi ?? '',
    aqi_category: assessment.aqiCategory ?? '',
    eaqi_value: assessment.eaqiValue ?? '',
    eaqi_band: assessment.eaqiBand ?? '',
    est_burn_minutes: formatBurnMinutes(assessment.burnMinutes),
  }));
  downloadText(Papa.unparse(rows), 'aethercast-hourly.csv', 'text/csv;charset=utf-8');
}

export function exportJson(dataset: AetherCastDataset): void {
  downloadText(JSON.stringify(dataset, null, 2), 'aethercast-dataset.json', 'application/json;charset=utf-8');
}

export function exportCanvasPng(canvas: HTMLCanvasElement): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas export failed.'));
        return;
      }
      downloadBlob(blob, 'aethercast-forecast.png');
      resolve();
    }, 'image/png');
  });
}

export async function exportPdfBrief(
  dataset: AetherCastDataset,
  assessments: readonly HourlyAssessment[],
  anomalies: readonly AnomalyEvent[],
): Promise<void> {
  const pdfDocument = await PDFDocument.create({ updateMetadata: false });
  const page = pdfDocument.addPage([612, 792]);
  const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDocument.embedFont(StandardFonts.HelveticaBold);
  let cursorY = 740;

  const line = (text: string, size = 11, useBold = false) => {
    page.drawText(text, { x: 48, y: cursorY, size, font: useBold ? bold : font, color: rgb(0.1, 0.1, 0.12) });
    cursorY -= size + 8;
  };

  line('AetherCast - Local Air Quality & UV Brief', 18, true);
  line(`Generated locally on ${new Date().toLocaleString()}`, 9);
  if (dataset.latitude !== null && dataset.longitude !== null) {
    line(`Location: ${dataset.latitude.toFixed(4)}, ${dataset.longitude.toFixed(4)}${dataset.timezone ? ` (${dataset.timezone})` : ''}`, 10);
  }
  cursorY -= 6;

  const latest = assessments[assessments.length - 1];
  if (latest) {
    line('Current Snapshot', 13, true);
    line(`Composite AQI: ${latest.compositeAqi ?? 'n/a'} (${latest.aqiCategory ?? 'n/a'})`);
    line(`European AQI: ${latest.eaqiValue ?? 'n/a'} (${latest.eaqiBand ?? 'n/a'})`);
    line(`Estimated safe sun exposure: ${formatBurnMinutes(latest.burnMinutes) || 'n/a'} min`);
    cursorY -= 6;

    line('WHO 2021 Guideline Comparison (latest hour)', 13, true);
    (['pm25', 'pm10', 'o3', 'no2', 'so2', 'co'] as const).forEach((key) => {
      const score = latest.pollutants[key];
      if (score.whoDailyPass === null) return;
      line(`${key.toUpperCase()}: ${score.whoDailyPass ? 'PASS' : 'EXCEEDS'} 24-hour WHO guideline`);
    });
    cursorY -= 6;
  }

  line(`Screening Anomalies (${anomalies.length})`, 13, true);
  if (anomalies.length === 0) line('None detected in the imported range.');
  anomalies.slice(0, 12).forEach((event) => {
    line(
      `${event.type === 'WILDFIRE_SCREEN' ? 'Wildfire screen' : 'Thermal inversion'} - ${event.startTimestamp} (${event.confirmed ? 'corroborated' : 'unconfirmed'})`,
      9,
    );
  });

  cursorY -= 10;
  page.drawText(
    'Estimates are local screening aids only, not medical or regulatory guidance. Verify with a local air-quality authority.',
    { x: 48, y: cursorY, size: 8, font, color: rgb(0.4, 0.4, 0.42) },
  );

  pdfDocument.context.trailerInfo.Info = undefined;
  const bytes = new Uint8Array(await pdfDocument.save());
  downloadBytes(bytes, 'aethercast-brief.pdf', 'application/pdf');
}
