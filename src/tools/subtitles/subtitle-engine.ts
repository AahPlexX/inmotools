export type SubtitleFormat = 'srt' | 'vtt';

export interface SubtitleCue {
  id?: string;
  startMs: number;
  endMs: number;
  text: string;
  settings?: string;
}

export interface VttRawBlock {
  /** Number of parsed cues that precede this block. */
  beforeCueIndex: number;
  text: string;
}

export interface ParsedSubtitle {
  format: SubtitleFormat;
  cues: SubtitleCue[];
  vttHeader?: string;
  vttRawBlocks?: VttRawBlock[];
}

export interface CorrectionAnchors {
  sourceStartMs: number;
  correctedStartMs: number;
  sourceEndMs: number;
  correctedEndMs: number;
}

function parseTimestamp(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length !== 2 && parts.length !== 3) throw new Error(`Invalid timestamp: ${value}`);
  if (!parts.every((part) => /^\d+(?:\.\d+)?$/.test(part))) throw new Error(`Invalid timestamp: ${value}`);

  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  const minutes = Number(parts[parts.length - 2]);
  const seconds = Number(parts[parts.length - 1]);
  if (![hours, minutes, seconds].every(Number.isFinite)) throw new Error(`Invalid timestamp: ${value}`);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

export function parseAnchorTime(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Anchor time is required.');
  if (trimmed.includes(':')) return parseTimestamp(trimmed);
  const milliseconds = Number(trimmed);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error(`Invalid anchor time: ${value}`);
  return Math.round(milliseconds);
}

