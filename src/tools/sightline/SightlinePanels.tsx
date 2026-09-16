/**
 * Control panels for the reading workspace.
 *
 * Each panel is a plain function of the settings object plus one callback, so
 * the reader, the exports, and the tests all read the same values. Nothing here
 * keeps its own copy of a setting: a control writes through `patch`, the
 * workspace persists the result, and the engine that consumes the field reads
 * it back from the same place.
 */

import {
  ANCHOR_ACCENTS,
  FOCAL_MARKERS,
  FONT_CHOICES,
  READER_THEMES,
  accessibleThemes,
  themeById,
  themeContrast,
  type AnchorAccent,
  type ReaderAppearance,
} from './palette-engine';
import { GRADIENT_PALETTES, checkGradientContrast, paletteById, palettesForBackground } from './gradient-engine';
import { EMPHASIS_LEVELS, emphasisForLevel, type EmphasisLevel } from './typography-engine';
import { RAMP_PRESETS, WPM_STEPS, rateNote, type RampConfig } from './pacing-engine';
import { MAX_BPM, METRONOME_PRESETS, MIN_BPM } from './metronome-engine';
import { DRILL_PRESETS, MIN_FLASH_MS, flashEquivalentWpm } from './drill-engine';
import { SPEECH_RATE_PRESETS, type SpeechSupport } from './speech-engine';
import { PACER_SHAPES } from './pacer-engine';
import { dueEntries, retentionRate, type ClozeItem, type VocabularyEntry } from './vocabulary-engine';
import type { SessionSummary } from './session-engine';
import type { StoredSession, VelocityPoint, WarehouseSummary } from './analytics-engine';
import type { ExportDefinition, ExportId } from './export-plan';
import { useState } from 'react';
import type { DocumentModel } from './sightline-types';
import {
  socialTags,
  structuredDataScript,
  validateDraft,
  type MetadataDraft,
} from './metadata-studio';
import type { Bookmark, DocumentProgress, HighlightColor, ReaderSettings, SightlineState } from './sightline-store';

