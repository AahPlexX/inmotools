/**
 * Render smoke tests for the reading workspace and its panels.
 *
 * The browser spec in `tests/e2e/sightline.spec.ts` is the real interface test,
 * but it needs a browser. These tests render the workspace and each panel to
 * static markup in Node, which catches the failures that would otherwise only
 * appear in CI: an undefined engine call on first render, a control with no
 * accessible name, a disabled state that is missing when no document is open,
 * an accidental use of a browser global during render, and a stylesheet that
 * reads theme variables the theme engine does not write.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SightlineWorkspace from '../../src/tools/sightline/SightlineWorkspace';
import {
  BankPanel,
  DataPanel,
  DrillPanel,
  ExportPanel,
  LookPanel,
  PacePanel,
} from '../../src/tools/sightline/SightlinePanels';
import { describeExports, EXPORT_DEFINITIONS, type ExportInputs } from '../../src/tools/sightline/export-plan';
import { DEFAULT_DOCX_EXPORT } from '../../src/tools/sightline/export-docx';
import { DEFAULT_EPUB_EXPORT } from '../../src/tools/sightline/export-epub';
import { DEFAULT_HTML_EXPORT } from '../../src/tools/sightline/export-html';
import { DEFAULT_PDF_EXPORT } from '../../src/tools/sightline/export-pdf';
import { DEFAULT_SETTINGS, createDefaultState } from '../../src/tools/sightline/sightline-store';
import { draftFromModel, socialTags } from '../../src/tools/sightline/metadata-studio';
import { buildDocumentModel } from '../../src/tools/sightline/segmentation-engine';
import { buildColumnLayout, DEFAULT_PERIPHERAL } from '../../src/tools/sightline/peripheral-engine';
import { themeById, themeContrast, themeVariables } from '../../src/tools/sightline/palette-engine';
import { emphasisForLevel } from '../../src/tools/sightline/typography-engine';
import { DEFAULT_GRADIENT } from '../../src/tools/sightline/gradient-engine';
import type { ReaderSettings } from '../../src/tools/sightline/sightline-store';

const workspaceHtml = renderToStaticMarkup(<SightlineWorkspace />);

const noop = () => undefined;

const model = () => {
  const built = buildDocumentModel({
    format: 'markdown',
    fileName: 'reading-notes.md',
    byteLength: 2048,
    paragraphs: [
      { kind: 'heading', level: 1, text: 'Findings' },
      { kind: 'body', level: 0, text: 'Reading is a skill that responds to practice, and pacing changes the task.' },
    ],
  });
  return { ...built, metadata: { ...built.metadata, title: 'Reading Notes', author: 'Dana Reader' } };
};

const exportInputs = (withModel: boolean): ExportInputs => {
  const document = model();
  return {
    ...(withModel ? { model: document } : {}),
    draft: draftFromModel(document),
    html: DEFAULT_HTML_EXPORT,
    pdf: DEFAULT_PDF_EXPORT,
    epub: DEFAULT_EPUB_EXPORT,
    docx: DEFAULT_DOCX_EXPORT,
    sessions: [],
    documents: [],
    vocabulary: [],
    state: createDefaultState(),
  };
};

describe('workspace first render', () => {
  it('renders the reader, the engine tabs, and the control tabs', () => {
    expect(workspaceHtml).toContain('data-testid="sightline-velocity"');
    expect(workspaceHtml).toContain('data-testid="sightline-stage"');
    expect(workspaceHtml).toContain('data-testid="sightline-play"');
    expect(workspaceHtml).toContain('data-testid="sightline-scrub"');
    for (const engine of ['rsvp', 'chunk', 'page', 'peripheral', 'drill']) {
      expect(workspaceHtml).toContain(`data-testid="sightline-engine-${engine}"`);
    }
    for (const panel of ['pace', 'look', 'drill', 'bank', 'data', 'export']) {
      expect(workspaceHtml).toContain(`data-testid="sightline-panel-${panel}"`);
    }
  });

  it('shows the empty state and holds the document controls disabled', () => {
    expect(workspaceHtml).toContain('No document yet');
    expect(workspaceHtml).toContain('Load the sample passage');
    expect(workspaceHtml).toContain('No document open');
    const disabledButton = (testId: string) => new RegExp(`<button(?=[^>]*data-testid="${testId}")(?=[^>]*disabled)[^>]*>`);
    expect(workspaceHtml).toMatch(disabledButton('sightline-play'));
    expect(workspaceHtml).toMatch(disabledButton('sightline-ingest-paste'));
  });

  it('states the limits instead of promising a multiplier', () => {
    expect(workspaceHtml).toContain('data-testid="sightline-advice"');
    expect(workspaceHtml).toMatch(/comprehension you want/i);
    expect(workspaceHtml.toLowerCase()).not.toContain('bionic');
  });

  it('uses the theme variables the theme engine writes', () => {
    const css = readFileSync('src/tools/sightline/sightline-workspace.css', 'utf8');
    const written = new Set(Object.keys(themeVariables(DEFAULT_SETTINGS.appearance)));
    // Two variables are set per render by the workspace because they depend on
    // the measured stage rather than on the theme.
    written.add('--sightline-word-size');
    written.add('--sightline-page-size');
    const used = [...css.matchAll(/var\((--sightline-[a-z-]+)/g)].map((match) => match[1]!);
    expect(used.length).toBeGreaterThan(4);
    for (const name of new Set(used)) {
      expect(written.has(name), `${name} is read by the stylesheet but never written`).toBe(true);
    }
  });
});

describe('control panels render with real data', () => {
  const settings: ReaderSettings = DEFAULT_SETTINGS;
  const shared = { settings, patch: noop, disabled: false };

  it('renders the pace panel with every pacing control', () => {
    const html = renderToStaticMarkup(
      <PacePanel
        {...shared}
        onPreset={noop}
        onRampStart={noop}
        speechSupport={{ supported: true, boundaryEvents: true, reason: 'Speech synthesis is available.' }}
        metronomeSupported
      />,
    );
    expect(html).toContain('data-testid="sightline-wpm-range"');
    expect(html).toContain('data-testid="sightline-rate-note"');
    expect(html).toContain('Subvocalization metronome');
    expect(html).toContain('Velocity ramp trainer');
    expect(html).toContain('data-testid="sightline-speech-status"');
  });

  it('renders the look panel with themes, fonts, markers, and palettes', () => {
    const theme = themeById(settings.appearance.theme);
    const html = renderToStaticMarkup(
      <LookPanel {...shared} theme={theme} contrast={themeContrast(theme)} gradientContrast={null} />,
    );
    expect(html).toContain('data-testid="sightline-theme-oled"');
    expect(html).toContain('data-testid="sightline-font"');
    expect(html).toContain('data-testid="sightline-marker"');
    expect(html).toContain('data-testid="sightline-palette"');
    expect(html).toContain('data-testid="sightline-emphasis"');
  });

  it('warns when a palette cannot hold contrast on the chosen theme', () => {
    const theme = themeById('oled');
    const html = renderToStaticMarkup(
      <LookPanel
        {...shared}
        theme={theme}
        contrast={themeContrast(theme)}
        gradientContrast={{ ratio: 1.4, passes: false, background: theme.background, worstStop: '#111111' }}
      />,
    );
    expect(html).toContain('data-testid="sightline-gradient-warning"');
  });

  it('renders the drill panel with a plan summary and a result', () => {
    const html = renderToStaticMarkup(
      <DrillPanel
        {...shared}
        running={false}
        progress={{ position: 0, items: 20, flashMs: 120, totalMs: 20_400, clamped: false }}
        result={{ correct: 18, total: 20, accuracy: 0.9, firstTryAccuracy: 0.85, equivalentWpm: 500 }}
        onStart={noop}
        onStop={noop}
      />,
    );
    expect(html).toContain('data-testid="sightline-drill-plan"');
    expect(html).toContain('data-testid="sightline-flash-range"');
    expect(html).toContain('data-testid="sightline-drill-result"');
    expect(html).toContain('500 words per minute');
  });

  it('renders the word bank with an empty-state explanation', () => {
    const html = renderToStaticMarkup(
      <BankPanel
        bank={[]}
        cloze={[]}
        now={Date.now()}
        weakCount={0}
        message=""
        onBuildCloze={noop}
        onCollect={noop}
        onMarkCurrent={noop}
        onRemove={noop}
        onReview={noop}
      />,
    );
    expect(html).toContain('data-testid="sightline-bank-summary"');
    expect(html).toContain('The bank is empty');
    expect(html).toContain('Retention —');
  });

  it('renders the warehouse panel with no history recorded yet', () => {
    const html = renderToStaticMarkup(
      <DataPanel
        summary={null}
        sessions={[]}
        velocity={[]}
        streak={0}
        storageNote="Reading history is kept in this browser only."
        documentProgress={[]}
        onRefresh={noop}
        onClear={noop}
        onOpenSession={noop}
        onResume={noop}
      />,
    );
    expect(html).toContain('data-testid="sightline-storage-note"');
    expect(html).toContain('No sessions recorded yet');
    expect(html).toContain('Reading positions are saved here');
  });

  it('offers every planned export with its availability note', () => {
    const html = renderToStaticMarkup(
      <ExportPanel
        draft={draftFromModel(model())}
        onDraft={noop}
        onTag={noop}
        onRemoveTag={noop}
        onSuggestTags={noop}
        onReadingLevel={noop}
        socialPreview={socialTags(draftFromModel(model()), 'A local study.')}
        structuredPreview="{}"
        rows={describeExports(undefined, exportInputs(false))}
        busyExport=""
        onDownload={noop}
        onImportState={noop}
        onExportState={noop}
        validation={[]}
        fileNamePreview="reading-notes-weighted.pdf"
        message=""
        model={undefined}
        metrics={undefined}
      />,
    );
    for (const definition of EXPORT_DEFINITIONS) {
      expect(html, `${definition.id} row`).toContain(`data-testid="sightline-export-${definition.id}"`);
      expect(html, `${definition.id} note`).toContain(`data-testid="sightline-note-${definition.id}"`);
    }
    expect(html).toContain('Open a document to enable this export');
    // The reader-state export is about the session rather than the document.
    const readerState = html.slice(html.indexOf('data-testid="sightline-export-reader-state"'));
    expect(readerState.slice(0, 200)).not.toContain('disabled=""');
    expect(html).toContain('data-testid="sightline-meta-title"');
    expect(html).toContain('data-testid="sightline-file-preview"');
  });
});

describe('engine surfaces accept the settings the panels write', () => {
  it('builds a peripheral layout for the configured column count', () => {
    const layout = buildColumnLayout(1200, DEFAULT_PERIPHERAL);
    expect(layout).toHaveLength(DEFAULT_PERIPHERAL.columns);
    expect(Math.min(...layout.map((column) => column.leftFraction))).toBeGreaterThanOrEqual(0);
  });

  it('derives the emphasis configuration from the chosen level', () => {
    expect(emphasisForLevel(3).fraction).toBeCloseTo(0.4, 5);
    expect(DEFAULT_GRADIENT.direction).toBe('horizontal');
  });
});
