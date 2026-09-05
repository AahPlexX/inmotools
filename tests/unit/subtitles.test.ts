import { describe, expect, it } from 'vitest';
import { applyLinearCorrection, parseSubtitle, serializeSubtitle } from '../../src/tools/subtitles/subtitle-engine';

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

  it('parses WebVTT millisecond separators', () => {
    const parsed = parseSubtitle('WEBVTT\n\n00:00:01.250 --> 00:00:03.500\nCaption\n');
    expect(parsed.format).toBe('vtt');
    expect(parsed.cues[0].startMs).toBe(1250);
  });

  it('parses WebVTT cues that omit the optional hours component', () => {
    const parsed = parseSubtitle('WEBVTT\n\n01:14.800 --> 01:16.300\nShort-form timestamp\n');
    expect(parsed.cues[0].startMs).toBe(74_800);
    expect(parsed.cues[0].endMs).toBe(76_300);
  });

  it('round-trips named WebVTT cue identifiers through serialization', () => {
    const parsed = parseSubtitle('WEBVTT\n\nintro\n00:00:01.000 --> 00:00:02.000\nCaption\n');
    expect(parsed.cues[0].id).toBe('intro');
    const output = serializeSubtitle(parsed);
    expect(output).toContain('intro\n00:00:01.000 --> 00:00:02.000');
  });
});
