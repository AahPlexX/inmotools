/**
 * Control panels for Sightline Velocity Studio.
 *
 * These components are presentational: every value is computed by the engines
 * under `src/tools/sightline/` and every change is reported back to the
 * workspace, which owns the reader state. Keeping the panels free of engine
 * calls means the reading surface and the panels cannot disagree about the
 * current settings.
 */

import type {
  ClozeItem,
  VocabularyEntry,
} from './vocabulary-engine';
import { BLANK, dueEntries, retentionRate } from './vocabulary-engine';
import {
  ANCHOR_ACCENTS,
  FONT_CHOICES,
  FOCAL_MARKERS,
  READER_THEMES,
  type ReaderTheme,
} from './palette-engine';
import { emphasisForLevel } from './typography-engine';
import { GRADIENT_PALETTES } from './gradient-engine';
import { METRONOME_PRESETS, tempoName } from './metronome-engine';
import { RAMP_PRESETS, WPM_STEPS, rateNote } from './pacing-engine';
import { DRILL_PRESETS } from './drill-engine';
import { SPEECH_RATE_PRESETS } from './speech-engine';
import type { StoredSession, VelocityPoint, WarehouseSummary } from './analytics-engine';
import type { ExportDefinition } from './export-plan';
import type {
  DocumentModel,
  ProseMetrics,
} from './sightline-types';
import type {
  HighlightColor,
  MarginNote,
  ReaderSettings,
} from './sightline-store';
import type { MetadataDraft } from './metadata-studio';

export interface PanelSharedProps {
  readonly settings: ReaderSettings;
  readonly patch: (values: Partial<ReaderSettings>) => void;
  readonly disabled: boolean;
}

const formatMs = (ms: number): string => `${Math.round(ms).toLocaleString('en-US')} ms`;

const formatRatio = (value: number): string => `${value.toFixed(1)}×`;

/* ---------------------------------------------------------------- pace ---- */

export interface PacePanelProps extends PanelSharedProps {
  readonly onPreset: (wpm: number) => void;
  readonly onRampStart: (startWpm: number) => void;
  readonly speechSupport: { readonly supported: boolean; readonly boundaryEvents: boolean; readonly reason: string };
  readonly metronomeSupported: boolean;
}

