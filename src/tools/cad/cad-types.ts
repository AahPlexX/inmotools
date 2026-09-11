export type CadFeatureType =
  | 'sketch'
  | 'primitive'
  | 'extrude'
  | 'revolve'
  | 'sweep'
  | 'loft'
  | 'boolean'
  | 'hole'
  | 'fillet'
  | 'chamfer'
  | 'shell'
  | 'thicken'
  | 'draft'
  | 'offset'
  | 'split'
  | 'rib'
  | 'mirror'
  | 'pattern'
  | 'helix'
  | 'thread'
  | 'text'
  | 'transform'
  | 'datum-plane'
  | 'datum-axis'
  | 'surface'
  | 'heal';

export type CadFeatureStatus = 'clean' | 'dirty' | 'building' | 'failed' | 'blocked' | 'suppressed';

export interface CadProjectMetadata {
  title: string;
  creator: string;
  organization: string;
  description: string;
  revision: string;
  partNumber: string;
  projectNumber: string;
  material: string;
  rights: string;
  license: string;
  tags: string[];
  createdAt: string;
  modifiedAt: string;
  custom: Record<string, string>;
}

export interface CadTopologyRefRecord {
  id: string;
  producerFeatureId: string;
  kind: 'face' | 'edge' | 'vertex';
  role: string;
}

export interface CadFeature {
  id: string;
  label: string;
  type: CadFeatureType;
  bodyId: string | null;
  dependsOn: string[];
  topologyRefs: CadTopologyRefRecord[];
  parameters: Record<string, unknown>;
  suppressed: boolean;
  status: CadFeatureStatus;
  diagnostic: string | null;
}

export interface CadBody {
  id: string;
  label: string;
  featureIds: string[];
  visible: boolean;
}

export interface CadProject {
  schemaVersion: 1;
  id: string;
  name: string;
  metadata: CadProjectMetadata;
  units: {
    length: 'mm';
    angle: 'rad';
  };
  parameters: Record<string, unknown>[];
  sketches: Record<string, unknown>[];
  features: CadFeature[];
  bodies: CadBody[];
  materials: Record<string, unknown>[];
  configurations: Record<string, unknown>[];
  components: Record<string, unknown>[];
  assemblyRelations: Record<string, unknown>[];
  namedViews: Record<string, unknown>[];
  snapshots: Record<string, unknown>[];
  viewport: Record<string, unknown>;
  exportDefaults: Record<string, unknown>;
}

export interface CadProjectHistory {
  past: CadProject[];
  present: CadProject;
  future: CadProject[];
  limit: number;
}
