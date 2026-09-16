/**
 * Deterministic syllable estimation and readability metrics.
 *
 * The estimator is a documented English orthography heuristic: it is stable,
 * testable, and good enough for pacing compensation and readability scoring,
 * but it is not a pronunciation dictionary and the interface labels every
 * derived number as an estimate.
 */

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/** Words whose letter pattern defeats the general rules. */
const EXCEPTIONS: Record<string, number> = {
  the: 1,
  a: 1,
  i: 1,
  area: 3,
  being: 2,
  business: 2,
  every: 2,
  eye: 1,
  fire: 1,
  hour: 1,
  our: 1,
  people: 2,
  poem: 2,
  queue: 1,
  quiet: 2,
  rhythm: 2,
  science: 2,
  some: 1,
  someone: 2,
  queueing: 2,
  recipe: 3,
  extremely: 3,
  create: 2,
  idea: 3,
  hundred: 2,
  sacred: 2,
  wicked: 2,
  naked: 2,
  rugged: 2,
  crooked: 2,
  beloved: 3,
  blessed: 2,
  aged: 2,
  simile: 3,
  fragile: 2,
  agile: 2,
  fertile: 2,
  hostile: 2,
  mobile: 2,
  docile: 2,
  exile: 2,
  profile: 2,
  reptile: 2,
  versatile: 3,
  though: 1,
  through: 1,
  tired: 1,
  weight: 1,
  word: 1,
  worthy: 2,
};

const stripDiacritics = (word: string): string =>
  word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const countLetters = (value: string): number => (value.match(/[A-Za-z\u00c0-\u024f]/g) ?? []).length;

export const hasLetters = (value: string): boolean => countLetters(value) > 0;

export const countVowelGroups = (word: string): number => {
  let groups = 0;
  let previousWasVowel = false;
  for (let index = 0; index < word.length; index += 1) {
    const character = word[index]!;
    const isVowel = VOWELS.has(character) || (character === 'y' && index > 0 && !VOWELS.has(word[index - 1] ?? ''));
    if (isVowel && !previousWasVowel) groups += 1;
    previousWasVowel = isVowel;
  }
  return groups;
};

const CONSONANT_LETTERS = new Set('bcdfghjklmnpqrstvwxz'.split(''));
const CONSONANT_OR_Y = new Set('bcdfghjklmnpqrstvwxz'.split('').concat('y'));

/**
 * Syllables in a single letter run.
 *
 * The rules, in order:
 *
 * 1. A plural or past-tense `-ies`/`-ied` after a consonant behaves like the
 *    `-y` it was built from, so "cities" counts as "city" and "hurried" as
 *    "hurry" rather than gaining a vowel group.
 * 2. Vowel groups are counted, with `y` acting as a vowel after a consonant.
 * 3. A silent final `e` is removed unless the word ends in a syllabic `-Cle`
 *    ("table", "little") where the vowel is pronounced.
 * 4. `-ed` is silent after anything but `t`/`d` and after a vowel digraph
 *    ("worked" one, "wanted" two, "agreed" two).
 * 5. `-es` is silent after a non-sibilant stem and after a syllabic `-Cl`
 *    stem ("makes" one, "boxes" two, "apples" two).
 *
 * Words whose spelling defeats these rules are carried in the exception table.
 */
const syllablesInRun = (run: string): number => {
  let word = stripDiacritics(run).toLowerCase().replace(/[^a-z]/g, '');
  if (word.length === 0) return 0;
  const exception = EXCEPTIONS[word];
  if (exception !== undefined) return exception;
  if (word.length <= 3) return 1;

  if (/(?:ies|ied)$/.test(word) && CONSONANT_LETTERS.has(word[word.length - 4] ?? '')) {
    word = `${word.slice(0, -3)}y`;
  }

  let count = countVowelGroups(word);
  const terminal = word[word.length - 1]!;
  const beforeTerminal = word[word.length - 2]!;
  const syllabicLe = word.endsWith('le')
    && word.length > 3
    && CONSONANT_LETTERS.has(word[word.length - 3]!);

  if (terminal === 'e' && !word.endsWith('ee') && !syllabicLe && CONSONANT_LETTERS.has(beforeTerminal)) {
    count -= 1;
  }
  if (word.endsWith('ed') && word.length > 3) {
    const preceding = word[word.length - 3]!;
    if (preceding !== 't' && preceding !== 'd' && CONSONANT_OR_Y.has(preceding)) count -= 1;
  }
  if (word.endsWith('es') && word.length > 3) {
    const stem = word.slice(0, -2);
    const sibilant = /(?:s|x|z|g|c|ch|sh)$/.test(stem);
    const syllabicL = /[bcdfghjklmnpqrstvwxz]l$/.test(stem) && CONSONANT_LETTERS.has(stem[stem.length - 2] ?? '');
    if (!sibilant && !syllabicL) count -= 1;
  }

  return Math.max(1, count);
};

