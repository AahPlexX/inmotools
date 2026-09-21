import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  addBookmark,
  addHighlight,
  createDefaultState,
  documentId,
  exportState,
  highlightFor,
  importState,
  nearestBookmark,
  notesFor,
  progressFor,
  readState,
  removeBookmark,
  removeHighlight,
  removeNote,
  saveProgress,
  updateSettings,
  upsertNote,
  writeState,
} from '../../src/tools/sightline/sightline-store';
import {
  advanceSession,
  createSession,
  formatDuration,
  formatEta,
  pauseSession,
  readingStreak,
  realisedWpm,
  recordLag,
  resumeSession,
  sessionTick,
  suggestNextWpm,
  summariseSession,
} from '../../src/tools/sightline/session-engine';
import {
  averageWpmOverDays,
  clearWarehouse,
  mergeDocumentRollup,
  openWarehouse,
  sessionRows,
  summariseWarehouse,
  velocityByDay,
} from '../../src/tools/sightline/analytics-engine';
import {
  applyReview,
  buildCloze,
  buildClozeSet,
  chooseDistractors,
  collectVocabulary,
  dueEntries,
  retentionRate,
  vocabularyPayload,
  vocabularyRows,
} from '../../src/tools/sightline/vocabulary-engine';
import { buildDocumentModel } from '../../src/tools/sightline/segmentation-engine';

const model = (text: string, title = 'Sample') => {
  const built = buildDocumentModel({
    format: 'text',
    fileName: 'sample.txt',
    paragraphs: [{ kind: 'body', level: 0, text }],
  });
  return { ...built, metadata: { ...built.metadata, title } };
};

const memoryStorage = (initial: Record<string, string> = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
    clear: () => store.clear(),
    raw: store,
  } as unknown as Storage & { raw: Map<string, string> };
};

