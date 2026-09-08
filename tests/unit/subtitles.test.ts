import { describe, expect, it } from 'vitest';
import {
  applyLinearCorrection,
  countCuesShiftedBelowZero,
  parseAnchorTime,
  parseSubtitle,
  serializeSubtitle,
} from '../../src/tools/subtitles/subtitle-engine';

const srt = `1
00:00:00,000 --> 00:00:02,000
First line

2
00:00:50,000 --> 00:00:52,000
Middle line

3
00:01:40,000 --> 00:01:42,000
Last line
`;

describe('subtitle drift correction', () => {
  it('parses SRT cues without losing text', () => {
    const parsed = parseSubtitle(srt);
    expect(parsed.format).toBe('srt');
    expect(parsed.cues).toHaveLength(3);
    expect(parsed.cues[1].text).toBe('Middle line');
  });

  it('applies a two-anchor linear correction across all timestamps', () => {
    const parsed = parseSubtitle(srt);
    const corrected = applyLinearCorrection(parsed.cues, {
      sourceStartMs: 0,
      correctedStartMs: 1_000,
      sourceEndMs: 100_000,
      correctedEndMs: 103_000,
    });
    expect(corrected[0].startMs).toBe(1_000);
    expect(corrected[1].startMs).toBe(52_000);
    expect(corrected[2].startMs).toBe(103_000);
    expect(corrected[1].endMs).toBeGreaterThan(corrected[1].startMs);
  });

  it('serializes valid timestamp syntax', () => {
    const parsed = parseSubtitle(srt);
    const output = serializeSubtitle(parsed);
    expect(output).toContain('00:00:50,000 --> 00:00:52,000');
    expect(output).toContain('Middle line');
  });

  it('parses WebVTT millisecond separators and omitted hours', () => {
    const parsed = parseSubtitle('WEBVTT\n\n01:14.800 --> 01:16.300\nCaption\n');
    expect(parsed.format).toBe('vtt');
    expect(parsed.cues[0].startMs).toBe(74_800);
    expect(parsed.cues[0].endMs).toBe(76_300);
  });

  it('round-trips named WebVTT cue identifiers, settings, STYLE, REGION, and NOTE blocks', () => {
    const source = `WEBVTT - captions\n\nSTYLE\n::cue { color: lime; }\n\nREGION\nid:fred\nwidth:40%\n\nNOTE editorial marker\nkeep this note\n\nintro\n00:00:01.000 --> 00:00:02.000 line:10% position:25% align:start\nCaption\n`;
    const parsed = parseSubtitle(source);
    expect(parsed.cues[0].id).toBe('intro');
    expect(parsed.cues[0].settings).toBe('line:10% position:25% align:start');
    const output = serializeSubtitle(parsed);
    expect(output).toContain('WEBVTT - captions');
    expect(output).toContain('STYLE\n::cue { color: lime; }');
    expect(output).toContain('REGION\nid:fred\nwidth:40%');
    expect(output).toContain('NOTE editorial marker\nkeep this note');
    expect(output).toContain('00:00:01.000 --> 00:00:02.000 line:10% position:25% align:start');
  });

  it('accepts millisecond and readable timestamp anchors', () => {
    expect(parseAnchorTime('74800')).toBe(74_800);
    expect(parseAnchorTime('01:14.800')).toBe(74_800);
    expect(parseAnchorTime('00:01:14.800')).toBe(74_800);
  });

  it('rejects non-finite and reversed anchors', () => {
    expect(() => parseAnchorTime('Infinity')).toThrow(/Invalid anchor time/);
    const cues = parseSubtitle(srt).cues;
    expect(() => applyLinearCorrection(cues, {
      sourceStartMs: 100_000,
      correctedStartMs: 0,
      sourceEndMs: 0,
      correctedEndMs: 100_000,
    })).toThrow(/late source anchor/i);
    expect(() => applyLinearCorrection(cues, {
      sourceStartMs: 0,
      correctedStartMs: 100_000,
      sourceEndMs: 100_000,
      correctedEndMs: 0,
    })).toThrow(/late corrected anchor/i);
  });

  it('rejects reversed cue timing in imported files', () => {
    expect(() => parseSubtitle('WEBVTT\n\n00:00:03.000 --> 00:00:02.000\nBad span\n')).toThrow(/end after it starts/i);
  });

  it('reports cues shifted below zero and refuses cues ending below zero', () => {
    const parsed = parseSubtitle('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nCaption\n');
    const corrected = applyLinearCorrection(parsed.cues, {
      sourceStartMs: 2_000,
      correctedStartMs: 0,
      sourceEndMs: 4_000,
      correctedEndMs: 2_000,
    });
    expect(countCuesShiftedBelowZero(corrected)).toBe(1);
    expect(serializeSubtitle({ ...parsed, cues: corrected })).toContain('00:00:00.000 --> 00:00:01.000');

    const fullyNegative = corrected.map((cue) => ({ ...cue, endMs: -1 }));
    expect(() => serializeSubtitle({ ...parsed, cues: fullyNegative })).toThrow(/below zero/i);
  });
});