export function PacePanel({ settings, patch, disabled, onPreset, onRampStart, speechSupport, metronomeSupported }: PacePanelProps) {
  const pacing = settings.pacing;
  return (
    <>
      <section className="sightline-card" aria-labelledby="sightline-pace-heading">
        <h2 id="sightline-pace-heading">Pacing</h2>
        <label className="sightline-field">
          <span>Reading rate — {pacing.wpm} words per minute</span>
          <input
            type="range"
            min={40}
            max={1600}
            step={5}
            value={pacing.wpm}
            data-testid="sightline-wpm-range"
            onChange={(event) => patch({ pacing: { ...pacing, wpm: Number(event.target.value) } })}
          />
        </label>
        <div className="sightline-row">
          {WPM_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              className="sightline-button"
              aria-pressed={pacing.wpm === step}
              onClick={() => onPreset(step)}
              disabled={disabled}
            >
              {step}
            </button>
          ))}
        </div>
        <p className="sightline-note" data-testid="sightline-rate-note">{rateNote(pacing.wpm)}</p>

        <div className="sightline-field-grid">
          <label className="sightline-field">
            <span>Word length compensation</span>
            <select
              value={pacing.compensator}
              onChange={(event) => patch({ pacing: { ...pacing, compensator: event.target.value as typeof pacing.compensator } })}
            >
              <option value="syllable">Syllables</option>
              <option value="length">Letters</option>
              <option value="none">None (steady metronome)</option>
            </select>
          </label>
          <label className="sightline-field">
            <span>Chunk size — {settings.chunk.wordsPerChunk} word{settings.chunk.wordsPerChunk === 1 ? '' : 's'}</span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={settings.chunk.wordsPerChunk}
              onChange={(event) => patch({ chunk: { ...settings.chunk, wordsPerChunk: Number(event.target.value) } })}
            />
          </label>
          <label className="sightline-field">
            <span>Chunk breaking</span>
            <select
              value={settings.chunk.splitPolicy}
              onChange={(event) => patch({ chunk: { ...settings.chunk, splitPolicy: event.target.value as typeof settings.chunk.splitPolicy } })}
            >
              <option value="punctuation">Keep phrases together</option>
              <option value="balanced">Even chunks per sentence</option>
            </select>
          </label>
        </div>

        <label className="sightline-row">
          <input
            type="checkbox"
            checked={pacing.respectBreaks}
            onChange={(event) => patch({ pacing: { ...pacing, respectBreaks: event.target.checked } })}
          />
          <span>Pause at punctuation and sentence ends</span>
        </label>
        <div className="sightline-field-grid">
          {([
            ['periodMultiplier', 'After a full stop'],
            ['clauseMultiplier', 'After a comma'],
            ['paragraphMultiplier', 'After a paragraph'],
            ['chapterMultiplier', 'After a section'],
          ] as const).map(([key, label]) => (
            <label className="sightline-field" key={key}>
              <span>{label} — {formatRatio(pacing[key])}</span>
              <input
                type="range"
                min={1}
                max={4}
                step={0.1}
                disabled={!pacing.respectBreaks}
                value={pacing[key]}
                onChange={(event) => patch({ pacing: { ...pacing, [key]: Number(event.target.value) } })}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-ramp-heading">
        <h2 id="sightline-ramp-heading">Velocity ramp trainer</h2>
        <p className="sightline-note">
          The ramp starts below your chosen rate and adds a step every few words, so the passage accelerates while you keep the same
          comprehension target.
        </p>
        <div className="sightline-row">
          {RAMP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="sightline-button"
              disabled={disabled}
              onClick={() => onRampStart(preset.config.startWpm)}
              title={preset.detail}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            className="sightline-button sightline-button--ghost"
            onClick={() => patch({ pacing: { ...pacing, ramp: null } })}
          >
            Ramp off
          </button>
        </div>
        {pacing.ramp
          ? <p className="sightline-note">Ramp active: {pacing.ramp.startWpm} → {pacing.ramp.ceilingWpm} words per minute, +{pacing.ramp.stepWpm} every {pacing.ramp.everyTokens} words.</p>
          : null}
      </section>

      <section className="sightline-card" aria-labelledby="sightline-metronome-heading">
        <h2 id="sightline-metronome-heading">Subvocalization metronome</h2>
        <p className="sightline-note">
          A steady click gives the inner voice a rhythm to follow instead of finishing each word. Range 40–400 beats per minute.
        </p>
        <label className="sightline-field">
          <span>Beats per minute — {settings.metronome.bpm} ({tempoName(settings.metronome.bpm)})</span>
          <input
            type="range"
            min={40}
            max={400}
            step={5}
            value={settings.metronome.bpm}
            onChange={(event) => patch({ metronome: { ...settings.metronome, bpm: Number(event.target.value) } })}
          />
        </label>
        <div className="sightline-row">
          {METRONOME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="sightline-button"
              aria-pressed={settings.metronome.bpm === preset.bpm}
              title={preset.detail}
              onClick={() => patch({ metronome: { ...settings.metronome, bpm: preset.bpm } })}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="sightline-field-grid">
          <label className="sightline-field">
            <span>Channel</span>
            <select
              value={settings.metronome.channel}
              onChange={(event) => patch({ metronome: { ...settings.metronome, channel: event.target.value as typeof settings.metronome.channel } })}
            >
              <option value="audio">Click</option>
              <option value="visual">Visual beat</option>
              <option value="both">Click and visual</option>
            </select>
          </label>
          <label className="sightline-field">
            <span>Accent every {settings.metronome.accentEvery} beat(s)</span>
            <input
              type="range"
              min={1}
              max={8}
              step={1}
              value={settings.metronome.accentEvery}
              onChange={(event) => patch({ metronome: { ...settings.metronome, accentEvery: Number(event.target.value) } })}
            />
          </label>
          <label className="sightline-field">
            <span>Tone — {Math.round(settings.metronome.toneHz)} Hz</span>
            <input
              type="range"
              min={400}
              max={2000}
              step={20}
              value={settings.metronome.toneHz}
              onChange={(event) => patch({ metronome: { ...settings.metronome, toneHz: Number(event.target.value) } })}
            />
          </label>
        </div>
        <label className="sightline-row">
          <input
            type="checkbox"
            checked={settings.metronomeEnabled}
            onChange={(event) => patch({ metronomeEnabled: event.target.checked })}
          />
          <span>Run the metronome while reading</span>
        </label>
        {settings.metronomeEnabled && !metronomeSupported
          ? <p className="sightline-badge sightline-badge--warn">This browser has no audio output available, so the visual beat is used on its own.</p>
          : null}
      </section>

      <section className="sightline-card" aria-labelledby="sightline-speech-heading">
        <h2 id="sightline-speech-heading">Spoken pacing</h2>
        <p className="sightline-note">
          Reads the passage aloud with the browser voice while the highlight follows. Word-level timing comes from the speech engine when
          the browser reports it, and from estimated timings when it does not.
        </p>
        <label className="sightline-row">
          <input
            type="checkbox"
            checked={settings.speechEnabled}
            disabled={!speechSupport.supported}
            onChange={(event) => patch({ speechEnabled: event.target.checked })}
          />
          <span>Speak the passage while reading</span>
        </label>
        <p className="sightline-note" data-testid="sightline-speech-status">{speechSupport.reason}</p>
        <div className="sightline-row">
          {SPEECH_RATE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="sightline-button"
              aria-pressed={Math.abs(settings.pacing.wpm - preset.wpm) < 5}
              onClick={() => onPreset(preset.wpm)}
              disabled={!speechSupport.supported}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- look ---- */

export interface LookPanelProps extends PanelSharedProps {
  readonly theme: ReaderTheme;
  readonly contrast: { readonly ratio: number; readonly level: string; readonly passes: boolean };
  readonly gradientContrast: { readonly ratio: number; readonly passes: boolean; readonly worstStop: string } | null;
}

export function LookPanel({ settings, patch, theme, contrast, gradientContrast }: LookPanelProps) {
  const appearance = settings.appearance;
  return (
    <>
      <section className="sightline-card" aria-labelledby="sightline-theme-heading">
        <h2 id="sightline-theme-heading">Theme — {theme.label}</h2>
        <p className="sightline-note">{theme.detail} Body contrast {contrast.ratio.toFixed(1)}:1 ({contrast.level}).</p>
        <div className="sightline-swatch-grid">
          {READER_THEMES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="sightline-swatch"
              aria-pressed={entry.id === appearance.theme}
              data-testid={`sightline-theme-${entry.id}`}
              style={{ background: entry.background, color: entry.text, borderColor: entry.accent }}
              onClick={() => patch({ appearance: { ...appearance, theme: entry.id } })}
            >
              <strong>{entry.label}</strong>
              <small>{entry.dark ? 'low light' : entry.paper ? 'paper tone' : 'bright'}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-type-heading">
        <h2 id="sightline-type-heading">Type and spacing</h2>
        <label className="sightline-field">
          <span>Reading font</span>
          <select
            value={appearance.font}
            data-testid="sightline-font"
            onChange={(event) => patch({ appearance: { ...appearance, font: event.target.value } })}
          >
            {FONT_CHOICES.map((font) => (
              <option key={font.id} value={font.id}>{font.label}{font.accessibility ? ' — accessibility designed' : ''}</option>
            ))}
          </select>
        </label>
        <p className="sightline-note">
          Every face is served from this site, so the reader works offline and no font request leaves the device.
        </p>
        <div className="sightline-field-grid">
          <label className="sightline-field">
            <span>Size — {Math.round(appearance.fontScale * 100)}%</span>
            <input
              type="range"
              min={0.7}
              max={3}
              step={0.05}
              value={appearance.fontScale}
              onChange={(event) => patch({ appearance: { ...appearance, fontScale: Number(event.target.value) } })}
            />
          </label>
          <label className="sightline-field">
            <span>Line height — {appearance.lineHeight.toFixed(2)}</span>
            <input
              type="range"
              min={1.2}
              max={2.4}
              step={0.05}
              value={appearance.lineHeight}
              onChange={(event) => patch({ appearance: { ...appearance, lineHeight: Number(event.target.value) } })}
            />
          </label>
          <label className="sightline-field">
            <span>Letter spacing — {appearance.letterSpacing.toFixed(3)}em</span>
            <input
              type="range"
              min={0}
              max={0.2}
              step={0.005}
              value={appearance.letterSpacing}
              onChange={(event) => patch({ appearance: { ...appearance, letterSpacing: Number(event.target.value) } })}
            />
          </label>
          <label className="sightline-field">
            <span>Word spacing — {appearance.wordSpacing.toFixed(3)}em</span>
            <input
              type="range"
              min={0}
              max={0.6}
              step={0.01}
              value={appearance.wordSpacing}
              onChange={(event) => patch({ appearance: { ...appearance, wordSpacing: Number(event.target.value) } })}
            />
          </label>
        </div>
        <label className="sightline-row">
          <input
            type="checkbox"
            checked={appearance.dyslexiaSpacing}
            onChange={(event) => patch({ appearance: { ...appearance, dyslexiaSpacing: event.target.checked } })}
          />
          <span>Apply the wide spacing preset used for dyslexic readers</span>
        </label>
        <label className="sightline-row">
          <input
            type="checkbox"
            checked={appearance.highlightCurrentWord}
            onChange={(event) => patch({ appearance: { ...appearance, highlightCurrentWord: event.target.checked } })}
          />
          <span>Highlight the current word in page mode</span>
        </label>
        <label className="sightline-row">
          <input
            type="checkbox"
            checked={appearance.reduceMotion}
            onChange={(event) => patch({ appearance: { ...appearance, reduceMotion: event.target.checked } })}
          />
          <span>Reduce motion in the pacer and page scroll</span>
        </label>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-focal-heading">
        <h2 id="sightline-focal-heading">Focal anchor</h2>
        <p className="sightline-note">
          The anchor is where every word is aligned, so the eye does not travel. The horizontal position is a focus point, not eye
          tracking: it stays where you put it.
        </p>
        <div className="sightline-field-grid">
          <label className="sightline-field">
            <span>Marker</span>
            <select
              value={appearance.focalMarker}
              data-testid="sightline-marker"
              onChange={(event) => patch({ appearance: { ...appearance, focalMarker: event.target.value as typeof appearance.focalMarker } })}
            >
              {FOCAL_MARKERS.map((marker) => <option key={marker.id} value={marker.id}>{marker.label}</option>)}
            </select>
          </label>
          <label className="sightline-field">
            <span>Anchor colour</span>
            <select
              value={appearance.anchorAccent}
              onChange={(event) => patch({ appearance: { ...appearance, anchorAccent: event.target.value as typeof appearance.anchorAccent } })}
            >
              {ANCHOR_ACCENTS.map((accent) => <option key={accent.id} value={accent.id}>{accent.label}</option>)}
            </select>
          </label>
          <label className="sightline-field">
            <span>Anchor position</span>
            <select
              value={Math.round(settings.pacer.anchorFraction * 100)}
              onChange={(event) => patch({ pacer: { ...settings.pacer, anchorFraction: Number(event.target.value) / 100 } })}
            >
              {[40, 45, 50, 55].map((value) => <option key={value} value={value}>{value}% down the reading area</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-treatment-heading">
        <h2 id="sightline-treatment-heading">Export treatments</h2>
        <div className="sightline-field-grid">
          <label className="sightline-field">
            <span>Anchor weighting — level {settings.emphasis.level}</span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={settings.emphasis.level}
              data-testid="sightline-emphasis"
              onChange={(event) => patch({ emphasis: emphasisForLevel(Number(event.target.value) as typeof settings.emphasis.level) })}
            />
          </label>
          <label className="sightline-field">
            <span>Trail palette</span>
            <select
              value={settings.gradientPalette}
              data-testid="sightline-palette"
              onChange={(event) => patch({ gradientPalette: event.target.value })}
            >
              {GRADIENT_PALETTES.map((palette) => <option key={palette.id} value={palette.id}>{palette.label}</option>)}
            </select>
          </label>
          <label className="sightline-field">
            <span>Trail direction</span>
            <select
              value={settings.gradient.direction}
              onChange={(event) => patch({ gradient: { ...settings.gradient, direction: event.target.value as typeof settings.gradient.direction } })}
            >
              <option value="horizontal">Across the line</option>
              <option value="vertical">Down the page</option>
              <option value="word">Inside each word</option>
            </select>
          </label>
          <label className="sightline-field">
            <span>Trail strength — {Math.round(settings.gradient.intensity * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.gradient.intensity}
              onChange={(event) => patch({ gradient: { ...settings.gradient, intensity: Number(event.target.value) } })}
            />
          </label>
        </div>
        <label className="sightline-row">
          <input
            type="checkbox"
            checked={settings.gradient.wash}
            onChange={(event) => patch({ gradient: { ...settings.gradient, wash: event.target.checked } })}
          />
          <span>Soften the trail with a light wash behind the text</span>
        </label>
        {gradientContrast && !gradientContrast.passes
          ? (
            <p className="sightline-badge sightline-badge--warn" data-testid="sightline-gradient-warning">
              The weakest stop of this palette reaches only {gradientContrast.ratio.toFixed(1)}:1 against the reading background
              ({gradientContrast.worstStop}). Choose a darker palette or a lighter theme before exporting.
            </p>
          )
          : null}
      </section>
    </>
  );
}

/* --------------------------------------------------------------- drill ---- */

export interface DrillPanelProps extends PanelSharedProps {
  readonly running: boolean;
  readonly progress: { readonly position: number; readonly items: number; readonly flashMs: number; readonly totalMs: number; readonly clamped: boolean };
  readonly result: { readonly correct: number; readonly total: number; readonly accuracy: number; readonly firstTryAccuracy: number; readonly equivalentWpm: number } | null;
  readonly onStart: () => void;
  readonly onStop: () => void;
}

export function DrillPanel({ settings, patch, running, progress, result, onStart, onStop }: DrillPanelProps) {
  const drill = settings.drill;
  return (
    <section className="sightline-card" aria-labelledby="sightline-drill-heading">
      <h2 id="sightline-drill-heading">Flash drill</h2>
      <p className="sightline-note">
        Words appear for a fraction of a second and disappear. The shortest flash this screen can draw is one animation frame, so
        anything faster than {progress.flashMs} ms is shown at the frame rate instead of being faked.
      </p>
      <div className="sightline-row">
        {DRILL_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="sightline-button"
            title={preset.detail}
            onClick={() => patch({ drill: { ...drill, ...preset.config } })}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="sightline-field-grid">
        <label className="sightline-field">
          <span>Flash time — {drill.flashMs} ms</span>
          <input
            type="range"
            min={17}
            max={600}
            step={1}
            value={drill.flashMs}
            data-testid="sightline-flash-range"
            onChange={(event) => patch({ drill: { ...drill, flashMs: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Words per flash — {drill.wordsPerFlash}</span>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={drill.wordsPerFlash}
            onChange={(event) => patch({ drill: { ...drill, wordsPerFlash: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Gap — {formatMs(drill.gapMs)}</span>
          <input
            type="range"
            min={100}
            max={3000}
            step={50}
            value={drill.gapMs}
            data-testid="sightline-drill-gap"
            onChange={(event) => patch({ drill: { ...drill, gapMs: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Flashes — {drill.flashCount}</span>
          <input
            type="range"
            min={5}
            max={80}
            step={1}
            value={drill.flashCount}
            data-testid="sightline-flash-count"
            onChange={(event) => patch({ drill: { ...drill, flashCount: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Repeat after {drill.repeatAfter} item(s)</span>
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            value={drill.repeatAfter}
            onChange={(event) => patch({ drill: { ...drill, repeatAfter: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Order seed</span>
          <input
            type="number"
            value={drill.seed}
            onChange={(event) => patch({ drill: { ...drill, seed: Number(event.target.value) } })}
          />
        </label>
      </div>
      <label className="sightline-row">
        <input
          type="checkbox"
          checked={drill.preferWeakWords}
          onChange={(event) => patch({ drill: { ...drill, preferWeakWords: event.target.checked } })}
        />
        <span>Draw flashcards from the weakest words in the bank</span>
      </label>
      <div className="sightline-row">
        <button type="button" className="sightline-button sightline-button--primary" onClick={running ? onStop : onStart} data-testid="sightline-drill-run">
          {running ? 'Stop drill' : 'Run drill'}
        </button>
        <span className="sightline-badge" data-testid="sightline-drill-plan">
          {progress.items} flashes · {Math.round(progress.totalMs / 1000)} s
          {progress.clamped ? ' · slowed to the shortest drawable flash' : ''}
        </span>
      </div>
      {result
        ? (
          <p className="sightline-note" data-testid="sightline-drill-result">
            Recognised {result.correct} of {result.total} ({Math.round(result.accuracy * 100)}%), first-try accuracy{' '}
            {Math.round(result.firstTryAccuracy * 100)}%. That is the equivalent of reading at {result.equivalentWpm} words per minute.
          </p>
        )
        : null}
    </section>
  );
}

/* ---------------------------------------------------------------- bank ---- */

export interface BankPanelProps {
  readonly bank: readonly VocabularyEntry[];
  readonly cloze: readonly ClozeItem[];
  readonly now: number;
  readonly weakCount: number;
  readonly onBuildCloze: () => void;
  readonly onReview: (word: string, correct: boolean) => void;
  readonly onRemove: (word: string) => void;
  readonly onCollect: () => void;
  readonly onMarkCurrent: () => void;
  readonly message: string;
}

export function BankPanel({ bank, cloze, now, weakCount, onBuildCloze, onReview, onRemove, onCollect, onMarkCurrent, message }: BankPanelProps) {
  const due = dueEntries(bank, now);
  const retention = retentionRate(bank);
  return (
    <>
      <section className="sightline-card" aria-labelledby="sightline-bank-heading">
        <h2 id="sightline-bank-heading">Word bank — {bank.length} word{bank.length === 1 ? '' : 's'}</h2>
        <p className="sightline-note" data-testid="sightline-bank-summary">
          {bank.length === 0
            ? 'Retention — · nothing in the bank yet.'
            : `Retention ${Math.round(retention * 100)}% · ${due.length} due now · ${weakCount} weak word${weakCount === 1 ? '' : 's'} kept in the vault.`}
        </p>
        <div className="sightline-row">
          <button type="button" className="sightline-button" onClick={onCollect}>Collect weak words from this session</button>
          <button type="button" className="sightline-button" onClick={onMarkCurrent}>Mark the current word as unknown</button>
          <button type="button" className="sightline-button" onClick={onBuildCloze}>Build a cloze drill</button>
        </div>
        {message ? <p className="sightline-note" data-testid="sightline-bank-message">{message}</p> : null}
        <div className="sightline-scroll-x">
          <table className="sightline-table">
            <caption className="sightline-visually-hidden">Vocabulary bank</caption>
            <thead>
              <tr><th scope="col">Word</th><th scope="col">Seen</th><th scope="col">Correct</th><th scope="col">Weight</th><th scope="col">Review</th><th scope="col" /></tr>
            </thead>
            <tbody>
              {bank.length === 0
                ? <tr><td colSpan={6}>The bank is empty. Read for a moment, then collect the words that slowed you down.</td></tr>
                : [...bank]
                  .sort((left, right) => right.weight - left.weight || left.word.localeCompare(right.word))
                  .map((entry) => (
                    <tr key={entry.word} data-testid={`sightline-word-${entry.word}`}>
                      <td>{entry.word}</td>
                      <td>{entry.seen}</td>
                      <td>{entry.correct}</td>
                      <td>{entry.weight}</td>
                      <td>{entry.dueAt <= now ? 'due' : new Date(entry.dueAt).toLocaleDateString()}</td>
                      <td>
                        <button type="button" className="sightline-button" onClick={() => onReview(entry.word, true)}>Knew it</button>{' '}
                        <button type="button" className="sightline-button" onClick={() => onReview(entry.word, false)}>Missed</button>{' '}
                        <button type="button" className="sightline-button sightline-button--ghost" onClick={() => onRemove(entry.word)}>Remove</button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-cloze-heading">
        <h2 id="sightline-cloze-heading">Cloze and vocabulary drill</h2>
        {cloze.length === 0
          ? <p className="sightline-note">Build a cloze drill to test the words in the bank inside their original sentences.</p>
          : (
            <ol className="sightline-list sightline-list--cloze" style={{ counterReset: 'none' }}>
              {cloze.map((item) => (
                <li key={`${item.tokenIndex}-${item.answer}`} data-testid="sightline-cloze-item">
                  <span>{item.text.replace(BLANK, '______')}</span>
                  <span className="sightline-badge">{item.options.length > 0 ? item.options.join(' / ') : 'open answer'}</span>
                </li>
              ))}
            </ol>
          )}
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- data ---- */

export interface DataPanelProps {
  readonly summary: WarehouseSummary | null;
  readonly sessions: readonly StoredSession[];
  readonly velocity: readonly VelocityPoint[];
  readonly streak: number;
  readonly storageNote: string;
  readonly documentProgress: readonly { readonly title: string; readonly tokenIndex: number; readonly tokenCount: number; readonly updatedAt: number }[];
  readonly onRefresh: () => void;
  readonly onClear: () => void;
  readonly onOpenSession: (id: string) => void;
  readonly onResume: (title: string) => void;
}

export function DataPanel({ summary, sessions, velocity, streak, storageNote, documentProgress, onRefresh, onClear, onOpenSession, onResume }: DataPanelProps) {
  return (
    <>
      <section className="sightline-card" aria-labelledby="sightline-warehouse-heading">
        <h2 id="sightline-warehouse-heading">Reading warehouse</h2>
        <p className="sightline-note" data-testid="sightline-storage-note">{storageNote}</p>
        <dl className="sightline-metrics">
          <div className="sightline-metric"><dt>Sessions</dt><dd>{summary?.sessions ?? sessions.length}</dd></div>
          <div className="sightline-metric"><dt>Words</dt><dd>{(summary?.totalWords ?? 0).toLocaleString('en-US')}</dd></div>
          <div className="sightline-metric"><dt>Average</dt><dd>{summary ? `${summary.averageWpm} wpm` : '—'}</dd></div>
          <div className="sightline-metric"><dt>Best</dt><dd>{summary ? `${summary.bestWpm} wpm` : '—'}</dd></div>
          <div className="sightline-metric"><dt>Median</dt><dd>{summary ? `${summary.medianWpm} wpm` : '—'}</dd></div>
          <div className="sightline-metric"><dt>Streak</dt><dd>{streak} day{streak === 1 ? '' : 's'}</dd></div>
        </dl>
        <div className="sightline-row">
          <button type="button" className="sightline-button" onClick={onRefresh}>Refresh</button>
          <button type="button" className="sightline-button sightline-button--ghost" onClick={onClear}>Clear local history</button>
        </div>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-velocity-heading">
        <h2 id="sightline-velocity-heading">Velocity by day</h2>
        {velocity.length === 0
          ? <p className="sightline-note">Finish a reading session and the daily velocity series appears here.</p>
          : (
            <table className="sightline-table">
              <thead><tr><th scope="col">Day</th><th scope="col">Average</th><th scope="col">Sessions</th></tr></thead>
              <tbody>
                {velocity.slice(-10).map((point) => (
                  <tr key={point.at}>
                    <td>{new Date(point.at).toLocaleDateString()}</td>
                    <td>{point.wpm} wpm</td>
                    <td>{point.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>

      <section className="sightline-card" aria-labelledby="sightline-sessions-heading">
        <h2 id="sightline-sessions-heading">Session history</h2>
        <div className="sightline-scroll-x">
          <table className="sightline-table">
            <thead><tr><th scope="col">Document</th><th scope="col">Words</th><th scope="col">Average</th><th scope="col">Peak</th><th scope="col">When</th></tr></thead>
            <tbody>
              {sessions.length === 0
                ? <tr><td colSpan={5}>No sessions recorded yet.</td></tr>
                : [...sessions].reverse().slice(0, 12).map((session) => (
                  <tr key={session.id} data-testid={`sightline-session-${session.id}`}>
                    <td><button type="button" className="sightline-button sightline-button--ghost" onClick={() => onOpenSession(session.id)}>{session.documentTitle}</button></td>
                    <td>{session.tokensRead}</td>
                    <td>{session.averageWpm}</td>
                    <td>{session.peakWpm}</td>
                    <td>{new Date(session.startedAt).toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-resume-heading">
        <h2 id="sightline-resume-heading">Resume points</h2>
        {documentProgress.length === 0
          ? <p className="sightline-note">Reading positions are saved here as you go, so you can pick a document up at the exact word.</p>
          : (
            <ul className="sightline-list">
              {[...documentProgress].sort((left, right) => right.updatedAt - left.updatedAt).map((entry) => (
                <li key={`${entry.title}-${entry.updatedAt}`}>
                  <span>{entry.title}</span>
                  <span className="sightline-badge">
                    word {entry.tokenIndex.toLocaleString('en-US')} of {entry.tokenCount.toLocaleString('en-US')}
                  </span>
                  <button type="button" className="sightline-button" onClick={() => onResume(entry.title)}>Resume</button>
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}

/* -------------------------------------------------------------- export ---- */

export interface ExportPanelProps {
  readonly draft: MetadataDraft;
  readonly onDraft: (patch: Partial<MetadataDraft>) => void;
  readonly onTag: (tag: string) => void;
  readonly onRemoveTag: (tag: string) => void;
  readonly onSuggestTags: () => void;
  readonly onReadingLevel: () => void;
  readonly socialPreview: readonly { readonly property: string; readonly content: string }[];
  readonly structuredPreview: string;
  readonly rows: readonly (ExportDefinition & { readonly available: boolean; readonly note: string })[];
  readonly busyExport: string;
  readonly onDownload: (id: ExportDefinition['id']) => void;
  readonly onImportState: (payload: string) => void;
  readonly onExportState: () => void;
  readonly validation: readonly { readonly field: keyof MetadataDraft; readonly message: string }[];
  readonly fileNamePreview: string;
  readonly message: string;
  readonly model: DocumentModel | undefined;
  readonly metrics: ProseMetrics | undefined;
}

export function ExportPanel({
  draft, onDraft, onTag, onRemoveTag, onSuggestTags, onReadingLevel, socialPreview, structuredPreview,
  rows, busyExport, onDownload, onImportState, onExportState, validation, fileNamePreview, message, metrics,
}: ExportPanelProps) {
  return (
    <>
      <section className="sightline-card" aria-labelledby="sightline-metadata-heading">
        <h2 id="sightline-metadata-heading">Document studio</h2>
        <p className="sightline-note">
          These fields are written into every export that can carry them — the EPUB package, the PDF information dictionary, the Word
          core properties, and the HTML head with its social tags. File name preview: <strong data-testid="sightline-file-preview">{fileNamePreview}</strong>
        </p>
        <div className="sightline-field-grid">
          <label className="sightline-field">
            <span>Title</span>
            <input type="text" value={draft.title} data-testid="sightline-meta-title" onChange={(event) => onDraft({ title: event.target.value })} />
          </label>
          <label className="sightline-field">
            <span>Author</span>
            <input type="text" value={draft.author} data-testid="sightline-meta-author" onChange={(event) => onDraft({ author: event.target.value })} />
          </label>
          <label className="sightline-field">
            <span>Publisher</span>
            <input type="text" value={draft.publisher} onChange={(event) => onDraft({ publisher: event.target.value })} />
          </label>
          <label className="sightline-field">
            <span>Language</span>
            <input type="text" value={draft.language} onChange={(event) => onDraft({ language: event.target.value })} />
          </label>
          <label className="sightline-field">
            <span>Identifier</span>
            <input type="text" value={draft.identifier} placeholder="urn:uuid:…" onChange={(event) => onDraft({ identifier: event.target.value })} />
          </label>
          <label className="sightline-field">
            <span>Rights</span>
            <input type="text" value={draft.rights} onChange={(event) => onDraft({ rights: event.target.value })} />
          </label>
          <label className="sightline-field">
            <span>Created</span>
            <input type="text" value={draft.created} onChange={(event) => onDraft({ created: event.target.value })} />
          </label>
          <label className="sightline-field">
            <span>Modified</span>
            <input type="text" value={draft.modified} onChange={(event) => onDraft({ modified: event.target.value })} />
          </label>
          <label className="sightline-field">
            <span>Reading level</span>
            <input type="text" value={draft.readingLevel} onChange={(event) => onDraft({ readingLevel: event.target.value })} />
          </label>
          <label className="sightline-field">
            <span>Canonical URL</span>
            <input type="url" value={draft.url} placeholder="https://example.org/notes" onChange={(event) => onDraft({ url: event.target.value })} />
          </label>
        </div>
        <label className="sightline-field">
          <span>Description</span>
          <textarea value={draft.description} data-testid="sightline-meta-description" onChange={(event) => onDraft({ description: event.target.value })} />
        </label>
        <div className="sightline-row">
          <button type="button" className="sightline-button" onClick={onReadingLevel} disabled={!metrics}>
            Use measured reading level
          </button>
          <span className="sightline-badge">
            {metrics ? `${metrics.words.toLocaleString('en-US')} words · ${metrics.sentences} sentences` : 'no document'}
          </span>
        </div>
        {validation.length > 0
          ? (
            <ul className="sightline-diag">
              {validation.map((problem) => <li key={problem.field}>{problem.field}: {problem.message}</li>)}
            </ul>
          )
          : null}
      </section>

      <section className="sightline-card" aria-labelledby="sightline-tags-heading">
        <h2 id="sightline-tags-heading">Tags</h2>
        <div className="sightline-row">
          {draft.tags.length === 0 ? <span className="sightline-note">No tags yet.</span> : null}
          {draft.tags.map((tag) => (
            <button key={tag} type="button" className="sightline-badge" onClick={() => onRemoveTag(tag)} title={`Remove ${tag}`}>
              {tag} ×
            </button>
          ))}
        </div>
        <label className="sightline-field">
          <span>Add tags — comma separated</span>
          <input
            type="text"
            data-testid="sightline-tag-input"
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              onTag((event.target as HTMLInputElement).value);
              (event.target as HTMLInputElement).value = '';
            }}
            onBlur={(event) => {
              if (event.target.value.trim().length === 0) return;
              onTag(event.target.value);
              event.target.value = '';
            }}
          />
        </label>
        <button type="button" className="sightline-button" onClick={onSuggestTags} disabled={!metrics}>Suggest tags from the prose</button>
        {message ? <p className="sightline-note" data-testid="sightline-export-message">{message}</p> : null}
      </section>

      <section className="sightline-card" aria-labelledby="sightline-social-heading">
        <h2 id="sightline-social-heading">Social tags and structured data</h2>
        <table className="sightline-table">
          <thead><tr><th scope="col">Tag</th><th scope="col">Value</th></tr></thead>
          <tbody>
            {socialPreview.map((tag) => (
              <tr key={tag.property}><td>{tag.property}</td><td>{tag.content}</td></tr>
            ))}
          </tbody>
        </table>
        <details>
          <summary>Structured data preview</summary>
          <pre className="sightline-note" style={{ whiteSpace: 'pre-wrap' }}>{structuredPreview}</pre>
        </details>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-export-rows">
        <h2 id="sightline-export-rows">Exports</h2>
        {rows.map((row) => (
          <div className="sightline-export-row" key={row.id}>
            <strong>{row.label}</strong>
            <small>{row.detail}</small>
            <small data-testid={`sightline-note-${row.id}`}>{row.note}</small>
            <div className="sightline-row">
              <button
                type="button"
                className="sightline-button sightline-button--primary"
                data-testid={`sightline-export-${row.id}`}
                disabled={!row.available || busyExport === row.id}
                onClick={() => onDownload(row.id)}
              >
                {busyExport === row.id ? 'Writing…' : `Download ${row.extension.toUpperCase()}`}
              </button>
              <span className="sightline-badge">{row.mediaType}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="sightline-card" aria-labelledby="sightline-state-heading">
        <h2 id="sightline-state-heading">Reader state backup</h2>
        <p className="sightline-note">
          Settings, bookmarks, highlights, notes, and positions are stored in this browser. Export them to move to another device, or
          paste a backup to restore.
        </p>
        <div className="sightline-row">
          <button type="button" className="sightline-button" onClick={onExportState} data-testid="sightline-state-export">Download reader state</button>
        </div>
        <label className="sightline-field">
          <span>Restore from a backup</span>
          <textarea data-testid="sightline-state-import" placeholder='{"version":1,…}' onBlur={(event) => onImportState(event.target.value)} />
        </label>
      </section>
    </>
  );
}

export type { HighlightColor, MarginNote };
