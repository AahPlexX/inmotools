export type SubtitleFormat = 'srt' | 'vtt';
export interface SubtitleCue { id?: string; startMs: number; endMs: number; text: string }
export interface ParsedSubtitle { format: SubtitleFormat; cues: SubtitleCue[] }
export interface CorrectionAnchors { sourceStartMs: number; correctedStartMs: number; sourceEndMs: number; correctedEndMs: number }

function parseTimestamp(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length !== 3) throw new Error(`Invalid timestamp: ${value}`);
  const seconds = Number(parts[2]);
  return Math.round((Number(parts[0]) * 3600 + Number(parts[1]) * 60 + seconds) * 1000);
}

function formatTimestamp(ms: number, format: SubtitleFormat): string {
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  const sep = format === 'srt' ? ',' : '.';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${sep}${String(millis).padStart(3, '0')}`;
}

export function parseSubtitle(input: string): ParsedSubtitle {
  const format: SubtitleFormat = /^WEBVTT\b/m.test(input) ? 'vtt' : 'srt';
  const body = format === 'vtt' ? input.replace(/^WEBVTT[^\n]*\n+/i, '') : input;
  const cues: SubtitleCue[] = [];
  for (const block of body.trim().split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/);
    let timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) continue;
    const [start, end] = lines[timingIndex].split('-->').map((part) => part.trim().split(/\s+/)[0]);
    cues.push({
      id: timingIndex > 0 ? lines[0] : undefined,
      startMs: parseTimestamp(start), endMs: parseTimestamp(end),
      text: lines.slice(timingIndex + 1).join('\n'),
    });
  }
  return { format, cues };
}

export function applyLinearCorrection(cues: SubtitleCue[], anchors: CorrectionAnchors): SubtitleCue[] {
  const span = anchors.sourceEndMs - anchors.sourceStartMs;
  if (span === 0) throw new Error('Anchor source times must differ.');
  const correctedSpan = anchors.correctedEndMs - anchors.correctedStartMs;
  const slope = correctedSpan / span;
  const map = (ms: number) => Math.round(anchors.correctedStartMs + (ms - anchors.sourceStartMs) * slope);
  return cues.map((cue) => ({ ...cue, startMs: map(cue.startMs), endMs: map(cue.endMs) }));
}

export function serializeSubtitle(parsed: ParsedSubtitle): string {
  const blocks = parsed.cues.map((cue, index) => {
    const timing = `${formatTimestamp(cue.startMs, parsed.format)} --> ${formatTimestamp(cue.endMs, parsed.format)}`;
    return parsed.format === 'srt' ? `${index + 1}\n${timing}\n${cue.text}` : `${timing}\n${cue.text}`;
  });
  return `${parsed.format === 'vtt' ? 'WEBVTT\n\n' : ''}${blocks.join('\n\n')}\n`;
}
