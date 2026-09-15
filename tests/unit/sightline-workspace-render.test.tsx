/**
 * Render smoke tests for the reading workspace and its control panels.
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
  LibraryPanel,
  LookPanel,
  PacePanel,
} from '../../src/tools/sightline/SightlinePanels';
import { describeExports, EXPORT_DEFINITIONS, type ExportInputs } from '../../src/tools/sightline/export-plan';
import { DEFAULT_DOCX_EXPORT } from '../../src/tools/sightline/export-docx';
import { DEFAULT_EPUB_EXPORT } from '../../src/tools/sightline/export-epub';
import { DEFAULT_HTML_EXPORT } from '../../src/tools/sightline/export-html';
import { DEFAULT_PDF_EXPORT } from '../../src/tools/sightline/export-pdf';
import { DEFAULT_SETTINGS, createDefaultState } from '../../src/tools/sightline/sightline-store';
import { draftFromModel } from '../../src/tools/sightline/metadata-studio';
import { buildDocumentModel } from '../../src/tools/sightline/segmentation-engine';
import { buildColumnLayout, DEFAULT_PERIPHERAL } from '../../src/tools/sightline/peripheral-engine';
import {
  GRADIENT_PALETTES,
  checkGradientContrast,
  paletteById,
} from '../../src/tools/sightline/gradient-engine';
import { themeById, themeContrast, themeVariables } from '../../src/tools/sightline/palette-engine';
import { emphasisForLevel } from '../../src/tools/sightline/typography-engine';
import { summariseWarehouse } from '../../src/tools/sightline/analytics-engine';
import { DEFAULT_COLLECT, retentionRate } from '../../src/tools/sightline/vocabulary-engine';
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
    expect(workspaceHtml).toContain('class="sightline-surface"');
    for (const engine of ['rsvp', 'chunk', 'page', 'peripheral', 'drill']) {
      expect(workspaceHtml).toContain(`data-testid="sightline-engine-${engine}"`);
    }
    for (const panel of ['pace', 'look', 'drill', 'bank', 'marks', 'data', 'export']) {
      expect(workspaceHtml).toContain(`data-testid="sightline-panel-${panel}"`);
    }
  });

  it('shows the empty state and holds the document controls disabled', () => {
    expect(workspaceHtml).toContain('No document is open yet');
    expect(workspaceHtml).toContain('Load the sample passage');
    expect(workspaceHtml).toContain('Read the clipboard');
    expect(workspaceHtml).toContain('data-testid="sightline-clipboard"');
    expect(workspaceHtml).toContain('data-testid="sightline-dropzone"');
    const disabledButton = (testId: string) => new RegExp(`<button(?=[^>]*data-testid="${testId}")(?=[^>]*disabled)[^>]*>`);
    expect(workspaceHtml).toMatch(disabledButton('sightline-play'));
    expect(workspaceHtml).toMatch(disabledButton('sightline-ingest-paste'));
  });

  it('states the limits instead of promising a multiplier', () => {
    const lower = workspaceHtml.toLowerCase();
    expect(lower).toContain('does not do ocr');
    expect(lower).toContain('400 words per minute');
    expect(lower).toContain('stay in this browser');
    expect(lower).not.toContain('bionic');
    expect(lower).not.toContain('spritz');
    expect(lower).not.toContain('beeline');
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

  it('styles every class the workspace applies', () => {
    const css = readFileSync('src/tools/sightline/sightline-workspace.css', 'utf8');
    const defined = new Set([...css.matchAll(/\.([a-z][a-z0-9_-]*)/g)].map((match) => match[1]!));
    const missing: string[] = [];
    for (const file of ['SightlineWorkspace.tsx', 'SightlinePanels.tsx']) {
      const source = readFileSync(`src/tools/sightline/${file}`, 'utf8');
      for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const text = (match[1] ?? match[2] ?? '').replace(/\$\{[^}]*\}/g, ' ');
        for (const name of text.split(/\s+/)) {
          if (!name.startsWith('sightline-')) continue;
          if (defined.has(name) || name.endsWith('-')) continue;
          missing.push(`${file}: ${name}`);
        }
      }
    }
    expect([...new Set(missing)]).toEqual([]);
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
        onRamp={noop}
        metronomeSupported
        speechSupport={{ supported: true, boundaryEvents: true, reason: 'Speech synthesis is available.' }}
        voices={['Google US English']}
      />,
    );
    expect(html).toContain('data-testid="sightline-wpm-range"');
    expect(html).toContain('data-testid="sightline-rate-note"');
    expect(html).toContain('Subvocalization metronome');
    expect(html).toContain('Velocity ramp trainer');
    expect(html).toContain('data-testid="sightline-speech-status"');
    // The speed presets are bare numbers, so the accessible name stays short.
    expect(html).toMatch(/>450</);
  });

  it('renders the look panel with themes, fonts, markers, and palettes', () => {
    const html = renderToStaticMarkup(
      <LookPanel {...shared} stageWidth={1024} eccentricityDegrees={11} advisory="Two columns fit." />,
    );
    expect(html).toContain('data-testid="sightline-theme-oled"');
    expect(html).toContain('data-testid="sightline-font"');
    expect(html).toContain('data-testid="sightline-marker"');
    expect(html).toContain('data-testid="sightline-palette"');
    expect(html).toContain('data-testid="sightline-emphasis"');
    expect(html).toContain('aria-pressed="true"');
    // The viewport bounding calibrator reports the measured stage and the
    // eccentricity of the outermost column.
    expect(html).toContain('data-testid="sightline-columns"');
    expect(html).toContain('data-testid="sightline-eccentricity"');
    expect(html).toContain('1024 pixels wide');
    expect(html).toContain('11 degrees');
    expect(html).toContain('Two columns fit.');
  });

  it('warns when a palette cannot hold contrast on the chosen theme', () => {
    const theme = themeById('oled');
    const failing = GRADIENT_PALETTES.find((palette) => !checkGradientContrast(palette, theme.background).passes);
    expect(failing, 'a palette must fail on true black for this test to mean anything').toBeTruthy();
    const darkSettings: ReaderSettings = {
      ...settings,
      gradientPalette: failing!.id,
      appearance: { ...settings.appearance, theme: 'oled' },
    };
    const html = renderToStaticMarkup(
      <LookPanel
        settings={darkSettings}
        patch={noop}
        disabled={false}
        stageWidth={1024}
        eccentricityDegrees={11}
        advisory=""
      />,
    );
    expect(html).toContain('data-testid="sightline-gradient-contrast"');
    expect(html).toContain('below the 4.5:1 floor');
    expect(html).toContain('sightline-note--warning');
    expect(paletteById(failing!.id).label).toBe(failing!.label);
  });

  it('renders the drill panel with a plan summary and an exposure control', () => {
    const html = renderToStaticMarkup(
      <DrillPanel
        {...shared}
        weakWordCount={4}
        summary={null}
        running={false}
        plan={{ flashes: 20, items: 20, totalMs: 20_400, clamped: false }}
        onStart={noop}
        onStop={noop}
      />,
    );
    expect(html).toContain('data-testid="sightline-drill-plan"');
    expect(html).toContain('data-testid="sightline-flash-range"');
    expect(html).toContain('data-testid="sightline-drill-gap"');
    expect(html).toContain('data-testid="sightline-flash-count"');
    expect(html).toContain('data-testid="sightline-drill-run"');
    expect(html).toContain('20 flashes');
    expect(html).toContain('Draw from the word bank first (4 words collected)');
  });

  it('renders the word bank with an empty-state explanation', () => {
    const html = renderToStaticMarkup(
      <BankPanel
        bank={[]}
        cloze={[]}
        now={Date.now()}
        message=""
        onBuildCloze={noop}
        onCollect={noop}
        onMarkCurrent={noop}
        onRemove={noop}
        onReview={noop}
      />,
    );
    expect(html).toContain('data-testid="sightline-bank-summary"');
    expect(html).toContain('data-testid="sightline-bank-message"');
    expect(html).toContain('Nothing collected yet');
    expect(html).toContain('Mark the current word as unknown');
    expect(html).toContain('Build a cloze drill');
    expect(html).toContain('Retention 0%');
  });

  it('renders the cloze passage once blanks exist', () => {
    const html = renderToStaticMarkup(
      <BankPanel
        bank={[]}
        cloze={[
          {
            answer: 'pacing',
            tokenIndex: 3,
            text: 'The ___ changes the task.',
            options: ['pacing', 'pacing', 'paces', 'packing'],
            answerIndex: 0,
          },
        ]}
        now={Date.now()}
        message="Marked “pacing” for the word bank."
        onBuildCloze={noop}
        onCollect={noop}
        onMarkCurrent={noop}
        onRemove={noop}
        onReview={noop}
      />,
    );
    expect(html).toContain('data-testid="sightline-cloze-item"');
    expect(html).toContain('The ___ changes the task.');
    expect(html).toContain('Marked “pacing” for the word bank.');
  });

  it('renders the warehouse panel with no history recorded yet', () => {
    const html = renderToStaticMarkup(
      <DataPanel
        summary={summariseWarehouse([], [], 0)}
        sessions={[]}
        velocity={[]}
        vocabularySize={0}
        storageNote="Reading history is kept in this browser only."
        onClear={noop}
      />,
    );
    expect(html).toContain('data-testid="sightline-storage-note"');
    expect(html).toContain('data-testid="sightline-warehouse-summary"');
    expect(html).toContain('Reading history is kept in this browser only.');
    expect(html).toContain('No sessions recorded yet');
    expect(html).toContain('data-testid="sightline-warehouse-clear"');
  });

  it('renders the marks panel with saved positions and an empty library', () => {
    const html = renderToStaticMarkup(
      <LibraryPanel
        bookmarks={[{ id: 'b1', tokenIndex: 12, label: 'Findings', createdAt: Date.now() }]}
        highlights={[{ id: 'h1', startToken: 4, endToken: 9, color: 'amber' }]}
        notes={[{ id: 'n1', tokenIndex: 7, text: 'Worth citing.' }]}
        progress={[
          { documentId: 'reading-notes.md', title: 'Reading Notes', tokenIndex: 12, tokenCount: 40, updatedAt: Date.now() },
        ]}
        currentDocumentId="reading-notes.md"
        highlightColor="amber"
        onColor={noop}
        onJump={noop}
        onInspect={noop}
        onRemoveBookmark={noop}
        onRemoveHighlight={noop}
        onRemoveNote={noop}
      />,
    );
    expect(html).toContain('data-testid="sightline-bookmark-list"');
    expect(html).toContain('data-testid="sightline-highlight-list"');
    expect(html).toContain('data-testid="sightline-note-list"');
    expect(html).toContain('data-testid="sightline-progress-list"');
    expect(html).toContain('Worth citing.');
    expect(html).toContain('open now');
  });

  it('offers every planned export with its availability note', () => {
    const html = renderToStaticMarkup(
      <ExportPanel
        draft={draftFromModel(model())}
        onDraft={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onSuggestTags={noop}
        onMeasuredLevel={noop}
        rows={describeExports(undefined, exportInputs(false))}
        busy={null}
        message=""
        filePreview="reading-notes-weighted.pdf"
        onDownload={noop}
        onImportState={noop}
        onExportState={noop}
        state={createDefaultState()}
        model={undefined}
      />,
    );
    for (const definition of EXPORT_DEFINITIONS) {
      expect(html, `${definition.id} row`).toContain(`data-testid="sightline-export-${definition.id}"`);
    }
    expect(html).toContain('Open a document to enable this export.');
    // The reader-state export is about the session rather than the document.
    const readerState = html.slice(html.indexOf('data-testid="sightline-export-reader-state"'));
    expect(readerState.slice(0, 200)).not.toContain('disabled=""');
    expect(html).toContain('data-testid="sightline-meta-title"');
    expect(html).toContain('data-testid="sightline-tag-input"');
    expect(html).toContain('data-testid="sightline-state-import"');
    expect(html).toContain('data-testid="sightline-social-table"');
    expect(html).toContain('og:title');
    expect(html).toContain('data-testid="sightline-structured-data"');
    expect(html).toContain('data-testid="sightline-file-preview"');
    expect(html).toContain('reading-notes-weighted.pdf');
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
    expect(emphasisForLevel(5).fraction).toBeGreaterThan(emphasisForLevel(1).fraction);
  });

  it('reports retention from the reviews rather than from the words collected', () => {
    expect(retentionRate([])).toBe(0);
    const now = Date.now();
    const entry = {
      word: 'pacing',
      seen: 4,
      correct: 3,
      weight: 1.2,
      averageMs: 900,
      intervalDays: 2,
      dueAt: now,
      addedAt: now - 86_400_000,
    };
    expect(retentionRate([entry])).toBe(75);
    expect(DEFAULT_COLLECT.minLetters).toBeGreaterThan(2);
  });
});
