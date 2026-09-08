import Papa from 'papaparse';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { downloadBlob, downloadBytes, downloadText } from '../../lib/download';
import type { AetherCastDataset, AnomalyEvent, HourlyAssessment, IndexStandard } from './aethercast-types';

const POLLUTANTS = ['pm25', 'pm10', 'o3', 'no2', 'so2', 'co'] as const;

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

const pollutantCoverage = (assessment: HourlyAssessment): string => {
  const available = POLLUTANTS.filter((key) => assessment.pollutants[key].subIndex !== null);
  return `${available.length}/6${available.length ? ` (${available.map((key) => key.toUpperCase()).join(', ')})` : ''}`;
};

export function exportCsv(assessments: readonly HourlyAssessment[], standard: IndexStandard = 'US_EPA'): void {
  const rows = assessments.map((assessment) => {
    const selected = selectedIndex(assessment, standard);
    return {
      timestamp: assessment.point.isoTimestamp,
      calculation_origin: 'locally_calculated_from_raw_concentrations',
      selected_standard: standard,
      selected_index: selected.value ?? '',
      selected_band: selected.band ?? '',
      selected_coverage: selected.coverage,
      us_epa_aqi_calculated: assessment.compositeAqi ?? '',
      us_epa_category_calculated: assessment.aqiCategory ?? '',
      us_epa_coverage: assessment.usAqiCoverage,
      us_epa_pollutant_coverage: pollutantCoverage(assessment),
      european_index_calculated: assessment.eaqiValue ?? '',
      european_band_calculated: assessment.eaqiBand ?? '',
      european_coverage: assessment.europeanAqiCoverage,
      provider_us_aqi_imported: assessment.point.providedUsAqi ?? '',
      provider_european_aqi_imported: assessment.point.providedEuropeanAqi ?? '',
      pm25_ugm3: assessment.point.pm25 ?? '',
      pm10_ugm3: assessment.point.pm10 ?? '',
      co_ugm3: assessment.point.carbonMonoxideUgM3 ?? '',
      no2_ugm3: assessment.point.nitrogenDioxide ?? '',
      so2_ugm3: assessment.point.sulphurDioxide ?? '',
      o3_ugm3: assessment.point.ozone ?? '',
      uv_index: assessment.point.uvIndex ?? '',
      skin_type_timing_heuristic: formatTimingHeuristic(assessment.burnMinutes),
      pm25_epa_subindex: assessment.pollutants.pm25.subIndex === null ? '' : Math.round(assessment.pollutants.pm25.subIndex),
      pm25_epa_status: assessment.pollutants.pm25.subIndex === null ? 'unavailable_or_incomplete_window' : 'available',
      pm25_epa_method: assessment.pollutants.pm25.epaAveragingLabel ?? '',
      pm10_epa_subindex: assessment.pollutants.pm10.subIndex === null ? '' : Math.round(assessment.pollutants.pm10.subIndex),
      pm10_epa_status: assessment.pollutants.pm10.subIndex === null ? 'unavailable_or_incomplete_window' : 'available',
      pm10_epa_method: assessment.pollutants.pm10.epaAveragingLabel ?? '',
      o3_epa_subindex: assessment.pollutants.o3.subIndex === null ? '' : Math.round(assessment.pollutants.o3.subIndex),
      o3_epa_status: assessment.pollutants.o3.subIndex === null ? 'unavailable_or_incomplete_window' : 'available',
      o3_epa_method: assessment.pollutants.o3.epaAveragingLabel ?? '',
      no2_epa_subindex: assessment.pollutants.no2.subIndex === null ? '' : Math.round(assessment.pollutants.no2.subIndex),
      no2_epa_status: assessment.pollutants.no2.subIndex === null ? 'unavailable_or_incomplete_window' : 'available',
      no2_epa_method: assessment.pollutants.no2.epaAveragingLabel ?? '',
      so2_epa_subindex: assessment.pollutants.so2.subIndex === null ? '' : Math.round(assessment.pollutants.so2.subIndex),
      so2_epa_status: assessment.pollutants.so2.subIndex === null ? 'unavailable_or_incomplete_window' : 'available',
      so2_epa_method: assessment.pollutants.so2.epaAveragingLabel ?? '',
      co_epa_subindex: assessment.pollutants.co.subIndex === null ? '' : Math.round(assessment.pollutants.co.subIndex),
      co_epa_status: assessment.pollutants.co.subIndex === null ? 'unavailable_or_incomplete_window' : 'available',
      co_epa_method: assessment.pollutants.co.epaAveragingLabel ?? '',
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
  line(`Selected standard: ${standard === 'US_EPA' ? 'US EPA AQI' : 'European Air Quality Index'}; calculated locally from raw concentrations`, 9);
  if (dataset.latitude !== null && dataset.longitude !== null) {
    line(`Location: ${dataset.latitude.toFixed(4)}, ${dataset.longitude.toFixed(4)}${dataset.timezone ? ` (${dataset.timezone})` : ''}`, 10);
  } else if (dataset.timezone) {
    line(`Dataset timezone: ${dataset.timezone}`, 10);
  }
  line(`Imported rows: ${dataset.points.length}${dataset.truncatedRows ? `; omitted/invalid: ${dataset.truncatedRows}` : ''}`, 9);
  if (dataset.timestampReconciliation) {
    const report = dataset.timestampReconciliation;
    line(`Timestamp reconciliation: ${report.acceptedRows}/${report.consideredRows} accepted; ${report.rejectedRows} rejected; ambiguous/nonexistent wall times rejected.`, 8);
  }
  cursorY -= 6;

  const latest = assessments[assessments.length - 1];
  if (latest) {
    const selected = selectedIndex(latest, standard);
    line('Latest Imported Snapshot', 13, true);
    line(`${standard === 'US_EPA' ? 'Calculated US EPA AQI' : 'Calculated European index'}: ${selected.value ?? 'unknown'} (${selected.band ?? 'unknown'}; ${selected.coverage.toLowerCase()} coverage)`);
    line(`Calculated US EPA AQI: ${latest.compositeAqi ?? 'unknown'} (${latest.aqiCategory ?? 'unknown'}; ${latest.usAqiCoverage.toLowerCase()} coverage)`);
    line(`Imported provider US AQI: ${latest.point.providedUsAqi ?? 'not supplied'}`, 9);
    line(`Calculated European index: ${latest.eaqiValue ?? 'unknown'} (${latest.eaqiBand ?? 'unknown'}; ${latest.europeanAqiCoverage.toLowerCase()} coverage)`);
    line(`Imported provider European AQI: ${latest.point.providedEuropeanAqi ?? 'not supplied'}`, 9);
    line(`US pollutant subindex coverage: ${pollutantCoverage(latest)}`, 9);
    line(`UV Index: ${latest.point.uvIndex ?? 'unknown'}`);
    const timing = formatTimingHeuristic(latest.burnMinutes);
    if (timing) line(`Skin-type timing heuristic: ${timing}; this is not a safe-exposure limit.`);
    cursorY -= 4;

    line('EPA Pollutant Calculation Availability', 12, true);
    for (const key of POLLUTANTS) {
      const score = latest.pollutants[key];
      line(`${key.toUpperCase()}: ${score.subIndex === null ? 'not currently calculable' : `subindex ${Math.round(score.subIndex)}`} - ${score.epaAveragingLabel ?? 'method unavailable'}`, 8);
      if (cursorY < 185) break;
    }
    cursorY -= 4;

    if (cursorY > 150) {
      line('WHO Air Quality Guideline Comparisons', 12, true);
      for (const key of POLLUTANTS) {
        const score = latest.pollutants[key];
        if (score.whoGuidelinePass === null) {
          line(`${key.toUpperCase()}: unavailable - a complete ${score.whoAveragingLabel ?? 'required'} window is not present.`, 8);
        } else {
          line(`${key.toUpperCase()}: ${score.whoGuidelinePass ? 'within' : 'above'} ${score.whoAveragingLabel ?? 'WHO guideline'}.`, 8);
        }
        if (cursorY < 90) break;
      }
    }
  }

  if (cursorY > 90) {
    cursorY -= 6;
    line(`Screening Anomalies (${anomalies.length})`, 12, true);
    if (anomalies.length === 0) line('None detected in the imported range.', 9);
    anomalies.slice(0, 3).forEach((event) => {
      if (cursorY > 56) line(`${event.type === 'WILDFIRE_SCREEN' ? 'Wildfire screen' : 'Thermal inversion'} - ${event.startTimestamp} (${event.confirmed ? 'corroborated' : 'unconfirmed'})`, 8);
    });
  }

  const disclaimer = [
    'Local screening aid only; not an AirNow operational NowCast, regulatory determination, or medical advice.',
    'Imported provider indices are shown only for comparison and are never substituted for local calculations.',
  ];
  let disclaimerY = 38;
  disclaimer.forEach((text) => {
    page.drawText(text, { x: 48, y: disclaimerY, size: 7, font, color: rgb(0.35, 0.35, 0.38) });
    disclaimerY += 10;
  });

  pdfDocument.context.trailerInfo.Info = undefined;
  const bytes = new Uint8Array(await pdfDocument.save());
  downloadBytes(bytes, 'aethercast-brief.pdf', 'application/pdf');
}
