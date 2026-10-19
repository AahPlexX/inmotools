import { sampleTacticalProjectAtTime } from './timeline-engine';
import { applyPresentationVisibility } from './presentation-authoring-engine';
import type { SceneTransition, TacticalProject, TacticalScene } from './tactics-types';

export function chapterScenes(project: TacticalProject): TacticalScene[] {
  return [...project.scenes].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
}

export function hasChapterTransitions(project: TacticalProject): boolean {
  return project.scenes.some(scene => scene.transition !== undefined);
}

export function validateChapterTransitions(project: TacticalProject): string[] {
  const errors: string[] = [];
  if (!hasChapterTransitions(project)) return errors;
  const scenes = chapterScenes(project);
  for (const [index, scene] of scenes.entries()) {
    if (!Number.isInteger(scene.startMs) || scene.startMs < 0 || !Number.isInteger(scene.durationMs)
      || scene.durationMs <= 0 || scene.startMs + scene.durationMs > project.timeline.durationMs) {
      errors.push(`Scene ${scene.id} transition playback needs a positive scene interval within the timeline.`);
    }
    if (index > 0 && scenes[index - 1]!.startMs + scenes[index - 1]!.durationMs > scene.startMs) {
      errors.push('Chapter transitions require non-overlapping scenes.');
    }
    const transition = scene.transition;
    if (transition === undefined) continue;
    const next = scenes[index + 1];
    if (!next || scene.startMs + scene.durationMs !== next.startMs) {
      errors.push(`Scene ${scene.id} transition needs a next contiguous scene.`);
    }
    if (!transition || !['cut', 'fade', 'morph'].includes(transition.kind)
      || !Number.isInteger(transition.durationMs) || transition.durationMs < 0
      || transition.durationMs > scene.durationMs
      || (transition.kind === 'cut' ? transition.durationMs !== 0 : transition.durationMs < 1)) {
      errors.push(`Scene ${scene.id} transition kind or duration is invalid.`);
    }
  }
  return errors;
}

export function setSceneTransition(project: TacticalProject, sceneId: string, transition: SceneTransition | undefined): TacticalProject {
  if (!project.scenes.some(scene => scene.id === sceneId)) throw new Error('Transition scene does not exist.');
  const next = { ...project, scenes: project.scenes.map(scene => scene.id === sceneId ? { ...scene, transition: transition ? { ...transition } : undefined } : scene) };
  const errors = validateChapterTransitions(next);
  if (errors.length) throw new Error(errors.join(' '));
  return next;
}

/** Keep exit transitions attached to valid boundaries after scene editing. */
export function reconcileSceneTransitions(scenes: TacticalScene[]): TacticalScene[] {
  const ordered = [...scenes].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  const nextById = new Map(ordered.map((scene, index) => [scene.id, ordered[index + 1]]));
  return scenes.map(scene => {
    if (!scene.transition) return scene;
    const next = nextById.get(scene.id);
    const validBoundary = next && scene.startMs + scene.durationMs === next.startMs && scene.durationMs > 0;
    return { ...scene, transition: validBoundary ? { ...scene.transition, durationMs: Math.min(scene.transition.durationMs, scene.durationMs) } : undefined };
  });
}

export interface ChapterFrame {
  project: TacticalProject;
  sceneId: string;
  opacity: number;
}

export function sampleChapterFrame(project: TacticalProject, timeMs: number, fallbackSceneId: string): ChapterFrame {
  if (!Number.isInteger(timeMs) || timeMs < 0 || timeMs > project.timeline.durationMs) throw new RangeError('Chapter sample time must be an integer within the timeline.');
  if (!hasChapterTransitions(project)) return { project: sampleTacticalProjectAtTime(project, timeMs), sceneId: fallbackSceneId, opacity: 1 };
  const snapshot = (time: number) => applyPresentationVisibility(sampleTacticalProjectAtTime(project, time), time);
  const scenes = chapterScenes(project);
  const scene = scenes.findLast(candidate => candidate.startMs <= timeMs) ?? scenes[0];
  if (!scene) throw new Error('Chapter playback requires a scene.');
  const transition = scene.transition;
  const endMs = scene.startMs + scene.durationMs;
  const startMs = endMs - (transition?.durationMs ?? 0);
  const next = scenes[scenes.indexOf(scene) + 1];
  if (!transition || transition.kind === 'cut' || timeMs < startMs || !next || timeMs >= endMs) {
    return { project: snapshot(Math.min(timeMs, endMs)), sceneId: scene.id, opacity: 1 };
  }
  const progress = (timeMs - startMs) / transition.durationMs;
  const outgoing = snapshot(startMs);
  const incoming = snapshot(next.startMs);
  const arriving = progress >= 0.5;
  const base = arriving ? incoming : outgoing;
  const sceneId = arriving ? next.id : scene.id;
  if (transition.kind === 'fade') return { project: base, sceneId, opacity: Math.abs(1 - 2 * progress) };
  const rosterKey = (token: TacticalProject['playerTokens'][number]) => JSON.stringify([token.teamId, token.playerId]);
  const visible = (snapshot: TacticalProject, owner: string) => {
    const layers = new Set(snapshot.scenes.find(scene => scene.id === owner)?.layers.filter(layer => layer.visible).map(layer => layer.id));
    return new Map(snapshot.playerTokens.filter(token => token.sceneId === owner && token.visible && layers.has(token.layerId)).map(token => [rosterKey(token), token]));
  };
  const from = visible(outgoing, scene.id);
  const to = visible(incoming, next.id);
  const lerp = (a: number, b: number) => a + (b - a) * progress;
  return {
    sceneId,
    opacity: 1,
    project: {
      ...base,
      playerTokens: base.playerTokens.map(token => {
        if (token.sceneId !== sceneId) return token;
        const left = from.get(rosterKey(token)); const right = to.get(rosterKey(token));
        if (!left || !right) return token;
        const turn = ((right.rotationDeg - left.rotationDeg + 540) % 360 + 360) % 360 - 180;
        return { ...token, position: { x: lerp(left.position.x, right.position.x), y: lerp(left.position.y, right.position.y) }, rotationDeg: left.rotationDeg + turn * progress };
      }),
      ball: { ...base.ball, position: { x: lerp(outgoing.ball.position.x, incoming.ball.position.x), y: lerp(outgoing.ball.position.y, incoming.ball.position.y) }, elevationMeters: lerp(outgoing.ball.elevationMeters, incoming.ball.elevationMeters) },
    },
  };
}

export function chapterExportTimes(project: TacticalProject, uniform: number[], maxFrames: number): number[] {
  if (!hasChapterTransitions(project)) return uniform;
  const required = new Set([0, project.timeline.durationMs]);
  const scenes = chapterScenes(project);
  for (const [index, scene] of scenes.entries()) {
    const next = scenes[index + 1];
    if (!next) continue;
    const end = scene.startMs + scene.durationMs;
    const duration = scene.transition?.durationMs ?? 0;
    const cut = !scene.transition || scene.transition.kind === 'cut';
    for (const fraction of cut ? [] : [0, 0.25, 0.5, 0.75, 1]) {
      required.add(Math.round(end - duration + duration * fraction));
    }
    if (cut) { required.add(next.startMs); required.add(Math.max(0, next.startMs - 1)); }
  }
  if (required.size > maxFrames) throw new RangeError(`Chapter transitions need at least ${required.size} samples (frame cap ${maxFrames}). Use fewer chapters or a larger frame cap.`);
  for (const time of uniform) {
    if (required.size >= maxFrames) break;
    required.add(time);
  }
  return [...required].sort((a, b) => a - b);
}
