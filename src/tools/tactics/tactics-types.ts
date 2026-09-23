export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface PitchDimensions {
  lengthMeters: number;
  widthMeters: number;
}

export type ProvenanceKind = 'tool-default' | 'recommendation' | 'governing-source' | 'custom';

export interface SourceProvenance {
  kind: ProvenanceKind;
  authoritative: boolean;
  organization?: string;
  sourceTitle: string;
  sourceUrl?: string;
  sourceVersion?: string;
  sourceDate?: string;
  note?: string;
}

export interface PitchRuleProfile {
  id: string;
  label: string;
  format: string;
  teamSize: number;
  editable: boolean;
  ageGroup?: string;
  dimensions?: PitchDimensions;
  dimensionRange?: {
    minLengthMeters: number;
    maxLengthMeters: number;
    minWidthMeters: number;
    maxWidthMeters: number;
  };
  goalDimensions?: { widthMeters: number; heightMeters: number };
  goalkeeperStatus?: 'included' | 'excluded' | 'optional';
  specialLines?: string[];
  restartNotes?: string[];
  provenance: SourceProvenance;
}

export interface FormationTemplate {
  id: string;
  label: string;
  teamSize: number;
  goalkeepers: number;
  outfieldLines: number[];
  notation: string;
  notationIncludesGoalkeeper: boolean;
  positions?: NormalizedPoint[];
  provenance?: SourceProvenance;
}

export interface ProjectMetadata {
  title: string;
  description: string;
  creator: string;
  club: string;
  ageGroup: string;
  sessionType: string;
  tacticalTheme: string;
  tags: string[];
  rights: string;
  license: string;
  language: string;
  createdAt: string;
  modifiedAt: string;
  notes: string;
}

export interface TacticalPitch {
  profileId: string;
  dimensions: PitchDimensions;
  direction: 'left-to-right' | 'right-to-left';
  overlays: Array<{
    id: string;
    kind: 'line' | 'zone';
    label: string;
    points: NormalizedPoint[];
    provenance?: SourceProvenance;
  }>;
}

export interface RosterPlayer {
  id: string;
  displayName: string;
  jerseyNumber?: string;
  role?: string;
  status: 'active' | 'substitute' | 'neutral' | 'coach';
  ageOrDevelopmentTag?: string;
  avatarAssetId?: string;
}

export interface TacticalTeam {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  roster: RosterPlayer[];
}

export interface PlayerToken {
  id: string;
  playerId: string;
  teamId: string;
  sceneId: string;
  layerId: string;
  position: NormalizedPoint;
  rotationDeg: number;
  visible: boolean;
  locked: boolean;
}

export interface TacticalOfficial {
  id: string;
  role: string;
  sceneId: string;
  layerId: string;
  position: NormalizedPoint;
}

export interface TacticalEquipment {
  id: string;
  kind: string;
  sceneId: string;
  layerId: string;
  position: NormalizedPoint;
  rotationDeg: number;
  scale: number;
  visible: boolean;
  locked: boolean;
}

export type TacticalObjectKind =
  | 'player'
  | 'ball'
  | 'official'
  | 'equipment'
  | 'annotation'
  | 'vector'
  | 'zone';

export interface TacticalObject {
  id: string;
  kind: TacticalObjectKind;
  layerId: string;
  position: NormalizedPoint;
  rotationDeg: number;
  visible: boolean;
  locked: boolean;
}

export interface TacticalLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface TacticalScene {
  id: string;
  name: string;
  startMs: number;
  durationMs: number;
  layers: TacticalLayer[];
  objects: TacticalObject[];
}

export type InterpolationKind =
  | 'linear'
  | 'smooth'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'cubic-bezier'
  | 'hold';

export type TacticalMotionPathKind = 'linear' | 'quadratic-bezier' | 'cubic-bezier';

export interface TacticalMotionPath {
  kind: TacticalMotionPathKind;
  controlPoints: NormalizedPoint[];
}
export interface TacticalKeyframe {
  id: string;
  timeMs: number;
  position?: NormalizedPoint;
  rotationDeg?: number;
  visible?: boolean;
  interpolation: InterpolationKind;
  bezier?: [number, number, number, number];
  motionPath?: TacticalMotionPath;
}

export interface TimelineTrack {
  id: string;
  targetId: string;
  keyframes: TacticalKeyframe[];
}

export interface TimelineMarker {
  id: string;
  timeMs: number;
  kind: string;
  label: string;
}

export interface BallPossessionEvent {
  id: string;
  timeMs: number;
  holderTargetId: string | null;
}
export interface TacticalTimeline {
  playheadMs: number;
  durationMs: number;
  loop: boolean;
  playbackRate: number;
  tracks: TimelineTrack[];
  markers: TimelineMarker[];
  possessionEvents?: BallPossessionEvent[];
}

export interface FormationState {
  id: string;
  label: string;
  teamId: string;
  timeMs: number;
  playerPositions: Record<string, NormalizedPoint>;
}

export interface BallState {
  position: NormalizedPoint;
  elevationMeters: number;
  attachedToPlayerId: string | null;
}

export interface TacticalAnnotation {
  id: string;
  kind: string;
  label?: string;
  sceneId: string;
  layerId: string;
  points: NormalizedPoint[];
  startMs?: number;
  endMs?: number;
  provenance?: SourceProvenance;
}

export interface CameraState {
  id: string;
  timeMs: number;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fieldOfViewDeg: number;
}

export interface AnalysisSettings {
  includeGoalkeepers: boolean;
  distanceUnit: 'metric' | 'imperial';
  passingLaneRadiusMeters: number;
  visionSectorDeg: number;
}

export interface CoachingSessionPlan {
  ageOrDevelopmentLevel: string;
  playerCount: number;
  dimensions: string;
  equipment: string[];
  objective: string;
  setup: string;
  coachingCues: string[];
  progressions: string[];
  regressions: string[];
  durationMinutes: number;
  notes: string;
}

export interface LocalMediaReference {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  durationMs?: number;
  blob?: Blob;
}

export interface ImportProvenance {
  sourceType: 'project-json' | 'project-zip' | 'trajectory-csv' | 'trajectory-json' | 'local-media';
  sourceName: string;
  importedAt: string;
  note?: string;
}

export interface ExportPreferences {
  aspect: 'landscape' | 'portrait' | 'square';
  width: number;
  height: number;
  frameRate: number;
  quality: number;
}

export interface TacticalProject {
  schemaVersion: number;
  id: string;
  metadata: ProjectMetadata;
  ruleset: PitchRuleProfile;
  pitch: TacticalPitch;
  teams: TacticalTeam[];
  playerTokens: PlayerToken[];
  officials: TacticalOfficial[];
  equipment: TacticalEquipment[];
  scenes: TacticalScene[];
  formationStates: FormationState[];
  ball: BallState;
  annotations: TacticalAnnotation[];
  timeline: TacticalTimeline;
  cameraStates: CameraState[];
  analysisSettings: AnalysisSettings;
  sessionPlan: CoachingSessionPlan;
  media: LocalMediaReference[];
  importProvenance: ImportProvenance[];
  exportPreferences: ExportPreferences;
}
