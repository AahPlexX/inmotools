import type { CadFeature, CadProject } from './cad-types';
import type { CadKernelBodyResult } from './kernel-contract';
import type { CadSketch } from './sketch-types';

/**
 * Milestone A selection model: viewport and tree both operate on the same
 * selection, addressed by kind + id rather than duplicating per-surface
 * state. Face/edge/vertex sub-shape selection is a later milestone.
 */
export type CadSelectionKind = 'feature' | 'body' | 'sketch';

export interface CadSelection {
  kind: CadSelectionKind;
  id: string;
}

export interface CadViewportProps {
  /** Tessellated bodies from the most recent successful rebuild. Never a live kernel handle (invariant #2). */
  bodies: readonly CadKernelBodyResult[];
  selection: CadSelection | null;
  onSelectBody(bodyId: string | null): void;
  /** True while a rebuild request is in flight; the viewport keeps showing the last-good bodies (invariant #5). */
  rebuilding: boolean;
}

export interface CadTreeProps {
  project: CadProject;
  selection: CadSelection | null;
  onSelectFeature(featureId: string | null): void;
  onToggleSuppressed(featureId: string, suppressed: boolean): void;
  onSelectSketch(sketchId: string | null): void;
}

export interface CadInspectorProps {
  project: CadProject;
  selection: CadSelection | null;
  onParameterChange(featureId: string, key: string, value: unknown): void;
}

export function selectedFeature(project: CadProject, selection: CadSelection | null): CadFeature | null {
  if (!selection || selection.kind !== 'feature') return null;
  return project.features.find((feature) => feature.id === selection.id) ?? null;
}

export function selectedSketch(project: CadProject, selection: CadSelection | null): CadSketch | null {
  if (!selection || selection.kind !== 'sketch') return null;
  return project.sketches.find((sketch) => sketch.id === selection.id) ?? null;
}

export interface CadSketchViewerProps {
  sketch: CadSketch;
  selectedEntityId: string | null;
  onSelectEntity(entityId: string | null): void;
}