describe('reader state store', () => {
  it('starts from defaults when nothing is stored', () => {
    const state = readState(memoryStorage());
    expect(state.version).toBe(1);
    expect(state.settings.engine).toBe('rsvp');
    expect(state.bookmarks).toHaveLength(0);
  });

  it('round-trips a state through storage', () => {
    const storage = memoryStorage();
    const state = updateSettings(createDefaultState(), { engine: 'chunk', proseOnly: true });
    writeState(storage, state);
    const read = readState(storage);
    expect(read.settings.engine).toBe('chunk');
    expect(read.settings.proseOnly).toBe(true);
    expect(storage.raw.get(STORAGE_KEY)).toBeTruthy();
  });

  it('discards a payload from another version instead of guessing', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ version: 99, settings: {} }) });
    expect(readState(storage).settings.engine).toBe('rsvp');
  });

  it('survives corrupt storage', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{not json' });
    expect(readState(storage).bookmarks).toHaveLength(0);
  });

  it('scopes state to a document fingerprint', () => {
    const first = documentId(model('Some text here.', 'First'));
    const second = documentId(model('Some text here.', 'Second'));
    expect(first).not.toBe(second);
    expect(documentId(model('Some text here.', 'First'))).toBe(first);
  });

  it('keeps one bookmark per position and sorts them', () => {
    let state = createDefaultState();
    state = addBookmark(state, { tokenIndex: 20, label: 'Later', chapterIndex: 1 });
    state = addBookmark(state, { tokenIndex: 5, label: 'Earlier', chapterIndex: 0 });
    state = addBookmark(state, { tokenIndex: 20, label: 'Renamed', chapterIndex: 1 });
    expect(state.bookmarks).toHaveLength(2);
    expect(state.bookmarks.map((bookmark) => bookmark.tokenIndex)).toEqual([5, 20]);
    expect(state.bookmarks[1]!.label).toBe('Renamed');
    const id = state.bookmarks[0]!.id;
    expect(removeBookmark(state, id).bookmarks).toHaveLength(1);
  });

  it('finds the nearest bookmark at or before a position', () => {
    let state = createDefaultState();
    state = addBookmark(state, { tokenIndex: 10, label: 'A', chapterIndex: 0 });
    state = addBookmark(state, { tokenIndex: 50, label: 'B', chapterIndex: 1 });
    expect(nearestBookmark(state, 60)?.tokenIndex).toBe(50);
    expect(nearestBookmark(state, 20)?.tokenIndex).toBe(10);
    expect(nearestBookmark(state, 1)?.tokenIndex).toBe(10);
  });

  it('replaces overlapping highlights so colours never stack', () => {
    let state = createDefaultState();
    state = addHighlight(state, { startToken: 10, endToken: 20, color: 'amber' });
    state = addHighlight(state, { startToken: 15, endToken: 25, color: 'mint' });
    expect(state.highlights).toHaveLength(1);
    expect(state.highlights[0]!.color).toBe('mint');
    expect(state.highlights[0]!.startToken).toBe(15);
    expect(highlightFor(state, 22)?.color).toBe('mint');
    expect(highlightFor(state, 12)).toBeUndefined();
    const id = state.highlights[0]!.id;
    expect(removeHighlight(state, id).highlights).toHaveLength(0);
  });

  it('normalises a reversed highlight range', () => {
    const state = addHighlight(createDefaultState(), { startToken: 30, endToken: 12, color: 'sky' });
    expect(state.highlights[0]!.startToken).toBe(12);
    expect(state.highlights[0]!.endToken).toBe(30);
  });

  it('creates, updates, and removes margin notes', () => {
    let state = upsertNote(createDefaultState(), { tokenIndex: 8, text: 'First thought' });
    const id = state.notes[0]!.id;
    state = upsertNote(state, { id, tokenIndex: 8, text: 'Revised thought' });
    expect(state.notes).toHaveLength(1);
    expect(state.notes[0]!.text).toBe('Revised thought');
    expect(state.notes[0]!.updatedAt).toBeGreaterThanOrEqual(state.notes[0]!.createdAt);
    expect(notesFor(state, 8)).toHaveLength(1);
    expect(notesFor(state, 40)).toHaveLength(0);
    expect(removeNote(state, id).notes).toHaveLength(0);
  });

  it('keeps one progress record per document, newest first', () => {
    let state = createDefaultState();
    state = saveProgress(state, { documentId: 'a', title: 'A', format: 'text', tokenIndex: 10, tokenCount: 100, chapterIndex: 0, wpm: 300 });
    state = saveProgress(state, { documentId: 'b', title: 'B', format: 'epub', tokenIndex: 20, tokenCount: 200, chapterIndex: 1, wpm: 320 });
    state = saveProgress(state, { documentId: 'a', title: 'A', format: 'text', tokenIndex: 55, tokenCount: 100, chapterIndex: 0, wpm: 310 });
    expect(state.progress).toHaveLength(2);
    expect(progressFor(state, 'a')?.tokenIndex).toBe(55);
  });

  it('exports and re-imports reader state', () => {
    let state = createDefaultState();
    state = addBookmark(state, { tokenIndex: 3, label: 'Start', chapterIndex: 0 });
    const payload = exportState(state);
    const result = importState(createDefaultState(), payload);
    expect(result.message).toContain('imported');
    expect(result.state.bookmarks).toHaveLength(1);
  });

  it('keeps the current state when an import file is unusable', () => {
    const current = addBookmark(createDefaultState(), { tokenIndex: 3, label: 'Start', chapterIndex: 0 });
    const wrongVersion = importState(current, JSON.stringify({ version: 2 }));
    expect(wrongVersion.state.bookmarks).toHaveLength(1);
    expect(wrongVersion.message).toContain('different version');
    const broken = importState(current, 'not json');
    expect(broken.state.bookmarks).toHaveLength(1);
    expect(broken.message).toContain('could not be read');
  });
});

