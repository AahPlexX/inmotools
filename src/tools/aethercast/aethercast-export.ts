import Papa from 'papaparse';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { downloadBlob, downloadBytes, downloadText } from '../../lib/download';
import type { AetherCastDataset, AnomalyEvent, HourlyAssessment, IndexStandard } from './aethercast-types';

function formatTimingHeuristic(minutes: number | null): string {
  if (minutes === null) return '';
  if (!Number.isFinite(minutes)) return 'not estimated below UVI 0.5';
  return `${minutes < 1 ? '< 1' : minutes.toFixed(1)} min`;
}

const selectedIndex = (assessment: HourlyAssessment, standard: IndexStandard): {
  value: number | null;
  band: string | null;
  coverage: string;
} => standard === 'US_EPA'
  ? { value: assessment.compositeAqi, band: assessment.aqiCategory, coverage: assessment.usAqiCoverage }
  : { value: assessment.eaqiValue, band: assessment.eaqiBand, coverage: assessment.europeanAqiCoverage };

export function exportCsv(assessments: readonly HourlyAssessment[], standard: IndexStandard = 'US_EPA'): void {
  const rows = assessments.map((assessment) => {
    const selected = selectedIndex(assessment, standard);
    return {
      timestamp: assessment.point.isoTimestamp,
      selected_standard: standard,
      selected_index: selected.value ?? '',
      selected_band: selected.band ?? '',
      selected_coverage: selected.coverage,
      us_epa_aqi: assessment.compositeAqi ?? '',
      us_epa_category: assessment.aqiCategory ?? '',
      us_epa_coverage: assessment.usAqiCoverage,
      european_index: assessment.eaqiValue ?? '',
      european_band: assessment.eaqiBand ?? '',
      european_coverage: assessment.europeanAqiCoverage,
      pm25_ugm3: assessment.point.pm25 ?? '',
      pm10_ugm3: assessment.point.pm10 ?? '',
      co_ugm3: assessment.point.carbonMonoxideUgM3 ?? '',
      no2_ugm3: assessment.point.nitrogenDioxide ?? '',
      so2_ugm3: assessment.point.sulphurDioxide ?? '',
      o3_ugm3: assessment.point.ozone ?? '',
      uv_index: assessment.point.uvIndex ?? '',
      skin_type_timing_heuristic: formatTimingHeuristic(assessment.burnMinutes),
      pm25_who_guideline_pass: assessment.pollutants.pm25.whoGuidelinePass ?? '',
      pm10_who_guideline_pass: assessment.pollutants.pm10.whoGuidelinePass ?? '',
      o3_who_guideline_pass: assessment.pollutants.o3.whoGuidelinePass ?? '',
      no2_who_guideline_pass: assessment.pollutants.no2.whoGuidelinePass ?? '',
      so2_who_guideline_pass: assessment.pollutants.so2.whoGuidelinePass ?? '',
      co_who_guideline_pass: assessment.pollutants.co.whoGuidelinePass ?? '',
    };
  });
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
  standard: IndexStandard = 'US_EPA',
): Promise<void> {
  const pdfDocument = await PDFDocument.create({ updateMetadata: false });
  const page = pdfDocument.addPage([612, 792]);
  const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDocument.embedFont(StandardFonts.HelveticaBold);
  let cursorY = 740;

  const line = (text: string, size = 11, useBold = false) => {
    const safe = text.length > 102 ? `${text.slice(0, 99)}...` : text;
    page.drawText(safe, { x: 48, y: cursorY, size, font: useBold ? bold : font, color: rgb(0.1, 0.1, 0.12) });
    cursorY -= size + 8;
  };

  line('AetherCast - Local Air Quality & UV Brief', 18, true);
  line(`Generated locally on ${new Date().toLocaleString()}`, 9);
  line(`Selected standard: ${standard === 'US_EPA' ? 'US EPA AQI' : 'European Air Quality Index'}`, 10);
  if (dataset.latitude !== null && dataset.longitude !== null) {
    line(`Location: ${dataset.latitude.toFixed(4)}, ${dataset.longitude.toFixed(4)}${dataset.timezone ? ` (${dataset.timezone})` : ''}`, 10);
  } else if (dataset.timezone) {
    line(`Dataset timezone: ${dataset.timezone}`, 10);
  }
  line(`Imported rows: ${dataset.points.length}${dataset.truncatedRows ? `; omitted/invalid: ${dataset.truncatedRows}` : ''}`, 9);
  cursorY -= 6;

  const latest = assessments[assessments.length - 1];
  if (latest) {
    const selected = selectedIndex(latest, standard);
    line('Latest Imported Snapshot', 13, true);
    line(`${standard === 'US_EPA' ? 'US EPA AQI' : 'European index'}: ${selected.value ?? 'unknown'} (${selected.band ?? 'unknown'}; ${selected.coverage.toLowerCase()} coverage)`);
    line(`US EPA AQI: ${latest.compositeAqi ?? 'unknown'} (${latest.aqiCategory ?? 'unknown'}; ${latest.usAqiCoverage.toLowerCase()} coverage)`);
    line(`European index: ${latest.eaqiValue ?? 'unknown'} (${latest.eaqiBand ?? 'unknown'}; ${latest.europeanAqiCoverage.toLowerCase()} coverage)`);
    line(`UV Index: ${latest.point.uvIndex ?? 'unknown'}`);
    const timing = formatTimingHeuristic(latest.burnMinutes);
    if (timing) line(`Skin-type timing heuristic: ${timing}; this is not a safe-exposure limit.`);
    cursorY -= 6;

    line('WHO Air Quality Guideline Comparisons', 13, true);
    (['pm25', 'pm10', 'o3', 'no2', 'so2', 'co'] as const).forEach((key) => {
      const score = latest.pollutants[key];
      if (score.whoGuidelinePass === null) {
        line(`${key.toUpperCase()}: unavailable - a complete ${score.whoAveragingLabel ?? 'required'} window is not present.`, 9);
        return;
      }
      line(`${key.toUpperCase()}: ${score.whoGuidelinePass ? 'within' : 'above'} ${score.whoAveragingLabel ?? 'WHO guideline'}.`, 9);
    });
    cursorY -= 6;
  }

  line(`Screening Anomalies (${anomalies.length})`, 13, true);
  if (anomalies.length === 0) line('None detected in the imported range.');
  anomalies.slice(0, 8).forEach((event) => {
    line(`${event.type === 'WILDFIRE_SCREEN' ? 'Wildfire screen' : 'Thermal inversion'} - ${event.startTimestamp} (${event.confirmed ? 'corroborated' : 'unconfirmed'})`, 9);
  });
  if (anomalies.length > 8) line(`${anomalies.length - 8} additional anomaly entries are omitted from this one-page brief; use the workspace for the full list.`, 8);

  cursorY -= 10;
  const disclaimer = [
    'Local screening aid only; not an AirNow operational NowCast, regulatory determination, or medical advice.',
    'The UV timing heuristic is not a safe-exposure limit. WHO recommends sun protection when UVI reaches 3 or above.',
  ];
  disclaimer.forEach((text) => {
    if (cursorY > 42) {
      page.drawText(text, { x: 48, y: cursorY, size: 8, font, color: rgb(0.35, 0.35, 0.38) });
      cursorY -= 12;
    }
  });

  pdfDocument.context.trailerInfo.Info = undefined;
  const bytes = new Uint8Array(await pdfDocument.save());
  downloadBytes(bytes, 'aethercast-brief.pdf', 'application/pdf');
}