export interface PanelSharedProps {
  readonly settings: ReaderSettings;
  readonly patch: (values: Partial<ReaderSettings>) => void;
  readonly disabled: boolean;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const ms = (value: number) => `${value.toFixed(0)} ms`;

/* ------------------------------------------------------------------ pace -- */

export interface PacePanelProps extends PanelSharedProps {
  readonly onPreset: (wpm: number) => void;
  readonly onRamp: (ramp: RampConfig | null) => void;
  readonly metronomeSupported: boolean;
  readonly speechSupport: SpeechSupport;
  readonly voices: readonly string[];
}

export function PacePanel({ settings, patch, disabled, onPreset, onRamp, metronomeSupported, speechSupport, voices }: PacePanelProps) {
  const pacing = settings.pacing;
  const ramp = pacing.ramp;
  return (
    <>
      <section className="sightline-card" aria-labelledby="sightline-rate-heading">
        <h2 id="sightline-rate-heading">Reading rate</h2>
        <label className="sightline-field">
          <span>
            Rate — {pacing.wpm} words per minute
          </span>
          <input
            type="range"
            min={40}
            max={1600}
            step={5}
            value={pacing.wpm}
            disabled={disabled}
            data-testid="sightline-wpm-range"
            onChange={(event) => patch({ pacing: { ...pacing, ramp: null, wpm: Number(event.target.value) } })}
          />
        </label>
        <div className="sightline-row sightline-row--wrap">
          {WPM_STEPS.map((step) => (
            <button
              key={step}
              type="button"
              className={`sightline-chip${pacing.wpm === step ? ' sightline-chip--on' : ''}`}
              disabled={disabled}
              title={`${step} words per minute`}
              data-testid={`sightline-wpm-${step}`}
              onClick={() => onPreset(step)}
            >
              {step}
            </button>
          ))}
        </div>
        <p className="sightline-note" data-testid="sightline-rate-note">
          {rateNote(pacing.wpm)}
        </p>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-breaks-heading">
        <h2 id="sightline-breaks-heading">Boundary pauses</h2>
        <label className="sightline-row">
          <input
            type="checkbox"
            checked={pacing.respectBreaks}
            disabled={disabled}
            data-testid="sightline-respect-breaks"
            onChange={(event) => patch({ pacing: { ...pacing, respectBreaks: event.target.checked } })}
          />
          <span>Hold at punctuation and paragraph ends</span>
        </label>
        {([
          ['periodMultiplier', 'After a full stop', 1, 5],
          ['clauseMultiplier', 'After a comma, semicolon, or dash', 1, 4],
          ['paragraphMultiplier', 'At the end of a paragraph', 1, 5],
          ['chapterMultiplier', 'At the end of a chapter', 1, 6],
        ] as const).map(([field, label, min, max]) => (
          <label key={field} className="sightline-field">
            <span>
              {label} — {pacing[field].toFixed(1)}x
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={0.1}
              value={pacing[field]}
              disabled={disabled || !pacing.respectBreaks}
              data-testid={`sightline-${field}`}
              onChange={(event) => patch({ pacing: { ...pacing, [field]: Number(event.target.value) } })}
            />
          </label>
        ))}
        <label className="sightline-field">
          <span>Time given to each word</span>
          <select
            value={pacing.compensator}
            disabled={disabled}
            data-testid="sightline-compensator"
            onChange={(event) => patch({ pacing: { ...pacing, compensator: event.target.value as typeof pacing.compensator } })}
          >
            <option value="none">Same time for every word</option>
            <option value="length">Longer words take longer</option>
            <option value="syllable">Longer words and more syllables take longer</option>
          </select>
        </label>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-ramp-heading">
        <h2 id="sightline-ramp-heading">Velocity ramp trainer</h2>
        <p className="sightline-note">
          A ramp starts below your chosen rate and lifts it in steps, so the reading stays fluent while the pace climbs.
        </p>
        <div className="sightline-row sightline-row--wrap">
          {RAMP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`sightline-chip${ramp?.startWpm === preset.config.startWpm && ramp?.ceilingWpm === preset.config.ceilingWpm ? ' sightline-chip--on' : ''}`}
              disabled={disabled}
              title={preset.detail}
              data-testid={`sightline-ramp-${preset.id}`}
              onClick={() => onRamp(preset.config)}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            className={`sightline-chip${ramp ? '' : ' sightline-chip--on'}`}
            data-testid="sightline-ramp-off"
            onClick={() => onRamp(null)}
          >
            Steady rate
          </button>
        </div>
        <p className="sightline-note" data-testid="sightline-ramp-status">
          {ramp
            ? `Ramping ${ramp.startWpm} → ${ramp.ceilingWpm} wpm, adding ${ramp.stepWpm} wpm every ${ramp.everyTokens} words.`
            : 'No ramp is running; every word is shown at the chosen rate.'}
        </p>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-chunk-heading">
        <h2 id="sightline-chunk-heading">Chunked stream</h2>
        <label className="sightline-field">
          <span>Words per frame — {settings.chunk.wordsPerChunk}</span>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={settings.chunk.wordsPerChunk}
            disabled={disabled}
            data-testid="sightline-words-per-chunk"
            onChange={(event) => patch({ chunk: { ...settings.chunk, wordsPerChunk: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Where a frame may break</span>
          <select
            value={settings.chunk.splitPolicy}
            disabled={disabled}
            data-testid="sightline-split-policy"
            onChange={(event) => patch({ chunk: { ...settings.chunk, splitPolicy: event.target.value as typeof settings.chunk.splitPolicy } })}
          >
            <option value="punctuation">At punctuation first, then at width</option>
            <option value="balanced">Evenly, keeping phrases together</option>
            <option value="fixed">Strictly every N words</option>
          </select>
        </label>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-metronome-heading">
        <h2 id="sightline-metronome-heading">Subvocalization metronome</h2>
        <p className="sightline-note">
          A steady click gives the inner voice something to follow. It discourages silent pronunciation rather than measuring it.
        </p>
        <button
          type="button"
          className={`sightline-chip${settings.metronomeEnabled ? ' sightline-chip--on' : ''}`}
          disabled={disabled || !metronomeSupported}
          aria-pressed={settings.metronomeEnabled}
          data-testid="sightline-metronome-enable"
          onClick={() => patch({ metronomeEnabled: !settings.metronomeEnabled })}
        >
          Subvocalization metronome {settings.metronomeEnabled ? 'on' : 'off'}
        </button>
        <p className="sightline-note">
          {metronomeSupported
            ? 'The click runs while you read; the beat marker shows the same pulse without sound.'
            : 'This browser did not allow an audio context, so the click cannot run here. The beat marker still can.'}
        </p>
        <label className="sightline-field">
          <span>Tempo — {settings.metronome.bpm} BPM, {MIN_BPM}–{MAX_BPM} available</span>
          <input
            type="range"
            min={MIN_BPM}
            max={MAX_BPM}
            step={2}
            value={settings.metronome.bpm}
            disabled={disabled}
            data-testid="sightline-metronome-bpm"
            onChange={(event) => patch({ metronome: { ...settings.metronome, bpm: Number(event.target.value) } })}
          />
        </label>
        <div className="sightline-row sightline-row--wrap">
          {METRONOME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`sightline-chip${settings.metronome.bpm === preset.bpm ? ' sightline-chip--on' : ''}`}
              disabled={disabled || !metronomeSupported}
              title={preset.detail}
              data-testid={`sightline-metronome-${preset.id}`}
              onClick={() => patch({ metronome: { ...settings.metronome, bpm: preset.bpm } })}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label className="sightline-field">
          <span>Signal</span>
          <select
            value={settings.metronome.channel}
            disabled={disabled || !metronomeSupported}
            data-testid="sightline-metronome-channel"
            onChange={(event) =>
              patch({ metronome: { ...settings.metronome, channel: event.target.value as typeof settings.metronome.channel } })
            }
          >
            <option value="audio">Click only</option>
            <option value="visual">Beat marker only</option>
            <option value="both">Click and beat marker</option>
          </select>
        </label>
        <label className="sightline-field">
          <span>Accent every {settings.metronome.accentEvery} beats</span>
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={settings.metronome.accentEvery}
            disabled={disabled}
            onChange={(event) => patch({ metronome: { ...settings.metronome, accentEvery: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Volume — {percent(settings.metronome.volume)}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.metronome.volume}
            disabled={disabled}
            onChange={(event) => patch({ metronome: { ...settings.metronome, volume: Number(event.target.value) } })}
          />
        </label>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-speech-heading">
        <h2 id="sightline-speech-heading">Synchronized speech</h2>
        <p className="sightline-note" data-testid="sightline-speech-status">
          {speechSupport.reason}
        </p>
        <label className="sightline-row">
          <input
            type="checkbox"
            checked={settings.speechEnabled}
            disabled={disabled || !speechSupport.supported}
            data-testid="sightline-speech-enable"
            onChange={(event) => patch({ speechEnabled: event.target.checked })}
          />
          <span>Let the system voice drive the highlight</span>
        </label>
        <div className="sightline-row sightline-row--wrap">
          {SPEECH_RATE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`sightline-chip${pacing.wpm === preset.wpm ? ' sightline-chip--on' : ''}`}
              disabled={disabled || !speechSupport.supported}
              data-testid={`sightline-speech-${preset.id}`}
              onClick={() => patch({ pacing: { ...pacing, wpm: preset.wpm } })}
            >
              {preset.label}, {preset.wpm} words per minute
            </button>
          ))}
        </div>
        {settings.speechEnabled ? (
          <label className="sightline-field">
            <span>{voices.length === 0 ? 'Voice — the browser exposed no voice list, so the default is used' : 'Voice'}</span>
            <select
              value={settings.ttsVoiceName}
              disabled={voices.length === 0}
              data-testid="sightline-voice"
              onChange={(event) => patch({ ttsVoiceName: event.target.value })}
            >
              <option value="">System default</option>
              {voices.map((voice) => (
                <option key={voice} value={voice}>
                  {voice}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      <section className="sightline-card" aria-labelledby="sightline-pacer-heading">
        <h2 id="sightline-pacer-heading">Page pacer</h2>
        <p className="sightline-note">
          The pacer glides between words and keeps the paced line at a fixed height on the page, so the eye is not chasing
          text that scrolls past it.
        </p>
        <label className="sightline-field">
          <span>Pacer shape</span>
          <select
            value={settings.pacer.shape}
            disabled={disabled}
            data-testid="sightline-pacer-shape"
            onChange={(event) => patch({ pacer: { ...settings.pacer, shape: event.target.value as typeof settings.pacer.shape } })}
          >
            {PACER_SHAPES.map((shape) => (
              <option key={shape.id} value={shape.id}>
                {shape.label} — {shape.detail}
              </option>
            ))}
          </select>
        </label>
        <label className="sightline-field">
          <span>Hold the paced line {percent(settings.pacer.anchorFraction)} down the viewport</span>
          <input
            type="range"
            min={0.2}
            max={0.8}
            step={0.01}
            value={settings.pacer.anchorFraction}
            disabled={disabled}
            data-testid="sightline-pacer-anchor"
            onChange={(event) => patch({ pacer: { ...settings.pacer, anchorFraction: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Glide between words — {(settings.pacer.glideSeconds * 1000).toFixed(0)} ms</span>
          <input
            type="range"
            min={0}
            max={0.3}
            step={0.01}
            value={settings.pacer.glideSeconds}
            disabled={disabled || settings.appearance.reduceMotion}
            data-testid="sightline-pacer-glide"
            onChange={(event) => patch({ pacer: { ...settings.pacer, glideSeconds: Number(event.target.value) } })}
          />
        </label>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ look -- */

export interface LookPanelProps extends PanelSharedProps {
  readonly stageWidth: number;
  readonly eccentricityDegrees: number;
  readonly advisory: string;
}

export function LookPanel({ settings, patch, disabled, stageWidth, eccentricityDegrees, advisory }: LookPanelProps) {
  const appearance = settings.appearance;
  const theme = themeById(appearance.theme);
  const verdict = themeContrast(theme);
  const gradient = checkGradientContrast(paletteById(settings.gradientPalette), theme.background);
  const clearPalettes = palettesForBackground(theme.background);
  const accent = ANCHOR_ACCENTS.find((entry) => entry.id === appearance.anchorAccent) ?? ANCHOR_ACCENTS[0]!;
  return (
    <>
      <section className="sightline-card" aria-labelledby="sightline-theme-heading">
        <h2 id="sightline-theme-heading">Theme</h2>
        <p className="sightline-note" data-testid="sightline-theme-contrast">
          {theme.label}: body text at {verdict.ratio}:1, judged {verdict.level}. {accessibleThemes().length} of{' '}
          {READER_THEMES.length} themes clear 4.5:1 for body text; each swatch carries its own measured ratio.
        </p>
        <div className="sightline-swatches" role="group" aria-label="Reading theme">
          {READER_THEMES.map((candidate) => {
            const candidateVerdict = themeContrast(candidate);
            return (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={candidate.id === appearance.theme}
                className={`sightline-swatch${candidate.id === appearance.theme ? ' sightline-swatch--on' : ''}`}
                style={{ background: candidate.background, color: candidate.text, borderColor: candidate.accent }}
                title={`${candidate.label}. ${candidate.detail} Measured contrast ${candidateVerdict.ratio}:1 (${candidateVerdict.level}).`}
                disabled={disabled}
                data-testid={`sightline-theme-${candidate.id}`}
                onClick={() => patch({ appearance: { ...appearance, theme: candidate.id } })}
              >
                <span aria-hidden="true">Aa</span>
                <small>{candidate.label}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-font-heading">
        <h2 id="sightline-font-heading">Typeface</h2>
        <label className="sightline-field">
          <span>Family</span>
          <select
            value={appearance.font}
            disabled={disabled}
            data-testid="sightline-font"
            onChange={(event) => patch({ appearance: { ...appearance, font: event.target.value } })}
          >
            {FONT_CHOICES.map((font) => (
              <option key={font.id} value={font.id}>
                {font.label}
                {font.accessibility ? ' — legibility-first' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="sightline-note">{FONT_CHOICES.find((font) => font.id === appearance.font)?.detail}</p>
        <label className="sightline-field">
          <span>Size — {percent(appearance.fontScale)} of the base size</span>
          <input
            type="range"
            min={0.8}
            max={2.4}
            step={0.05}
            value={appearance.fontScale}
            disabled={disabled}
            data-testid="sightline-font-scale"
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
            disabled={disabled}
            data-testid="sightline-line-height"
            onChange={(event) => patch({ appearance: { ...appearance, lineHeight: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Letter spacing — {appearance.letterSpacing.toFixed(3)} em</span>
          <input
            type="range"
            min={0}
            max={0.12}
            step={0.005}
            value={appearance.letterSpacing}
            disabled={disabled}
            data-testid="sightline-letter-spacing"
            onChange={(event) => patch({ appearance: { ...appearance, letterSpacing: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Word spacing — {appearance.wordSpacing.toFixed(3)} em</span>
          <input
            type="range"
            min={0}
            max={0.4}
            step={0.01}
            value={appearance.wordSpacing}
            disabled={disabled}
            data-testid="sightline-word-spacing"
            onChange={(event) => patch({ appearance: { ...appearance, wordSpacing: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-row">
          <input
            type="checkbox"
            checked={appearance.dyslexiaSpacing}
            disabled={disabled}
            data-testid="sightline-dyslexia-spacing"
            onChange={(event) => patch({ appearance: { ...appearance, dyslexiaSpacing: event.target.checked } })}
          />
          <span>Use the wide-tracked spacing recommended for dyslexic readers</span>
        </label>
        <label className="sightline-row">
          <input
            type="checkbox"
            checked={appearance.reduceMotion}
            data-testid="sightline-reduce-motion"
            onChange={(event) => patch({ appearance: { ...appearance, reduceMotion: event.target.checked } })}
          />
          <span>Reduce motion: no gliding pacer and no fading edges</span>
        </label>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-anchor-heading">
        <h2 id="sightline-anchor-heading">Focal anchor</h2>
        <label className="sightline-field">
          <span>Marker</span>
          <select
            value={appearance.focalMarker}
            disabled={disabled}
            data-testid="sightline-marker"
            onChange={(event) =>
              patch({ appearance: { ...appearance, focalMarker: event.target.value as ReaderAppearance['focalMarker'] } })
            }
          >
            {FOCAL_MARKERS.map((marker) => (
              <option key={marker.id} value={marker.id}>
                {marker.label} — {marker.detail}
              </option>
            ))}
          </select>
        </label>
        <label className="sightline-field">
          <span>Anchor colour — {accent.label}</span>
          <select
            value={appearance.anchorAccent}
            disabled={disabled}
            data-testid="sightline-accent"
            onChange={(event) => patch({ appearance: { ...appearance, anchorAccent: event.target.value as AnchorAccent } })}
          >
            {ANCHOR_ACCENTS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="sightline-row">
          <input
            type="checkbox"
            checked={appearance.highlightCurrentWord}
            disabled={disabled}
            data-testid="sightline-current-word"
            onChange={(event) => patch({ appearance: { ...appearance, highlightCurrentWord: event.target.checked } })}
          />
          <span>Mark the word being read in page mode</span>
        </label>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-layout-heading">
        <h2 id="sightline-layout-heading">Viewport bounding</h2>
        <p className="sightline-note" data-testid="sightline-eccentricity">
          The reading stage measures {Math.round(stageWidth)} pixels wide on this screen. The outermost column of the peripheral
          view sits about {Math.round(eccentricityDegrees)} degrees from the centre of gaze. {advisory}
        </p>
        <label className="sightline-field">
          <span>Columns — {settings.peripheral.columns}</span>
          <input
            type="range"
            min={2}
            max={5}
            step={1}
            value={settings.peripheral.columns}
            disabled={disabled}
            data-testid="sightline-columns"
            onChange={(event) => patch({ peripheral: { ...settings.peripheral, columns: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Measure — {settings.peripheral.columnChars} characters</span>
          <input
            type="range"
            min={12}
            max={42}
            step={1}
            value={settings.peripheral.columnChars}
            disabled={disabled}
            data-testid="sightline-column-chars"
            onChange={(event) => patch({ peripheral: { ...settings.peripheral, columnChars: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Words per column — {settings.peripheral.wordsPerColumn}</span>
          <input
            type="range"
            min={4}
            max={40}
            step={1}
            value={settings.peripheral.wordsPerColumn}
            disabled={disabled}
            data-testid="sightline-column-words"
            onChange={(event) => patch({ peripheral: { ...settings.peripheral, wordsPerColumn: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Field spread — {percent(settings.peripheral.spread)}</span>
          <input
            type="range"
            min={0.4}
            max={1}
            step={0.05}
            value={settings.peripheral.spread}
            disabled={disabled}
            data-testid="sightline-column-spread"
            onChange={(event) => patch({ peripheral: { ...settings.peripheral, spread: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-row">
          <input
            type="checkbox"
            checked={settings.peripheral.edgeFade}
            disabled={disabled}
            onChange={(event) => patch({ peripheral: { ...settings.peripheral, edgeFade: event.target.checked } })}
          />
          <span>Fade the outer columns so the eye is not pulled to the edges</span>
        </label>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-treatment-heading">
        <h2 id="sightline-treatment-heading">Emphasis typography</h2>
        <label className="sightline-field">
          <span>Emphasis level — {settings.emphasis.level} of 5</span>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={settings.emphasis.level}
            disabled={disabled}
            data-testid="sightline-emphasis"
            onChange={(event) =>
              patch({
                emphasis: emphasisForLevel(Number(event.target.value) as EmphasisLevel),
              })
            }
          />
        </label>
        <p className="sightline-note">
          {EMPHASIS_LEVELS.find((entry) => entry.level === settings.emphasis.level)?.detail} Heavier levels bold more letters,
          keep at most {settings.emphasis.maxLetters} of them, and lighten the rest of the word.
        </p>
        <label className="sightline-field">
          <span>Trail gradient palette</span>
          <select
            value={settings.gradientPalette}
            disabled={disabled}
            data-testid="sightline-palette"
            onChange={(event) => patch({ gradientPalette: event.target.value })}
          >
            {GRADIENT_PALETTES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <p
          className={`sightline-note${gradient.passes ? '' : ' sightline-note--warning'}`}
          data-testid="sightline-gradient-contrast"
        >
          {paletteById(settings.gradientPalette).label} on {theme.label}: weakest stop {gradient.ratio.toFixed(2)}:1 at{' '}
          {gradient.worstStop}
          {gradient.passes ? ' — keeps the 4.5:1 floor.' : ' — below the 4.5:1 floor.'} {clearPalettes.length} of{' '}
          {GRADIENT_PALETTES.length} palettes clear that floor on this background.
        </p>
        <label className="sightline-field">
          <span>Gradient direction</span>
          <select
            value={settings.gradient.direction}
            disabled={disabled}
            data-testid="sightline-gradient-direction"
            onChange={(event) =>
              patch({ gradient: { ...settings.gradient, direction: event.target.value as typeof settings.gradient.direction } })
            }
          >
            <option value="horizontal">Left to right across each line</option>
            <option value="vertical">Top to bottom down the page</option>
            <option value="word">Within each word</option>
          </select>
        </label>
        <label className="sightline-field">
          <span>Gradient strength — {settings.gradient.intensity.toFixed(2)}</span>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={settings.gradient.intensity}
            disabled={disabled}
            data-testid="sightline-gradient-intensity"
            onChange={(event) => patch({ gradient: { ...settings.gradient, intensity: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-row">
          <input
            type="checkbox"
            checked={settings.gradient.wash}
            disabled={disabled}
            onChange={(event) => patch({ gradient: { ...settings.gradient, wash: event.target.checked } })}
          />
          <span>Wash each paragraph with a pale version of its palette</span>
        </label>
      </section>
    </>
  );
}

/* ----------------------------------------------------------------- drill -- */

export interface DrillPanelProps extends PanelSharedProps {
  readonly weakWordCount: number;
  readonly summary: SessionSummary | null;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly running: boolean;
  readonly plan: { readonly flashes: number; readonly items: number; readonly totalMs: number; readonly clamped: boolean } | null;
}

export function DrillPanel({ settings, patch, disabled, weakWordCount, summary, onStart, onStop, running, plan }: DrillPanelProps) {
  const drill = settings.drill;
  return (
    <>
      <section className="sightline-card" aria-labelledby="sightline-drill-heading">
        <h2 id="sightline-drill-heading">Tachistoscopic drills</h2>
        <p className="sightline-note">
          Each flash is shown for a fixed time, then the reader marks whether they recognised it. A drill reports the rate its
          exposure time is equivalent to rather than a comprehension score.
        </p>
        <div className="sightline-row sightline-row--wrap">
          {DRILL_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="sightline-chip"
              disabled={disabled}
              title={preset.detail}
              data-testid={`sightline-drill-preset-${preset.id}`}
              onClick={() => patch({ drill: { ...drill, ...preset.config } })}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label className="sightline-field">
          <span>
            Exposure — {ms(drill.flashMs)} ({flashEquivalentWpm(drill.flashMs, drill.wordsPerFlash).toLocaleString('en-US')} wpm
            equivalent)
          </span>
          <input
            type="range"
            min={MIN_FLASH_MS}
            max={600}
            step={1}
            value={drill.flashMs}
            disabled={disabled}
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
            disabled={disabled}
            data-testid="sightline-words-per-flash"
            onChange={(event) => patch({ drill: { ...drill, wordsPerFlash: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Gap between flashes — {ms(drill.gapMs)}</span>
          <input
            type="range"
            min={0}
            max={4000}
            step={50}
            value={drill.gapMs}
            disabled={disabled}
            data-testid="sightline-drill-gap"
            onChange={(event) => patch({ drill: { ...drill, gapMs: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Flashes in this run — {drill.flashCount}</span>
          <input
            type="range"
            min={5}
            max={60}
            step={5}
            value={drill.flashCount}
            disabled={disabled}
            data-testid="sightline-flash-count"
            onChange={(event) => patch({ drill: { ...drill, flashCount: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-field">
          <span>Repeat an item after {drill.repeatAfter === 0 ? 'no other flashes' : `${drill.repeatAfter} others`}</span>
          <input
            type="range"
            min={0}
            max={12}
            step={1}
            value={drill.repeatAfter}
            disabled={disabled}
            data-testid="sightline-flash-repeat"
            onChange={(event) => patch({ drill: { ...drill, repeatAfter: Number(event.target.value) } })}
          />
        </label>
        <label className="sightline-row">
          <input
            type="checkbox"
            checked={drill.preferWeakWords}
            disabled={disabled}
            data-testid="sightline-flash-weak"
            onChange={(event) => patch({ drill: { ...drill, preferWeakWords: event.target.checked } })}
          />
          <span>Draw from the word bank first ({weakWordCount} words collected)</span>
        </label>
        <div className="sightline-row">
          <button
            type="button"
            className="sightline-button sightline-button--primary"
            disabled={disabled || running}
            data-testid="sightline-drill-run"
            onClick={onStart}
          >
            Run the drill
          </button>
          <button type="button" className="sightline-button" disabled={!running} data-testid="sightline-drill-stop" onClick={onStop}>
            Stop
          </button>
        </div>
        {plan ? (
          <p className="sightline-note" data-testid="sightline-drill-plan">
            {plan.items} distinct items in {plan.flashes} flashes, about {(plan.totalMs / 1000).toFixed(1)} seconds
            {plan.clamped ? ', with the exposure raised to the shortest interval this browser can show' : ''}.
          </p>
        ) : null}
      </section>

      <section className="sightline-card" aria-labelledby="sightline-drill-result-heading">
        <h2 id="sightline-drill-result-heading">Last drill</h2>
        {summary ? (
          <dl className="sightline-facts" data-testid="sightline-drill-result">
            <div>
              <dt>Words flashed</dt>
              <dd>{summary.tokensRead.toLocaleString('en-US')}</dd>
            </div>
            <div>
              <dt>Rate equivalent</dt>
              <dd>{summary.averageWpm.toLocaleString('en-US')} words per minute</dd>
            </div>
            <div>
              <dt>Time in the drill</dt>
              <dd>{(summary.elapsedMs / 1000).toFixed(1)} s</dd>
            </div>
          </dl>
        ) : (
          <p className="sightline-note">No drill has been scored in this browser session yet.</p>
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ bank -- */

export interface BankPanelProps {
  readonly bank: readonly VocabularyEntry[];
  readonly cloze: readonly ClozeItem[];
  readonly now: number;
  /** Short line shown above the table, such as the last word that was marked. */
  readonly message: string;
  readonly onCollect: () => void;
  readonly onMarkCurrent: () => void;
  readonly onBuildCloze: () => void;
  readonly onRemove: (word: string) => void;
  readonly onReview: (word: string, correct: boolean) => void;
}

const reviewLabel = (entry: VocabularyEntry, now: number): string => {
  const days = Math.round((entry.dueAt - now) / 86_400_000);
  if (days <= 0) return 'due now';
  return `in ${days} day${days === 1 ? '' : 's'}`;
};

export function BankPanel({ bank, cloze, now, message, onCollect, onMarkCurrent, onBuildCloze, onRemove, onReview }: BankPanelProps) {
  const due = dueEntries(bank, now);
  return (
    <>
      <section className="sightline-card" aria-labelledby="sightline-bank-heading">
        <h2 id="sightline-bank-heading">Word bank</h2>
        <p className="sightline-note" data-testid="sightline-bank-summary">
          {bank.length} words · {due.length} due now · Retention {retentionRate(bank)}% over{' '}
          {bank.reduce((total, entry) => total + entry.seen, 0)} encounters.
        </p>
        <p className="sightline-note" data-testid="sightline-bank-message">
          {message || 'Words are collected from your own reading; none are predefined.'}
        </p>
        <div className="sightline-row sightline-row--wrap">
          <button type="button" className="sightline-button" data-testid="sightline-bank-collect" onClick={onCollect}>
            Collect the slow words from this session
          </button>
          <button type="button" className="sightline-button" data-testid="sightline-bank-mark" onClick={onMarkCurrent}>
            Mark the current word as unknown
          </button>
          <button type="button" className="sightline-button" data-testid="sightline-bank-cloze" onClick={onBuildCloze}>
            Build a cloze drill
          </button>
        </div>
        {bank.length === 0 ? (
          <p className="sightline-note">
            Nothing collected yet. The bank fills from words that took you longer than your own median, and any word can be added
            by hand.
          </p>
        ) : (
          <div className="sightline-scroll-x">
            <table className="sightline-table" data-testid="sightline-bank-table">
              <caption className="sightline-visually-hidden">Words collected from reading sessions</caption>
              <thead>
                <tr>
                  <th scope="col">Word</th>
                  <th scope="col">Seen</th>
                  <th scope="col">Mean time</th>
                  <th scope="col">Weight</th>
                  <th scope="col">Next review</th>
                  <th scope="col">Review</th>
                  <th scope="col">Remove</th>
                </tr>
              </thead>
              <tbody>
                {bank.map((entry) => (
                  <tr key={entry.word}>
                    <th scope="row">{entry.word}</th>
                    <td>{entry.seen}</td>
                    <td>{ms(entry.averageMs)}</td>
                    <td>{entry.weight}</td>
                    <td>{reviewLabel(entry, now)}</td>
                    <td>
                      <button type="button" className="sightline-button sightline-button--small" onClick={() => onReview(entry.word, false)}>
                        Again
                      </button>{' '}
                      <button type="button" className="sightline-button sightline-button--small" onClick={() => onReview(entry.word, true)}>
                        Knew it
                      </button>
                    </td>
                    <td>
                      <button type="button" className="sightline-button sightline-button--small" onClick={() => onRemove(entry.word)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {cloze.length > 0 ? (
        <section className="sightline-card" aria-labelledby="sightline-cloze-heading">
          <h2 id="sightline-cloze-heading">Cloze passage</h2>
          <p className="sightline-note">
            Each blank is a bank word inside the sentence where you met it, with three plausible alternatives from the same
            document.
          </p>
          <ol className="sightline-cloze-list" data-testid="sightline-cloze-list">
            {cloze.map((item, index) => (
              <li key={`${item.answer}-${item.tokenIndex}-${index}`} data-testid="sightline-cloze-item">
                <p>{item.text}</p>
                <p className="sightline-note">
                  Choices: {item.options.join(' · ')} (answer recorded at position {item.answerIndex + 1})
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ data -- */

export interface DataPanelProps {
  readonly summary: WarehouseSummary;
  readonly sessions: readonly StoredSession[];
  readonly velocity: readonly VelocityPoint[];
  readonly vocabularySize: number;
  readonly storageNote: string;
  readonly onClear: () => void;
}

export function DataPanel({ summary, sessions, velocity, vocabularySize, storageNote, onClear }: DataPanelProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  return (
    <>
      <section className="sightline-card" aria-labelledby="sightline-warehouse-heading">
        <h2 id="sightline-warehouse-heading">Local reading history</h2>
        <p className="sightline-note" data-testid="sightline-storage-note">
          {storageNote}
        </p>
        <dl className="sightline-facts" data-testid="sightline-warehouse-summary">
          <div>
            <dt>Sessions</dt>
            <dd>{summary.sessions}</dd>
          </div>
          <div>
            <dt>Words read</dt>
            <dd>{summary.totalWords.toLocaleString('en-US')}</dd>
          </div>
          <div>
            <dt>Time reading</dt>
            <dd>{Math.round(summary.totalMs / 60_000)} min</dd>
          </div>
          <div>
            <dt>Mean rate</dt>
            <dd>{summary.averageWpm} wpm</dd>
          </div>
          <div>
            <dt>Best rate</dt>
            <dd>{summary.bestWpm} wpm</dd>
          </div>
          <div>
            <dt>Median rate</dt>
            <dd>{summary.medianWpm} wpm</dd>
          </div>
          <div>
            <dt>Documents</dt>
            <dd>{summary.documents}</dd>
          </div>
          <div>
            <dt>Days with sessions</dt>
            <dd>{summary.streakDays}</dd>
          </div>
          <div>
            <dt>Word bank</dt>
            <dd>{vocabularySize}</dd>
          </div>
        </dl>
        <div className="sightline-row">
          <button type="button" className="sightline-button" data-testid="sightline-warehouse-clear" onClick={() => setConfirmingClear(true)}>
            Clear history and word bank
          </button>
        </div>
        {confirmingClear ? (
          <div className="sightline-note" data-testid="sightline-warehouse-confirm" role="alert">
            <p>This permanently removes saved sessions, document history, and the word bank from this browser.</p>
            <div className="sightline-row">
              <button type="button" className="sightline-button" data-testid="sightline-warehouse-confirm-delete" onClick={() => { setConfirmingClear(false); onClear(); }}>Delete history and word bank</button>
              <button type="button" className="sightline-button sightline-button--small" data-testid="sightline-warehouse-confirm-cancel" onClick={() => setConfirmingClear(false)}>Cancel</button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="sightline-card" aria-labelledby="sightline-velocity-heading">
        <h2 id="sightline-velocity-heading">Velocity by day</h2>
        {velocity.length === 0 ? (
          <p className="sightline-note">No sessions recorded yet, so there is no velocity series to show.</p>
        ) : (
          <ul className="sightline-velocity-list" data-testid="sightline-velocity-list">
            {velocity.map((point) => (
              <li key={point.at}>
                <span>{new Date(point.at).toISOString().slice(0, 10)}</span>
                <span className="sightline-velocity-bar" style={{ width: `${Math.min(100, point.wpm / 6)}%` }} />
                <span>
                  {point.wpm} wpm over {point.sessions} session{point.sessions === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sightline-card" aria-labelledby="sightline-sessions-heading">
        <h2 id="sightline-sessions-heading">Sessions</h2>
        {sessions.length === 0 ? (
          <p className="sightline-note">Read for a minute and the first session appears here.</p>
        ) : (
          <div className="sightline-scroll-x">
            <table className="sightline-table" data-testid="sightline-session-table">
              <caption className="sightline-visually-hidden">Reading sessions recorded in this browser</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Document</th>
                  <th scope="col">Words</th>
                  <th scope="col">Rate</th>
                  <th scope="col">Peak</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 20).map((session) => (
                  <tr key={session.id}>
                    <th scope="row">{new Date(session.startedAt).toLocaleString()}</th>
                    <td>{session.documentTitle}</td>
                    <td>{session.tokensRead.toLocaleString('en-US')}</td>
                    <td>{session.averageWpm} wpm</td>
                    <td>{session.peakWpm} wpm</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/* --------------------------------------------------------------- library -- */

export interface LibraryPanelProps {
  readonly bookmarks: readonly Bookmark[];
  readonly highlightColor: HighlightColor;
  readonly onColor: (color: HighlightColor) => void;
  readonly onJump: (tokenIndex: number) => void;
  readonly onRemoveBookmark: (id: string) => void;
  readonly onRemoveHighlight: (id: string) => void;
  readonly onRemoveNote: (id: string) => void;
  readonly highlights: readonly { id: string; startToken: number; endToken: number; color: HighlightColor }[];
  readonly notes: readonly { id: string; tokenIndex: number; text: string }[];
  readonly progress: readonly DocumentProgress[];
  readonly currentDocumentId: string;
  readonly onInspect: (documentId: string, tokenIndex: number) => void;
}

export function LibraryPanel({
  bookmarks,
  highlightColor,
  onColor,
  onJump,
  onRemoveBookmark,
  onRemoveHighlight,
  onRemoveNote,
  highlights,
  notes,
  progress,
  currentDocumentId,
  onInspect,
}: LibraryPanelProps) {
  return (
    <>
      <section className="sightline-card" aria-labelledby="sightline-marks-heading">
        <h2 id="sightline-marks-heading">Marks in this document</h2>
        <p className="sightline-note" data-testid="sightline-marks-summary">
          {bookmarks.length} bookmark{bookmarks.length === 1 ? '' : 's'} · {highlights.length} highlight
          {highlights.length === 1 ? '' : 's'} · {notes.length} note{notes.length === 1 ? '' : 's'} kept beside the text. Nothing
          here changes the document itself.
        </p>
        <label className="sightline-field">
          <span>Highlight colour for new marks</span>
          <select value={highlightColor} data-testid="sightline-highlight-color" onChange={(event) => onColor(event.target.value as HighlightColor)}>
            <option value="amber">Amber</option>
            <option value="mint">Mint</option>
            <option value="sky">Sky</option>
            <option value="rose">Rose</option>
            <option value="violet">Violet</option>
          </select>
        </label>
        {bookmarks.length === 0 ? (
          <p className="sightline-note">Press B while reading, or use the bookmark button, to mark a place.</p>
        ) : (
          <ul className="sightline-bookmark-list" data-testid="sightline-bookmark-list">
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id}>
                <button type="button" className="sightline-link" onClick={() => onJump(bookmark.tokenIndex)}>
                  {bookmark.label}
                </button>
                <span className="sightline-note"> word {bookmark.tokenIndex.toLocaleString('en-US')}</span>
                <button type="button" className="sightline-button sightline-button--small" onClick={() => onRemoveBookmark(bookmark.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {highlights.length > 0 ? (
          <ul className="sightline-bookmark-list" data-testid="sightline-highlight-list">
            {highlights.map((highlight) => (
              <li key={highlight.id}>
                <button type="button" className="sightline-link" onClick={() => onJump(highlight.startToken)}>
                  {highlight.color} highlight
                </button>
                <span className="sightline-note">
                  {' '}
                  words {highlight.startToken.toLocaleString('en-US')}–{highlight.endToken.toLocaleString('en-US')}
                </span>
                <button type="button" className="sightline-button sightline-button--small" onClick={() => onRemoveHighlight(highlight.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {notes.length > 0 ? (
          <ul className="sightline-bookmark-list" data-testid="sightline-note-list">
            {notes.map((note) => (
              <li key={note.id}>
                <button type="button" className="sightline-link" onClick={() => onJump(note.tokenIndex)}>
                  Note
                </button>
                <span className="sightline-note"> {note.text}</span>
                <button type="button" className="sightline-button sightline-button--small" onClick={() => onRemoveNote(note.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="sightline-card" aria-labelledby="sightline-progress-heading">
        <h2 id="sightline-progress-heading">Saved positions</h2>
        {progress.length === 0 ? (
          <p className="sightline-note">Positions are saved as you read, so a document can be resumed later.</p>
        ) : (
          <ul className="sightline-progress-list" data-testid="sightline-progress-list">
            {progress.map((entry) => (
              <li key={entry.documentId}>
                <span>{entry.title}</span>
                <span className="sightline-note">
                  word {entry.tokenIndex.toLocaleString('en-US')} of {entry.tokenCount.toLocaleString('en-US')}, saved{' '}
                  {new Date(entry.updatedAt).toLocaleString()}
                </span>
                {entry.documentId === currentDocumentId ? (
                  <span className="sightline-note">open now</span>
                ) : (
                  <button type="button" className="sightline-button sightline-button--small" onClick={() => onInspect(entry.documentId, entry.tokenIndex)}>
                    Show this position
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- export -- */

export interface ExportPanelProps {
  readonly draft: MetadataDraft;
  readonly onDraft: (patch: Partial<MetadataDraft>) => void;
  readonly onAddTag: (tag: string) => void;
  readonly onRemoveTag: (tag: string) => void;
  readonly onSuggestTags: () => void;
  readonly onMeasuredLevel: () => void;
  readonly model: DocumentModel | undefined;
  readonly rows: readonly (ExportDefinition & { readonly available: boolean; readonly note: string })[];
  readonly busy: ExportId | null;
  readonly message: string;
  readonly filePreview: string;
  readonly onDownload: (id: ExportId) => void;
  readonly onImportState: (payload: string) => void;
  readonly onExportState: () => void;
  readonly state: SightlineState;
}

const FIELD_LABELS: readonly { readonly field: keyof MetadataDraft; readonly label: string; readonly hint: string }[] = [
  { field: 'title', label: 'Title', hint: 'Used for the file name, the page title, and the document metadata.' },
  { field: 'author', label: 'Author', hint: 'The person or organisation credited in the exported document.' },
  { field: 'description', label: 'Description', hint: 'The abstract or summary shown in catalogues and social previews.' },
  { field: 'subject', label: 'Subject', hint: 'A short classification, such as the course or practice area.' },
  { field: 'language', label: 'Language', hint: 'A BCP-47 tag such as en, en-GB, or fr-CA.' },
  { field: 'publisher', label: 'Publisher', hint: 'Whoever is publishing the exported document.' },
  { field: 'identifier', label: 'Identifier', hint: 'A DOI, ISBN, docket number, or other stable reference.' },
  { field: 'rights', label: 'Rights', hint: 'A licence or copyright statement.' },
  { field: 'url', label: 'Canonical URL', hint: 'Used for the Open Graph and schema.org output.' },
  { field: 'readingLevel', label: 'Reading level', hint: 'Computed from the prose; edit it if you have a house standard.' },
];

export function ExportPanel({
  draft,
  onDraft,
  onAddTag,
  onRemoveTag,
  onSuggestTags,
  onMeasuredLevel,
  model,
  rows,
  busy,
  message,
  filePreview,
  onDownload,
  onImportState,
  onExportState,
  state,
}: ExportPanelProps) {
  const [tagText, setTagText] = useState('');
  const [stateText, setStateText] = useState('');
  const problems = validateDraft(draft);
  const social = socialTags(draft, model?.paragraphs[0] ? model.paragraphs[0].text.slice(0, 200) : '');
  const commitTag = () => {
    const cleaned = tagText.trim();
    if (cleaned.length === 0) return;
    cleaned
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .forEach(onAddTag);
    setTagText('');
  };
  return (
    <>
      <section className="sightline-card" aria-labelledby="sightline-metadata-heading">
        <h2 id="sightline-metadata-heading">Metadata studio</h2>
        <p className="sightline-note">
          Every field here is written into every export, and into the social and schema.org tags. Tags are added one at a time
          with Enter and removed from the chip beside the field.
        </p>
        <div className="sightline-row">
          <label className="sightline-field">
            <span>Add a tag</span>
            <input
              type="text"
              value={tagText}
              data-testid="sightline-tag-input"
              placeholder="reading, methodology…"
              onChange={(event) => setTagText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitTag();
                }
              }}
            />
          </label>
          <button type="button" className="sightline-button" data-testid="sightline-tag-add" onClick={commitTag}>
            Add the tag
          </button>
        </div>
        <div className="sightline-row sightline-row--wrap" data-testid="sightline-tag-list">
          {draft.tags.length === 0 ? (
            <span className="sightline-note">No tags yet. Suggested tags come from the document itself.</span>
          ) : (
            draft.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="sightline-chip sightline-chip--on"
                onClick={() => onRemoveTag(tag)}
              >
                {tag} ×
              </button>
            ))
          )}
        </div>
        <div className="sightline-row">
          <button type="button" className="sightline-button" data-testid="sightline-meta-suggest" disabled={!model} onClick={onSuggestTags}>
            Suggest tags from the document
          </button>
          <button type="button" className="sightline-button" data-testid="sightline-measured-level" disabled={!model} onClick={onMeasuredLevel}>
            Use measured reading level
          </button>
        </div>
        {FIELD_LABELS.map(({ field, label, hint }) => (
          <label key={field} className="sightline-field">
            <span title={hint}>{label}</span>
            {field === 'description' ? (
              <textarea
                rows={3}
                value={draft[field] as string}
                data-testid={`sightline-meta-${field}`}
                onChange={(event) => onDraft({ [field]: event.target.value } as Partial<MetadataDraft>)}
              />
            ) : (
              <input
                type="text"
                value={draft[field] as string}
                data-testid={`sightline-meta-${field}`}
                onChange={(event) => onDraft({ [field]: event.target.value } as Partial<MetadataDraft>)}
              />
            )}
          </label>
        ))}
        {problems.length > 0 ? (
          <ul className="sightline-note sightline-note--warning" data-testid="sightline-meta-problems">
            {problems.map((problem) => (
              <li key={`${problem.field}-${problem.message}`}>{problem.message}</li>
            ))}
          </ul>
        ) : (
          <p className="sightline-note" data-testid="sightline-meta-problems">
            The metadata passes every check applied here.
          </p>
        )}
        <p className="sightline-note">
          The weighted PDF will be written as <code data-testid="sightline-file-preview">{filePreview}</code>.
        </p>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-social-heading">
        <h2 id="sightline-social-heading">Social and structured data</h2>
        <div className="sightline-scroll-x" tabIndex={0} role="region" aria-label="Social and structured data tags">
          <table className="sightline-table" data-testid="sightline-social-table">
            <caption className="sightline-visually-hidden">Open Graph and social card tags written into the HTML export</caption>
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {social.map((tag) => (
                <tr key={tag.property}>
                  <th scope="row">{tag.property}</th>
                  <td>{tag.content}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary>Schema.org data written into the exports</summary>
          <pre className="sightline-brief" data-testid="sightline-structured-data">
            {structuredDataScript(draft)}
          </pre>
        </details>
      </section>

      <section className="sightline-card" aria-labelledby="sightline-exports-heading">
        <h2 id="sightline-exports-heading">Exports</h2>
        <p className="sightline-note">
          Document exports carry the reading treatment you chose and the metadata above. Every file is written in this browser.
        </p>
        <ul className="sightline-export-list">
          {rows.map((row) => (
            <li key={row.id} data-testid={`sightline-export-row-${row.id}`}>
              <div>
                <strong>{row.label}</strong>
                <p className="sightline-note">{row.detail}</p>
                <p className="sightline-note">{row.note}</p>
              </div>
              <button
                type="button"
                className="sightline-button"
                disabled={!row.available || busy !== null}
                data-testid={`sightline-export-${row.id}`}
                onClick={() => onDownload(row.id)}
              >
                {busy === row.id ? 'Writing…' : `Download .${row.extension}`}
              </button>
            </li>
          ))}
        </ul>
        {message ? (
          <p className="sightline-note" data-testid="sightline-export-message">
            {message}
          </p>
        ) : null}
      </section>

      <section className="sightline-card" aria-labelledby="sightline-state-heading">
        <h2 id="sightline-state-heading">Reader state</h2>
        <p className="sightline-note">
          Settings, bookmarks, highlights, notes, and saved positions live in this browser. The state document moves them to
          another machine; importing replaces what is stored here.
        </p>
        <dl className="sightline-facts">
          <div>
            <dt>Bookmarks</dt>
            <dd>{state.bookmarks.length}</dd>
          </div>
          <div>
            <dt>Highlights</dt>
            <dd>{state.highlights.length}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{state.notes.length}</dd>
          </div>
          <div>
            <dt>Saved positions</dt>
            <dd>{state.progress.length}</dd>
          </div>
        </dl>
        <div className="sightline-row">
          <button type="button" className="sightline-button" data-testid="sightline-state-export" onClick={onExportState}>
            Download the reader state
          </button>
          <label className="sightline-button sightline-button--file">
            <span>Import a state file</span>
            <input
              type="file"
              accept="application/json,.json"
              data-testid="sightline-state-file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void file.text().then(onImportState);
              }}
            />
          </label>
        </div>
        <label className="sightline-field">
          <span>Or paste a state document here and leave the field to import it</span>
          <textarea
            rows={3}
            value={stateText}
            data-testid="sightline-state-import"
            onChange={(event) => setStateText(event.target.value)}
            onBlur={() => {
              if (stateText.trim().length > 0) {
                onImportState(stateText);
                setStateText('');
              }
            }}
          />
        </label>
      </section>
    </>
  );
}