/** Syllables across a whole token, including hyphenated and slashed compounds. */
export const estimateSyllables = (token: string): number => {
  const runs = token.split(/[^A-Za-z\u00c0-\u024f]+/).filter((run) => run.length > 0);
  if (runs.length === 0) return 0;
  return runs.reduce((total, run) => total + syllablesInRun(run), 0);
};

export interface ReadabilityInput {
  readonly text: string;
  readonly words: number;
  readonly sentences: number;
  readonly syllables: number;
  readonly complexWords: number;
  readonly characters: number;
  readonly charactersNoSpaces: number;
  readonly paragraphs: number;
}

export interface ReadabilityMetrics extends ReadabilityInput {
  readonly readingMinutes: number;
  readonly speakingMinutes: number;
  readonly fleschReadingEase: number;
  readonly fleschKincaidGrade: number;
  readonly gunningFog: number;
  readonly averageSentenceWords: number;
  readonly longestSentenceWords: number;
}

/** Published mean silent reading rate for adult English non-fiction. */
export const BASELINE_READING_WPM = 238;
/** Conventional presentation rate for reading text aloud. */
export const BASELINE_SPEAKING_WPM = 140;

export interface ComplexWordOptions {
  /** Minimum syllables for a word to count as complex (Gunning fog uses 3). */
  readonly minimumSyllables?: number;
  /** Words on this list never count as complex regardless of length. */
  readonly properNouns?: ReadonlySet<string>;
}

export const countComplexWords = (
  words: readonly string[],
  options: ComplexWordOptions = {},
): number => {
  const minimum = options.minimumSyllables ?? 3;
  const properNouns = options.properNouns;
  let count = 0;
  for (const word of words) {
    const cleaned = stripDiacritics(word).replace(/[^A-Za-z]/g, '');
    if (cleaned.length === 0) continue;
    // A capitalized word that is not sentence-initial is treated as a proper
    // noun or technical term and is not penalised as a complex word.
    if (properNouns?.has(cleaned.toLowerCase())) continue;
    if (estimateSyllables(cleaned) >= minimum) count += 1;
  }
  return count;
};

export const computeReadability = (input: ReadabilityInput, longestSentenceWords: number): ReadabilityMetrics => {
  const words = Math.max(1, input.words);
  const sentences = Math.max(1, input.sentences);
  const wordsPerSentence = input.words / sentences;
  const syllablesPerWord = input.syllables / words;
  return {
    ...input,
    readingMinutes: input.words / BASELINE_READING_WPM,
    speakingMinutes: input.words / BASELINE_SPEAKING_WPM,
    fleschReadingEase: 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord,
    fleschKincaidGrade: 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59,
    gunningFog: 0.4 * (wordsPerSentence + 100 * (input.complexWords / words)),
    averageSentenceWords: wordsPerSentence,
    longestSentenceWords,
  };
};

export const describeReadingEase = (score: number): string => {
  if (score >= 90) return 'very easy';
  if (score >= 80) return 'easy';
  if (score >= 70) return 'fairly easy';
  if (score >= 60) return 'plain';
  if (score >= 50) return 'fairly difficult';
  if (score >= 30) return 'difficult';
  return 'very difficult';
};

export const describeGradeLevel = (grade: number): string => {
  if (!Number.isFinite(grade)) return 'unknown';
  const clamped = Math.max(1, Math.round(grade));
  return `grade ${clamped}`;
};
