import type { ElkNode } from 'elkjs/lib/elk-api';
import type { LatticeGraphModel } from './graph-engine';

export type LatticeLayoutDirection = 'LR' | 'TB' | 'RL' | 'BT';

export interface LatticePoint {
  readonly x: number;
  readonly y: number;
}

export interface LatticeLayoutNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LatticeLayoutEdge {
  readonly id: string;
  readonly points: readonly LatticePoint[];
}

export interface LatticeLayoutModel {
  readonly bounds: { readonly width: number; readonly height: number };
  readonly nodes: Map<string, LatticeLayoutNode>;
  readonly edges: readonly LatticeLayoutEdge[];
}

export type ElkGraphRequest = ElkNode;

interface ElkPointLike {
  readonly x?: number;
  readonly y?: number;
}

interface ElkSectionLike {
  readonly startPoint?: ElkPointLike;
  readonly bendPoints?: readonly ElkPointLike[];
  readonly endPoint?: ElkPointLike;
}

interface ElkNodeLike {
  readonly id?: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

interface ElkEdgeLike {
  readonly id?: string;
  readonly sections?: readonly ElkSectionLike[];
}

export interface ElkLayoutLike {
  readonly id?: string;
  readonly width?: number;
  readonly height?: number;
  readonly children?: readonly ElkNodeLike[];
  readonly edges?: readonly ElkEdgeLike[];
}

const ROOT_ELK_ID = '$';
const toElkId = (path: string): string => path === '' ? ROOT_ELK_ID : path;
const fromElkId = (id: string): string => id === ROOT_ELK_ID ? '' : id;
const finite = (value: number | undefined): number => Number.isFinite(value) ? Number(value) : 0;

export const layoutDirectionOption = (direction: LatticeLayoutDirection): 'RIGHT' | 'DOWN' | 'LEFT' | 'UP' => {
  if (direction === 'LR') return 'RIGHT';
  if (direction === 'TB') return 'DOWN';
  if (direction === 'RL') return 'LEFT';
  return 'UP';
};

export const buildElkGraph = (graph: LatticeGraphModel, direction: LatticeLayoutDirection): ElkNode => ({
  id: 'lattice-root',
  layoutOptions: {
    'elk.algorithm': 'layered',
    'elk.direction': layoutDirectionOption(direction),
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.spacing.nodeNode': '36',
    'elk.layered.spacing.nodeNodeBetweenLayers': '72',
  },
  children: graph.nodes.map((node) => ({
    id: toElkId(node.path),
    width: 220,
    height: node.childCount > 0 ? 84 : 72,
  })),
  edges: graph.edges.map((edge) => ({
    id: edge.id,
    sources: [toElkId(edge.source)],
    targets: [toElkId(edge.target)],
  })),
});

const sectionPoints = (section: ElkSectionLike): LatticePoint[] => {
  const points: LatticePoint[] = [];
  if (section.startPoint) points.push({ x: finite(section.startPoint.x), y: finite(section.startPoint.y) });
  for (const bend of section.bendPoints ?? []) points.push({ x: finite(bend.x), y: finite(bend.y) });
  if (section.endPoint) points.push({ x: finite(section.endPoint.x), y: finite(section.endPoint.y) });
  return points;
};

export const normalizeElkLayout = (layout: ElkLayoutLike): LatticeLayoutModel => {
  const nodes = new Map<string, LatticeLayoutNode>();
  for (const node of layout.children ?? []) {
    if (node.id === undefined) continue;
    const id = fromElkId(node.id);
    nodes.set(id, {
      id,
      x: finite(node.x),
      y: finite(node.y),
      width: finite(node.width),
      height: finite(node.height),
    });
  }

  const edges: LatticeLayoutEdge[] = (layout.edges ?? []).map((edge, index) => {
    const points: LatticePoint[] = [];
    for (const section of edge.sections ?? []) {
      for (const point of sectionPoints(section)) {
        const previous = points[points.length - 1];
        if (!previous || previous.x !== point.x || previous.y !== point.y) points.push(point);
      }
    }
    return { id: edge.id ?? `edge-${index}`, points };
  });

  return {
    bounds: { width: finite(layout.width), height: finite(layout.height) },
    nodes,
    edges,
  };
};
