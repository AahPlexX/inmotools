const MAX_PEAKS = 100_000;

export type ObservedAxis = 'twoTheta' | 'd';

export interface ObservedPeak {
  readonly position: number;
  readonly intensity: number;
}

export interface ObservedPattern {
  readonly name: string;
  readonly xAxis: ObservedAxis;
  readonly peaks: readonly ObservedPeak[];
}

export interface ResidualPoint {
  readonly observedPosition: number;
  readonly matchedPosition: number;
  readonly delta: number;
  readonly intensity: number;
}

export interface ObservedPatternOptions {
  readonly xAxis: ObservedAxis;
}

function parseNumber(raw: string, context: string): number {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) {
    throw new RangeError(`Invalid numeric value "${raw}" ${context}.`);
  }
  return value;
}

/**
 * Parse a local two-column observed pattern (position, intensity). Lines
 * starting with '#' or '!' are skipped, as are blank lines. Separators:
 * whitespace, comma, or semicolon. Positions must be strictly ascending,
 * intensities non-negative, values finite. Bounded at 100k peaks.
 */
export function parseObservedPattern(filename: string, text: string, options: ObservedPatternOptions): ObservedPattern {
  if (typeof text !== 'string' || !text.trim()) throw new RangeError('Observed pattern file is empty.');
  const peaks: ObservedPeak[] = [];
  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]!.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const parts = line.split(/[\s,;]+/).filter(Boolean);
    if (parts.length < 2) throw new RangeError(`Line ${lineIndex + 1} of ${filename || 'input'} has fewer than two columns.`);
    const position = parseNumber(parts[0]!, `on line ${lineIndex + 1}`);
    const intensity = parseNumber(parts[1]!, `on line ${lineIndex + 1}`);
    if (intensity < 0) throw new RangeError(`Negative intensity on line ${lineIndex + 1}.`);
    if (peaks.length > 0 && position <= peaks[peaks.length - 1]!.position) {
      throw new RangeError(`Positions must be strictly ascending; line ${lineIndex + 1} is not after the previous line.`);
    }
    peaks.push({ position, intensity });
    if (peaks.length > MAX_PEAKS) throw new RangeError(`Observed pattern exceeds the ${MAX_PEAKS.toLocaleString()}-peak limit.`);
  }
  if (peaks.length === 0) throw new RangeError('Observed pattern contains no data points.');
  return { name: filename || 'observed pattern', xAxis: options.xAxis, peaks };
}

/**
 * Nearest-neighbour residuals between observed peak positions and a set of
 * simulated positions (same axis). delta = matched − observed.
 */
export function overlayResiduals(observed: ObservedPattern, simulatedPositions: readonly number[]): readonly ResidualPoint[] {
  return observed.peaks.map((peak) => {
    let best = Number.NaN;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const position of simulatedPositions) {
      const delta = position - peak.position;
      if (Math.abs(delta) < Math.abs(bestDelta)) {
        bestDelta = delta;
        best = position;
      }
    }
    return { observedPosition: peak.position, matchedPosition: best, delta: bestDelta, intensity: peak.intensity };
  });
}
