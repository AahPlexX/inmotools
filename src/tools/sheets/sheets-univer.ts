import { univerLikeSnapshot } from './sheets-io';
import type { PortableWorkbook } from './sheets-types';

export const UNIVER_FORMULA_SSOT = 'univer-engine-formula' as const;
export const PORTABLE_FORMULA_SSOT = 'portable-dag' as const;

export interface UniverCalculated {
  a1: string;
  value: unknown;
  formula: string;
}

export interface UniverHost {
  save(): Record<string, unknown> | null;
  dispose(): void;
  formulaSsot: typeof UNIVER_FORMULA_SSOT;
  readCalculated(a1: string): UniverCalculated | null;
}

interface UniverRange {
  getValue?: () => unknown;
  getDisplayValue?: () => unknown;
  getFormula?: () => string;
}

interface UniverSheetApi {
  getRange?: (a1: string) => UniverRange | null | undefined;
}

interface UniverWorkbookApi {
  save?: () => Record<string, unknown>;
  getId?: () => string;
  getActiveSheet?: () => UniverSheetApi | null | undefined;
}

interface UniverApi {
  createWorkbook: (data: Record<string, unknown>) => UniverWorkbookApi;
  getActiveWorkbook?: () => UniverWorkbookApi | null | undefined;
  dispose?: () => void;
}

interface UniverBundle {
  univer: { dispose: () => void };
  univerAPI: UniverApi;
}

export function readUniverCalculated(
  host: Pick<UniverHost, 'readCalculated'>,
  a1: string,
): UniverCalculated | null {
  return host.readCalculated(a1);
}

function readCalculatedFromApi(api: UniverApi, a1: string): UniverCalculated | null {
  const workbook = api.getActiveWorkbook?.();
  const sheet = workbook?.getActiveSheet?.();
  const range = sheet?.getRange?.(a1);
  if (!range) return null;
  const formula = range.getFormula?.() ?? '';
  const value = range.getValue?.() ?? range.getDisplayValue?.();
  return { a1, value, formula };
}

export async function mountUniverSheets(container: HTMLElement, workbook: PortableWorkbook): Promise<UniverHost> {
  const [{ createUniver, LocaleType, mergeLocales }, { UniverSheetsCorePreset }, localeModule] = await Promise.all([
    import('@univerjs/presets'),
    import('@univerjs/preset-sheets-core'),
    import('@univerjs/preset-sheets-core/locales/en-US'),
  ]);
  await import('@univerjs/preset-sheets-core/lib/index.css');

  const locale = (localeModule as { default?: Record<string, unknown> }).default ?? localeModule;
  const snapshot = univerLikeSnapshot(workbook);
  const created = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(locale),
    },
    presets: [
      UniverSheetsCorePreset({
        container,
        header: true,
        toolbar: true,
        formulaBar: true,
        contextMenu: false,
        footer: { sheetBar: true, statisticBar: true, zoomSlider: true },
        statusBarStatistic: true,
      }),
    ],
  }) as unknown as UniverBundle;

  created.univerAPI.createWorkbook(snapshot);
  container.dataset.formulaSsot = UNIVER_FORMULA_SSOT;
  container.setAttribute('data-formula-engine', 'engine-formula');

  return {
    formulaSsot: UNIVER_FORMULA_SSOT,
    save() {
      const active = created.univerAPI.getActiveWorkbook?.();
      if (active?.save) return active.save();
      return snapshot;
    },
    readCalculated(a1: string) {
      return readCalculatedFromApi(created.univerAPI, a1);
    },
    dispose() {
      created.univer.dispose();
    },
  };
}

export function assertNoProImports(source: string): void {
  const pro = ['@univerjs', 'pro/'].join('-');
  const advanced = ['preset-sheets', 'advanced'].join('-');
  const drawing = ['preset-sheets', 'drawing'].join('-');
  if (
    source.includes(pro) ||
    source.includes(advanced) ||
    source.includes(drawing) ||
    /from\s+['"]hyperformula['"]/.test(source)
  ) {
    throw new Error('Banned spreadsheet engines must not be imported.');
  }
}