describe('session tracking', () => {
  const built = model('One two three four five six seven eight nine ten.');

  it('measures the rate from the time actually spent reading', () => {
    let session = createSession(built, 1_000);
    session = advanceSession(session, built.tokens.length, { tokenIndex: 0, at: 1_000, wpm: 300 });
    session = advanceSession(session, built.tokens.length, { tokenIndex: 1, at: 1_200, wpm: 300 });
    session = advanceSession(session, built.tokens.length, { tokenIndex: 2, at: 1_400, wpm: 300 });
    expect(session.elapsedMs).toBe(400);
    expect(session.tokensRead).toBe(3);
    expect(realisedWpm(session)).toBe(450);
  });

  it('excludes paused time from the measured rate', () => {
    let session = createSession(built, 1_000);
    session = advanceSession(session, 10, { tokenIndex: 0, at: 1_000, wpm: 300 });
    session = pauseSession(session, 1_100);
    session = resumeSession(session, 11_100);
    session = advanceSession(session, 10, { tokenIndex: 1, at: 11_300, wpm: 300 });
    expect(session.pausedMs).toBe(10_100);
    expect(session.elapsedMs).toBe(200);
    expect(realisedWpm(session)).toBe(600);
  });

  it('reports progress, the rate, and the time left', () => {
    let session = createSession(built, 0);
    session = { ...session, elapsedMs: 20_000, tokensRead: 100, position: 99 };
    const tick = sessionTick(session, 200, 1_000_000);
    expect(tick.progress).toBeCloseTo(0.5, 6);
    expect(tick.wpm).toBe(300);
    expect(tick.remainingMs).toBe(20_000);
    expect(tick.eta).toBe(1_020_000);
  });

  it('tracks the peak rate and the drift from the requested rate', () => {
    let session = createSession(built, 0);
    session = advanceSession(session, 10, { tokenIndex: 0, at: 0, wpm: 300 });
    session = advanceSession(session, 10, { tokenIndex: 1, at: 200, wpm: 420 });
    expect(session.peakWpm).toBe(420);
    session = recordLag(session, 300, 260);
    expect(session.lagSamples).toEqual([-40]);
  });

  it('summarises a finished session', () => {
    let session = createSession(built, 1_000);
    session = advanceSession(session, 10, { tokenIndex: 0, at: 1_000, wpm: 300 });
    session = advanceSession(session, 10, { tokenIndex: 1, at: 1_400, wpm: 300 });
    const summary = summariseSession(session, 2_000);
    expect(summary.tokensRead).toBe(2);
    expect(summary.averageWpm).toBe(300);
    expect(summary.finishedAt).toBe(2_000);
    expect(summary.meanLagWpm).toBe(0);
  });

  it('suggests a higher rate only when the target was met', () => {
    const met = { ...createSession(model('a b c'), 0), elapsedMs: 60_000, tokensRead: 300, peakWpm: 300 };
    expect(suggestNextWpm(met, 300)).toBe(325);
    const missed = { ...createSession(model('a b c'), 0), elapsedMs: 60_000, tokensRead: 150, peakWpm: 300 };
    expect(suggestNextWpm(missed, 300)).toBe(275);
    const close = { ...createSession(model('a b c'), 0), elapsedMs: 60_000, tokensRead: 280, peakWpm: 300 };
    expect(suggestNextWpm(close, 300)).toBe(300);
    const untouched = createSession(model('a b c'), 0);
    expect(suggestNextWpm(untouched, 300)).toBe(300);
  });

  it('formats durations and arrival times for the status bar', () => {
    expect(formatDuration(4_000)).toBe('4s');
    expect(formatDuration(64_000)).toBe('1m 04s');
    expect(formatDuration(3_725_000)).toBe('1h 02m');
    expect(formatEta(Date.now() + 5_000)).toBe('almost done');
    expect(formatEta(Date.now() + 120_000)).toContain('left');
  });

  it('counts consecutive reading days', () => {
    const day = 86_400_000;
    const now = Date.UTC(2026, 8, 15, 12);
    const sessions = [{ startedAt: now }, { startedAt: now - day }, { startedAt: now - 2 * day }, { startedAt: now - 5 * day }];
    expect(readingStreak(sessions, now)).toBe(3);
    expect(readingStreak([], now)).toBe(0);
    expect(readingStreak([{ startedAt: now - 3 * day }], now)).toBe(0);
  });
});

