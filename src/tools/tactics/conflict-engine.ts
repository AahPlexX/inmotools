import { sampleTacticalTimeline } from './timeline-engine';
import type { PitchDimensions, TacticalTimeline } from './tactics-types';

export interface PotentialPathConflict {
  targetA: string;
  targetB: string;
  timeMs: number;
  distanceMeters: number;
}

export interface PathConflictOptions {
  stepMs: number;
  thresholdMeters: number;
  targetIds?: string[];
}

function requirePositiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
  return value;
}

function physicalDistance(
  left: { x: number; y: number },
  right: { x: number; y: number },
  pitch: PitchDimensions,
): number {
  const dx = (left.x - right.x) * pitch.lengthMeters;
  const dy = (left.y - right.y) * pitch.widthMeters;
  return Math.hypot(dx, dy);
}

function conflictTargets(
  timeline: TacticalTimeline,
  requested?: string[],
): string[] {
  const available = new Set(timeline.tracks.map((track) => track.targetId));
  const raw = requested ?? [...available].filter((targetId) => targetId !== 'ball');
  const unique = [...new Set(raw.map((targetId) => targetId.trim()).filter(Boolean))].sort();
  for (const targetId of unique) {
    if (!available.has(targetId)) {
      throw new Error(`Conflict target ${targetId} does not exist in the timeline.`);
    }
  }
  return unique;
}

export function findPotentialPathConflicts(
  timeline: TacticalTimeline,
  pitch: PitchDimensions,
  options: PathConflictOptions,
): PotentialPathConflict[] {
  const stepMs = requirePositiveFinite(options.stepMs, 'Conflict sample step');
  if (!Number.isInteger(stepMs)) {
    throw new RangeError('Conflict sample step must be an integer millisecond value.');
  }
  const thresholdMeters = requirePositiveFinite(options.thresholdMeters, 'Conflict threshold');
  requirePositiveFinite(pitch.lengthMeters, 'Pitch length');
  requirePositiveFinite(pitch.widthMeters, 'Pitch width');

  const targets = conflictTargets(timeline, options.targetIds);
  const conflicts: PotentialPathConflict[] = [];
  const sampleTimes: number[] = [];
  for (let timeMs = 0; timeMs <= timeline.durationMs; timeMs += stepMs) {
    sampleTimes.push(timeMs);
  }
  if (sampleTimes.at(-1) !== timeline.durationMs) sampleTimes.push(timeline.durationMs);

  for (const timeMs of sampleTimes) {
    const sampled = sampleTacticalTimeline(timeline, timeMs);
    for (let leftIndex = 0; leftIndex < targets.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < targets.length; rightIndex += 1) {
        const targetA = targets[leftIndex]!;
        const targetB = targets[rightIndex]!;
        const left = sampled[targetA]?.position;
        const right = sampled[targetB]?.position;
        if (!left || !right) continue;
        const distanceMeters = physicalDistance(left, right, pitch);
        if (distanceMeters <= thresholdMeters) {
          conflicts.push({ targetA, targetB, timeMs, distanceMeters });
        }
      }
    }
  }
  return conflicts;
}
