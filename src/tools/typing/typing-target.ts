import { generateWords } from './typing-engine';
import {
  CODE_SNIPPETS,
  ENGLISH_TOP_200,
  ENGLISH_TOP_1000,
  ENGLISH_TOP_5000,
  KIDS_SENTENCES,
  LANGUAGE_POOLS,
  LEGAL_SENTENCES,
  MEDICAL_SENTENCES,
  NUMBER_SEEDS,
  PUNCTUATION_SEEDS,
  QUOTES,
  poolForMode,
  quotesByLength,
  type CorpusMode,
  type Language,
  type Quote,
} from './typing-corpora';

export type DurationMode = 'time' | 'words' | 'quote' | 'zen' | 'certification';

export interface TargetConfig {
  language: Language;
  mode: CorpusMode;
  durationMode: DurationMode;
  durationValue: number;
  quoteLength: Quote['length'];
  customText: string;
  codeIndex: number;
}

/** Capacity guard only; this is not a user-facing performance benchmark. */
export const TIMED_CAPACITY_WPM = 400;
export const TIMED_BUFFER_WORDS = 50;
export const ZEN_INITIAL_WORDS = 250;
export const ZEN_CHUNK_WORDS = 160;

const TIME_DURATION_VALUES = [15, 30, 60, 120] as const;
const WORD_DURATION_VALUES = [10, 25, 50, 100, 200] as const;

export function normalizeDurationValue(mode: DurationMode, currentValue: number): number {
  if (mode === 'time') return TIME_DURATION_VALUES.includes(currentValue as (typeof TIME_DURATION_VALUES)[number]) ? currentValue : 30;
  if (mode === 'words') return WORD_DURATION_VALUES.includes(currentValue as (typeof WORD_DURATION_VALUES)[number]) ? currentValue : 25;
  return currentValue;
}

export function countWords(text: string): number {
  return text.match(/\S+/g)?.length ?? 0;
}

export function targetWordCapacity(cfg: Pick<TargetConfig, 'durationMode' | 'durationValue'>): number {
  if (cfg.durationMode === 'words') return Math.max(1, Math.round(cfg.durationValue));
  if (cfg.durationMode === 'time' || cfg.durationMode === 'certification') {
    const seconds = cfg.durationMode === 'certification' ? 300 : Math.max(1, cfg.durationValue);
    return Math.ceil((seconds / 60) * TIMED_CAPACITY_WPM) + TIMED_BUFFER_WORDS;
  }
  if (cfg.durationMode === 'zen') return ZEN_INITIAL_WORDS;
  return 0;
}

function quoteForLength(length: Quote['length'], seed?: number): string {
  const options = quotesByLength(length);
  if (options.length === 0) return QUOTES[0]?.text ?? '';
  const indexSeed = seed ?? Math.floor(Date.now() % 100000);
  return options[Math.abs(indexSeed) % options.length]?.text ?? options[0]!.text;
}

function takeFirstWordsPreservingWhitespace(text: string, wordCount: number): string {
  if (wordCount <= 0) return '';
  const matcher = /\S+/g;
  let match: RegExpExecArray | null = null;
  let seen = 0;
  let end = text.length;
  while ((match = matcher.exec(text)) !== null) {
    seen += 1;
    if (seen === wordCount) {
      end = match.index + match[0].length;
      break;
    }
  }
  return text.slice(0, end).trim();
}

function fitSourceToWords(source: string, wordCount: number, exact: boolean): string {
  const clean = source.trim();
  if (!clean || wordCount <= 0) return clean;
  let expanded = clean;
  while (countWords(expanded) < wordCount) expanded += `\n\n${clean}`;
  return exact ? takeFirstWordsPreservingWhitespace(expanded, wordCount) : expanded;
}

function languagePool(language: Language): string[] {
  return language === 'english' ? ENGLISH_TOP_1000 : LANGUAGE_POOLS[language];
}

export function buildZenChunk(language: Language, seed?: number, wordCount = ZEN_CHUNK_WORDS): string {
  return generateWords(languagePool(language), Math.max(1, wordCount), seed);
}

export function buildTargetText(cfg: TargetConfig, seed?: number): string {
  if (cfg.durationMode === 'quote') return quoteForLength(cfg.quoteLength, seed);
  if (cfg.durationMode === 'zen') return buildZenChunk(cfg.language, seed, ZEN_INITIAL_WORDS);

  const capacity = targetWordCapacity(cfg);
  const exactWords = cfg.durationMode === 'words';

  if (cfg.mode === 'words-200') return generateWords(ENGLISH_TOP_200, capacity, seed);
  if (cfg.mode === 'words-1000') {
    return generateWords(cfg.language === 'english' ? ENGLISH_TOP_1000 : LANGUAGE_POOLS[cfg.language], capacity, seed);
  }
  if (cfg.mode === 'words-5000') {
    return generateWords(cfg.language === 'english' ? ENGLISH_TOP_5000 : LANGUAGE_POOLS[cfg.language], capacity, seed);
  }

  let source = '';
  switch (cfg.mode) {
    case 'punctuation':
      source = PUNCTUATION_SEEDS.slice(0, 6).join(' ');
      break;
    case 'numbers':
      source = NUMBER_SEEDS.slice(0, 5).join('  ');
      break;
    case 'code':
      source = CODE_SNIPPETS[cfg.codeIndex % CODE_SNIPPETS.length]?.text ?? '';
      break;
    case 'medical':
      source = MEDICAL_SENTENCES.slice(0, 5).join(' ');
      break;
    case 'legal':
      source = LEGAL_SENTENCES.slice(0, 5).join(' ');
      break;
    case 'kids':
      source = KIDS_SENTENCES.join(' ');
      break;
    case 'quote':
      source = quoteForLength(cfg.quoteLength, seed);
      break;
    case 'zen':
      source = generateWords(poolForMode('words-1000', cfg.language), capacity, seed);
      break;
    case 'custom':
      source = cfg.customText.trim();
      break;
    default:
      source = '';
  }

  return fitSourceToWords(source, capacity, exactWords);
}