describe('analytics warehouse', () => {
  const session = (startedAt: number, averageWpm: number, tokensRead = 500, id = `s${startedAt}`) => ({
    id,
    documentTitle: 'Doc',
    format: 'text',
    tokensRead,
    elapsedMs: 120_000,
    pausedMs: 0,
    averageWpm,
    peakWpm: averageWpm + 20,
    startedAt,
    finishedAt: startedAt + 120_000,
    meanLagWpm: 0,
    series: [averageWpm],
    slowWords: [],
  });

  it('buckets sessions into calendar days', () => {
    const day = 86_400_000;
    const start = Date.UTC(2026, 8, 10, 9);
    const points = velocityByDay([session(start, 300), session(start + 3_600_000, 400), session(start + day, 500)]);
    expect(points).toHaveLength(2);
    expect(points[0]!.wpm).toBe(350);
    expect(points[0]!.sessions).toBe(2);
    expect(points[1]!.wpm).toBe(500);
  });

  it('averages a window of days', () => {
    const now = Date.UTC(2026, 8, 15, 12);
    const day = 86_400_000;
    const sessions = [session(now - day, 400), session(now - 3 * day, 200)];
    expect(averageWpmOverDays(sessions, 7, now)).toBe(300);
    expect(averageWpmOverDays(sessions, 1, now)).toBe(400);
    expect(averageWpmOverDays(sessions, 0, now)).toBe(0);
  });

  it('summarises the whole warehouse including the median', () => {
    const summary = summariseWarehouse(
      [session(1, 200), session(2, 300), session(3, 500)],
      [],
      12,
    );
    expect(summary.sessions).toBe(3);
    expect(summary.bestWpm).toBe(500);
    expect(summary.medianWpm).toBe(300);
    expect(summary.totalWords).toBe(1500);
    expect(summary.vocabularySize).toBe(12);
    expect(summariseWarehouse([], [], 0).sessions).toBe(0);
  });

  it('folds a session into a document rollup', () => {
    const first = mergeDocumentRollup(undefined, session(1_000, 300, 800));
    expect(first.sessions).toBe(1);
    expect(first.bestWpm).toBe(300);
    const second = mergeDocumentRollup(first, session(2_000, 420, 1_200));
    expect(second.sessions).toBe(2);
    expect(second.bestWpm).toBe(420);
    expect(second.lastWpm).toBe(420);
    expect(second.wordsRead).toBe(2000);
  });

  it('writes a CSV header even with no sessions', () => {
    const rows = sessionRows([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]![0]).toBe('startedAt');
  });

  it('reports when the browser has no local database', async () => {
    const result = await openWarehouse({});
    expect(result.ok).toBe(false);
    expect(result.message).toContain('no local database');
  });

  it('reports a blocked database rather than throwing', async () => {
    const failing = {
      open: () => {
        const request = { error: { name: 'SecurityError' }, onsuccess: null, onerror: null, onupgradeneeded: null } as unknown as IDBOpenDBRequest;
        setTimeout(() => (request.onerror as unknown as () => void)?.(), 0);
        return request;
      },
    } as unknown as IDBFactory;
    const result = await openWarehouse({ indexedDB: failing });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('blocked');
  });

  it('refuses to clear a database it could not open', async () => {
    const result = await clearWarehouse(undefined as unknown as IDBDatabase);
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });
});

