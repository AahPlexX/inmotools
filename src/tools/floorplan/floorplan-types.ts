export type WallState = 'existing' | 'new_construction' | 'demolition';
export type WallMaterial = 'drywall_stud' | 'concrete_masonry' | 'glass_partition' | 'brick';
export type OpeningType =
  | 'door_single'
  | 'door_double'
  | 'door_pocket'
  | 'door_bifold'
  | 'door_sliding'
  | 'window_casement'
  | 'window_double_hung'
  | 'cased_opening';
export type ComponentCategory = 'living' | 'bedroom' | 'dining' | 'kitchen_bath' | 'office' | 'mep';
export type FinishMaterial = 'hardwood' | 'porcelain_tile' | 'polished_concrete' | 'carpet' | 'none';

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface HostedOpening {
  readonly id: string;
  readonly type: OpeningType;
  readonly offsetRatio: number;
  readonly width: number;
  readonly nominalHeight: number;
  readonly sillHeight: number;
  readonly flipSide: boolean;
  readonly flipHand: boolean;
}

export interface WallSegment {
  readonly id: string;
  readonly startVertexId: string;
  readonly endVertexId: string;
  readonly thickness: number;
  readonly height: number;
  readonly state: WallState;
  readonly material: WallMaterial;
  readonly isLoadBearing: boolean;
  readonly openings: readonly HostedOpening[];
}

export interface WallVertex {
  readonly id: string;
  readonly position: Point2D;
  readonly connectedWallIds: readonly string[];
}

export interface ClearanceEnvelope {
  readonly shape: 'rectangle' | 'circle' | 'polygon';
  readonly dimensions: Point2D;
  readonly bufferOffset: number;
  readonly adaRuleKey?: 'ada_turning_circle' | 'ada_door_approach' | 'ada_fixture_clearance';
}

export interface PlanComponent {
  readonly id: string;
  readonly category: ComponentCategory;
  readonly symbolKey: string;
  readonly position: Point2D;
  readonly rotation: number;
  readonly scale: Point2D;
  readonly layerId: string;
  readonly clearance: ClearanceEnvelope;
}

export interface RoomFace {
  readonly id: string;
  readonly boundaryVertexIds: readonly string[];
  readonly name: string;
  readonly areaSqMeters: number;
  readonly areaSqFeet: number;
  readonly perimeterMeters: number;
  readonly centroid: Point2D;
  readonly finishMaterial: FinishMaterial;
}

export interface FloorplanLayer {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
}

export interface FloorplanViewport {
  readonly scale: number;
  readonly panX: number;
  readonly panY: number;
  readonly gridMm: number;
}

export interface FloorplanDimension {
  readonly id: string;
  readonly start: Point2D;
  readonly end: Point2D;
  readonly label?: string;
  readonly layerId: string;
}

export interface FloorplanProject {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly scaleNotation: string;
  readonly vertices: readonly WallVertex[];
  readonly walls: readonly WallSegment[];
  readonly components: readonly PlanComponent[];
  readonly rooms: readonly RoomFace[];
  readonly dimensions: readonly FloorplanDimension[];
  readonly layers: readonly FloorplanLayer[];
  readonly viewport: FloorplanViewport;
  readonly selectedId?: string;
  readonly updatedAt: string;
}

export interface ProjectSnapshot {
  readonly label: string;
  readonly project: FloorplanProject;
}

export interface ProjectHistory {
  readonly past: readonly ProjectSnapshot[];
  readonly present: FloorplanProject;
  readonly future: readonly ProjectSnapshot[];
}

export interface ViewTransform {
  readonly scale: number;
  readonly panX: number;
  readonly panY: number;
}

export interface PolygonMetrics {
  readonly signedAreaSqMm: number;
  readonly areaSqMm: number;
  readonly areaSqMeters: number;
  readonly areaSqFeet: number;
  readonly perimeterMm: number;
  readonly perimeterMeters: number;
  readonly centroid: Point2D;
}
