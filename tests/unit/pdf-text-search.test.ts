import { describe, expect, it } from 'vitest';
import { findPdfTextMatches } from '../../src/tools/pdf/pdf-text-search';

describe('PDF text search', () => {
  it('finds bounded case-insensitive matches with useful excerpts', () => {
    expect(findPdfTextMatches('Alpha beta ALPHA gamma', 'alpha', { maxResults: 10 })).toEqual([
      { index: 0, excerpt: 'Alpha beta ALPHA gamma' },
      { index: 11, excerpt: 'Alpha beta ALPHA gamma' },
    ]);
  });

  it('supports case-sensitive search and rejects empty queries', () => {
    expect(findPdfTextMatches('Alpha alpha', 'Alpha', { caseSensitive: true })).toEqual([
      { index: 0, excerpt: 'Alpha alpha' },
    ]);
    expect(findPdfTextMatches('Alpha alpha', '   ')).toEqual([]);
  });

  it('bounds results to protect the UI from pathological documents', () => {
    expect(findPdfTextMatches('x x x x x', 'x', { maxResults: 3 })).toHaveLength(3);
    expect(findPdfTextMatches('x x x', 'x', { maxResults: 0 })).toHaveLength(1);
  });
});
