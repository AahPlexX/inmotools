import { univerLikeSnapshot } from './sheets-io';
import type { PortableWorkbook } from './sheets-types';

export interface UniverHost {
  save(): Record<string, unknown> | null;
  dispose(): void;
}

interface UniverApi {
  createWorkbook: (data: Record<string, unknown>) => {
    save?: () => Record<string, unknown>;
    getId?: () => string;
  };
  getActiveWorkbook?: () => { save?: () => Record<string, unknown>; getId?: () => string } | null | undefined;
  dispose?: () => void;
}

interface UniverBundle {
  univer: { dispose: () => void };
  univerAPI: UniverApi;
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
        contextMenu: true,
        footer: { sheetBar: true, statisticBar: true, zoomSlider: true },
        statusBarStatistic: true,
      }),
    ],
  }) as unknown as UniverBundle;

  created.univerAPI.createWorkbook(snapshot);

  return {
    save() {
      const active = created.univerAPI.getActiveWorkbook?.();
      if (active?.save) return active.save();
      return snapshot;
    },
    dispose() {
      created.univer.dispose();
    },
  };
}

export function assertNoProImports(source: string): void {
  const pro = ['@univerjs', 'pro/'].join('-');
  if (source.includes(pro) || /from\s+['"]hyperformula['"]/.test(source)) {
    throw new Error('Banned spreadsheet engines must not be imported.');
  }
}