function formatTimestamp(ms: number, format: SubtitleFormat): string {
  if (!Number.isFinite(ms)) throw new Error('Cue timestamps must be finite numbers.');
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  const sep = format === 'srt' ? ',' : '.';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${sep}${String(millis).padStart(3, '0')}`;
}

function isVttRawBlock(block: string) {
  const firstLine = block.split(/\r?\n/, 1)[0]?.trim() ?? '';
  return /^(?:NOTE(?:\s|$)|STYLE$|REGION$)/.test(firstLine);
}

function parseTimingLine(line: string) {
  const match = line.match(/^\s*(\S+)\s+-->\s+(\S+)(?:\s+(.*?))?\s*$/);
  if (!match) throw new Error(`Invalid cue timing line: ${line}`);
  return { start: match[1], end: match[2], settings: match[3]?.trim() || undefined };
}

function validateCue(cue: SubtitleCue, index: number) {
  if (!Number.isFinite(cue.startMs) || !Number.isFinite(cue.endMs)) throw new Error(`Cue ${index + 1} has a non-finite timestamp.`);
  if (cue.startMs < 0) return;
  if (cue.endMs <= cue.startMs) throw new Error(`Cue ${index + 1} must end after it starts.`);
}

export function parseSubtitle(input: string): ParsedSubtitle {
  const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const format: SubtitleFormat = /^WEBVTT(?:\s|$)/.test(normalized) ? 'vtt' : 'srt';
  let body = normalized;
  let vttHeader: string | undefined;

  if (format === 'vtt') {
    const firstBreak = normalized.indexOf('\n');
    vttHeader = (firstBreak >= 0 ? normalized.slice(0, firstBreak) : normalized).trimEnd();
    body = firstBreak >= 0 ? normalized.slice(firstBreak + 1) : '';
  }

  const cues: SubtitleCue[] = [];
  const vttRawBlocks: VttRawBlock[] = [];
  const blocks = body.trim().split(/\n\s*\n/).filter(Boolean);

  for (const block of blocks) {
    if (format === 'vtt' && isVttRawBlock(block)) {
      vttRawBlocks.push({ beforeCueIndex: cues.length, text: block });
      continue;
    }

    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => /\s-->\s/.test(line));
    if (timingIndex < 0) {
      if (format === 'vtt') vttRawBlocks.push({ beforeCueIndex: cues.length, text: block });
      continue;
    }
    if (timingIndex > 1) throw new Error('A cue may contain at most one identifier line before its timing line.');

    const timing = parseTimingLine(lines[timingIndex]);
    const cue: SubtitleCue = {
      id: timingIndex === 1 ? lines[0] : undefined,
      startMs: parseTimestamp(timing.start),
      endMs: parseTimestamp(timing.end),
      text: lines.slice(timingIndex + 1).join('\n'),
      settings: format === 'vtt' ? timing.settings : undefined,
    };
    validateCue(cue, cues.length);
    cues.push(cue);
  }

  return { format, cues, vttHeader, vttRawBlocks };
}

function validateAnchors(anchors: CorrectionAnchors) {
  const values = Object.values(anchors);
  if (!values.every(Number.isFinite)) throw new Error('All anchor times must be finite numbers.');
  if (values.some((value) => value < 0)) throw new Error('Anchor times cannot be negative.');
  if (anchors.sourceEndMs <= anchors.sourceStartMs) throw new Error('The late source anchor must be after the early source anchor.');
  if (anchors.correctedEndMs <= anchors.correctedStartMs) throw new Error('The late corrected anchor must be after the early corrected anchor.');
}

export function applyLinearCorrection(cues: SubtitleCue[], anchors: CorrectionAnchors): SubtitleCue[] {
  validateAnchors(anchors);
  const span = anchors.sourceEndMs - anchors.sourceStartMs;
  const correctedSpan = anchors.correctedEndMs - anchors.correctedStartMs;
  const slope = correctedSpan / span;
  if (!Number.isFinite(slope) || slope <= 0) throw new Error('Correction slope must be a positive finite number.');

  const map = (ms: number) => Math.round(anchors.correctedStartMs + (ms - anchors.sourceStartMs) * slope);
  return cues.map((cue, index) => {
    if (!Number.isFinite(cue.startMs) || !Number.isFinite(cue.endMs) || cue.endMs <= cue.startMs) {
      throw new Error(`Cue ${index + 1} has an invalid source span.`);
    }
    const corrected = { ...cue, startMs: map(cue.startMs), endMs: map(cue.endMs) };
    if (!Number.isFinite(corrected.startMs) || !Number.isFinite(corrected.endMs) || corrected.endMs <= corrected.startMs) {
      throw new Error(`Cue ${index + 1} would have an invalid corrected span.`);
    }
    return corrected;
  });
}

export function countCuesShiftedBelowZero(cues: SubtitleCue[]): number {
  return cues.filter((cue) => cue.startMs < 0).length;
}

export function serializeSubtitle(parsed: ParsedSubtitle): string {
  parsed.cues.forEach((cue, index) => {
    validateCue(cue, index);
    if (cue.endMs <= 0) throw new Error(`Cue ${index + 1} ends at or below zero after correction and cannot be serialized safely.`);
  });

  if (parsed.format === 'srt') {
    const blocks = parsed.cues.map((cue, index) => {
      const timing = `${formatTimestamp(cue.startMs, 'srt')} --> ${formatTimestamp(cue.endMs, 'srt')}`;
      return `${index + 1}\n${timing}\n${cue.text}`;
    });
    return `${blocks.join('\n\n')}\n`;
  }

  const blocks: string[] = [];
  const rawBlocks = parsed.vttRawBlocks ?? [];
  for (let cueIndex = 0; cueIndex <= parsed.cues.length; cueIndex += 1) {
    for (const raw of rawBlocks.filter((block) => block.beforeCueIndex === cueIndex)) blocks.push(raw.text);
    if (cueIndex >= parsed.cues.length) continue;
    const cue = parsed.cues[cueIndex];
    const settings = cue.settings ? ` ${cue.settings}` : '';
    const timing = `${formatTimestamp(cue.startMs, 'vtt')} --> ${formatTimestamp(cue.endMs, 'vtt')}${settings}`;
    blocks.push(cue.id ? `${cue.id}\n${timing}\n${cue.text}` : `${timing}\n${cue.text}`);
  }
  return `${parsed.vttHeader || 'WEBVTT'}\n\n${blocks.join('\n\n')}\n`;
}