describe('vocabulary bank', () => {
  const built = model('The extraordinary phenomenon continued unabated. A considerate reader paused.');
  const timed = built.tokens.map((token, index) => ({
    token,
    durationMs: index % 3 === 0 ? 900 : 120,
  }));

  it('collects the words that took markedly longer than the reader\'s median', () => {
    const bank = collectVocabulary(timed.slice(0, 8), { slowRatio: 1.5, minLetters: 4, now: 5_000 });
    expect(bank.length).toBeGreaterThan(0);
    expect(bank.every((entry) => entry.word.length >= 4)).toBe(true);
    expect(bank.every((entry) => entry.averageMs >= 0)).toBe(true);
  });

  it('never collects function words or very short words', () => {
    const bank = collectVocabulary(timed, { slowRatio: 1, minLetters: 4, now: 0 });
    const words = bank.map((entry) => entry.word.toLowerCase());
    expect(words).not.toContain('the');
    expect(words.every((word) => word.replace(/[^a-z]/g, '').length >= 4)).toBe(true);
  });

  it('always collects words the reader marked', () => {
    const bank = collectVocabulary(timed.slice(0, 3), { slowRatio: 99, minLetters: 4, markedWords: ['paused'], now: 0 });
    expect(bank.map((entry) => entry.word.toLowerCase())).toContain('paused');
  });

  it('merges repeats of the same word into one entry with more weight', () => {
    const repeatedToken = built.tokens.find((token) => token.text === 'phenomenon')!;
    const repeated = [repeatedToken, repeatedToken, repeatedToken].map((token) => ({ token, durationMs: 800 }));
    const bank = collectVocabulary(repeated, { slowRatio: 0, minLetters: 4, now: 0 });
    expect(bank).toHaveLength(1);
    expect(bank[0]!.word).toBe('phenomenon');
    expect(bank[0]!.seen).toBe(3);
    expect(bank[0]!.weight).toBe(3);
  });

  it('returns nothing for an empty document', () => {
    expect(collectVocabulary([], { slowRatio: 1, minLetters: 4 })).toEqual([]);
  });

  it('picks plausible distractors and never the answer itself', () => {
    const distractors = chooseDistractors('reading', ['readings', 'raiding', 'seeding', 'walking', 'reading'], 3);
    expect(distractors).not.toContain('reading');
    expect(distractors.length).toBe(3);
    expect(new Set(distractors).size).toBe(3);
  });

  it('builds a cloze item from the sentence that contains the word', () => {
    const sentence = built.sentences[0]!;
    const item = buildCloze(sentence, built.tokens, 'extraordinary', built.tokens.map((token) => token.text));
    expect(item).not.toBeNull();
    expect(item!.text).toContain('____');
    expect(item!.text).not.toContain('extraordinary');
    expect(item!.answer).toBe('extraordinary');
    expect(item!.options[item!.answerIndex]).toBe('extraordinary');
    expect(item!.options.length).toBe(4);
  });

  it('returns null when the word is not in the sentence', () => {
    expect(buildCloze(built.sentences[1]!, built.tokens, 'extraordinary')).toBeNull();
  });

  it('builds a set of cloze items in bank order', () => {
    const bank = collectVocabulary(timed, { slowRatio: 1, minLetters: 4, now: 0 });
    const items = buildClozeSet(bank, built.tokens, built.sentences, 5);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items.every((item) => item.text.includes('____'))).toBe(true);
  });

  it('lengthens the interval after a correct answer and resets after a miss', () => {
    const entry = {
      word: 'phenomenon', seen: 1, correct: 0, averageMs: 800, weight: 3,
      addedAt: 0, lastSeenAt: 0, dueAt: 0, intervalDays: 0,
    };
    const first = applyReview({ entry, correct: true, now: 1_000_000 });
    expect(first.intervalDays).toBe(1);
    expect(first.dueAt).toBe(1_000_000 + 86_400_000);
    const second = applyReview({ entry: first, correct: true, now: 2_000_000 });
    expect(second.intervalDays).toBeGreaterThan(first.intervalDays);
    expect(second.weight).toBeLessThan(first.weight);
    const missed = applyReview({ entry: second, correct: false, now: 3_000_000 });
    expect(missed.intervalDays).toBe(0.5);
    expect(missed.weight).toBeGreaterThan(second.weight);
  });

  it('caps the interval so a card cannot disappear for years', () => {
    let entry = {
      word: 'long', seen: 9, correct: 9, averageMs: 100, weight: 1,
      addedAt: 0, lastSeenAt: 0, dueAt: 0, intervalDays: 200,
    };
    for (let index = 0; index < 10; index += 1) entry = applyReview({ entry, correct: true, now: index * 1000 });
    expect(entry.intervalDays).toBeLessThanOrEqual(240);
  });

  it('orders due cards weakest first and reports retention', () => {
    const bank = [
      { word: 'a', seen: 1, correct: 1, averageMs: 100, weight: 1, addedAt: 0, lastSeenAt: 0, dueAt: 0, intervalDays: 1 },
      { word: 'b', seen: 2, correct: 1, averageMs: 200, weight: 5, addedAt: 0, lastSeenAt: 0, dueAt: 0, intervalDays: 1 },
    ];
    const due = dueEntries(bank, 1_000);
    expect(due.map((entry) => entry.word)).toEqual(['b', 'a']);
    expect(retentionRate(bank)).toBeCloseTo(66.7, 1);
    expect(retentionRate([])).toBe(0);
  });

  it('writes vocabulary rows and a JSON payload', () => {
    const bank = collectVocabulary(timed.slice(0, 6), { slowRatio: 1, minLetters: 4, now: 0 });
    const rows = vocabularyRows(bank);
    expect(rows[0]![0]).toBe('word');
    expect(rows).toHaveLength(bank.length + 1);
    const payload = JSON.parse(vocabularyPayload(bank)) as { entries: unknown[]; retention: number };
    expect(payload.entries).toHaveLength(bank.length);
    expect(typeof payload.retention).toBe('number');
  });
});
