import { describe, expect, it } from 'vitest';
import {
  createStarterTacticalProject,
  validateTacticalProject,
} from '../../src/tools/tactics/tactics-engine';

describe('Tactical project timeline validation', () => {
  it('surfaces timeline duration and marker violations through project validation', () => {
    const project = createStarterTacticalProject();
    project.timeline.playheadMs = project.timeline.durationMs + 1;
    project.timeline.markers.push({
      id: 'late-marker',
      timeMs: project.timeline.durationMs + 2,
      kind: 'coaching-cue',
      label: 'Late',
    });
    const errors = validateTacticalProject(project);
    expect(errors).toContainEqual(expect.stringMatching(/playhead.*exceeds.*duration/i));
    expect(errors).toContainEqual(expect.stringMatching(/marker.*late-marker.*exceeds.*duration/i));
  });
});
