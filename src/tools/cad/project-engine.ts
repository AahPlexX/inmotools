import type { CadFeature, CadProject, CadProjectHistory } from './cad-types';

function createCadId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `cad-${uuid}`;
  return `cad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createCadProject(name = 'Untitled CAD project'): CadProject {
  const timestamp = nowIso();
  return {
    schemaVersion: 1,
    id: createCadId(),
    name,
    metadata: {
      title: name,
      creator: '',
      organization: '',
      description: '',
      revision: '',
      partNumber: '',
      projectNumber: '',
      material: '',
      rights: '',
      license: '',
      tags: [],
      createdAt: timestamp,
      modifiedAt: timestamp,
      custom: {},
    },
    units: { length: 'mm', angle: 'rad' },
    parameters: [],
    sketches: [],
    features: [],
    bodies: [],
    materials: [],
    configurations: [],
    components: [],
    assemblyRelations: [],
    namedViews: [],
    snapshots: [],
    viewport: {},
    exportDefaults: {},
  };
}

export function commitCadProject(
  history: CadProjectHistory,
  _label: string,
  mutate: (project: CadProject) => CadProject,
): CadProjectHistory {
  const next = mutate(history.present);
  if (next === history.present) return history;
  const past = [...history.past, history.present].slice(-Math.max(1, history.limit));
  return {
    ...history,
    past,
    present: {
      ...next,
      metadata: { ...next.metadata, modifiedAt: nowIso() },
    },
    future: [],
  };
}

export function undoCadProject(history: CadProjectHistory): CadProjectHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoCadProject(history: CadProjectHistory): CadProjectHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    ...history,
    past: [...history.past, history.present].slice(-Math.max(1, history.limit)),
    present: next,
    future: history.future.slice(1),
  };
}

export function featureDependencyClosure(project: CadProject, seedIds: readonly string[]): Set<string> {
  const closure = new Set(seedIds.filter((id) => project.features.some((feature) => feature.id === id)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const feature of project.features) {
      if (closure.has(feature.id)) continue;
      if (feature.dependsOn.some((dependencyId) => closure.has(dependencyId))) {
        closure.add(feature.id);
        changed = true;
      }
    }
  }
  return closure;
}

function updateFeatureStatuses(project: CadProject, affectedIds: Set<string>): CadProject {
  return {
    ...project,
    features: project.features.map((feature) => {
      if (!affectedIds.has(feature.id) || feature.suppressed) return feature;
      return { ...feature, status: 'dirty' as const, diagnostic: null };
    }),
  };
}

export function markFeatureDirty(project: CadProject, featureId: string): CadProject {
  return updateFeatureStatuses(project, featureDependencyClosure(project, [featureId]));
}

export function setFeatureSuppressed(project: CadProject, featureId: string, suppressed: boolean): CadProject {
  const featureExists = project.features.some((feature) => feature.id === featureId);
  if (!featureExists) return project;
  const affected = featureDependencyClosure(project, [featureId]);
  return {
    ...project,
    features: project.features.map((feature) => {
      if (feature.id === featureId) {
        return {
          ...feature,
          suppressed,
          status: suppressed ? 'suppressed' as const : 'dirty' as const,
          diagnostic: null,
        };
      }
      if (affected.has(feature.id) && !feature.suppressed) {
        return { ...feature, status: 'dirty' as const, diagnostic: null };
      }
      return feature;
    }),
  };
}

function reorderedFeatures(project: CadProject, featureId: string, targetIndex: number): CadFeature[] | null {
  const currentIndex = project.features.findIndex((feature) => feature.id === featureId);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= project.features.length) return null;
  const next = [...project.features];
  const [feature] = next.splice(currentIndex, 1);
  if (!feature) return null;
  next.splice(targetIndex, 0, feature);
  return next;
}

function hasValidDependencyOrder(features: readonly CadFeature[]): boolean {
  const indices = new Map(features.map((feature, index) => [feature.id, index] as const));
  for (const feature of features) {
    const featureIndex = indices.get(feature.id);
    if (featureIndex === undefined) return false;
    for (const dependencyId of feature.dependsOn) {
      const dependencyIndex = indices.get(dependencyId);
      if (dependencyIndex === undefined || dependencyIndex >= featureIndex) return false;
    }
  }
  return true;
}

export function canReorderFeature(project: CadProject, featureId: string, targetIndex: number): boolean {
  const next = reorderedFeatures(project, featureId, targetIndex);
  return Boolean(next && hasValidDependencyOrder(next));
}

export function reorderFeature(project: CadProject, featureId: string, targetIndex: number): CadProject {
  const next = reorderedFeatures(project, featureId, targetIndex);
  if (!next) throw new Error('Feature or target index does not exist.');
  if (!hasValidDependencyOrder(next)) throw new Error('Feature reorder would violate a dependency.');
  const order = new Map(next.map((feature, index) => [feature.id, index] as const));
  return {
    ...project,
    features: next,
    bodies: project.bodies.map((body) => ({
      ...body,
      featureIds: [...body.featureIds].sort((left, right) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER)),
    })),
  };
}
