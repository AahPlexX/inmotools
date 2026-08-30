import { lazy, Suspense, type ComponentType } from 'react';
import type { ToolDefinition, ToolSlug } from '../catalog';
import { ToolLayout } from '../components/ToolLayout';

const workspaceLoaders: Record<ToolSlug, () => Promise<{ default: ComponentType }>> = {
  'exif-scrubber': () => import('./exif/ExifWorkspace'),
  'duckdb-workbench': () => import('./duckdb/DuckDbWorkspace'),
  'subtitle-drift': () => import('./subtitles/SubtitleWorkspace'),
  'hardware-packet-inspector': () => import('./hardware/HardwareWorkspace'),
  'fluid-type-matrix': () => import('./typography/TypographyWorkspace'),
  'pdf-sanitizer': () => import('./pdf/PdfWorkspace'),
  'cron-team-matrix': () => import('./cron/CronWorkspace'),
  'midi-harmony-lab': () => import('./music/MusicWorkspace'),
  'svg-sprite-compiler': () => import('./svg/SvgWorkspace'),
  'regex-log-structurer': () => import('./logs/LogWorkspace'),
  'har-sanitizer': () => import('./har/HarWorkspace'),
  'geojson-simplifier': () => import('./geo/GeoWorkspace'),
  'fuzzy-deduplicator': () => import('./dedupe/DedupeWorkspace'),
  'otel-flamegraph': () => import('./otel/OtelWorkspace'),
  'apca-token-matrix': () => import('./contrast/ContrastWorkspace'),
  'convolution-room-profiler': () => import('./audio/AudioWorkspace'),
  'glsl-sandbox': () => import('./shader/ShaderWorkspace'),
};

const cached = new Map<ToolSlug, ComponentType>();

function getWorkspace(slug: ToolSlug): ComponentType {
  const existing = cached.get(slug);
  if (existing) return existing;
  const component = lazy(workspaceLoaders[slug]);
  cached.set(slug, component);
  return component;
}

export default function Workspaces({ tool }: { tool: ToolDefinition }) {
  const Workspace = getWorkspace(tool.slug);
  return (
    <ToolLayout tool={tool}>
      <Suspense fallback={<div className="workspace-body" role="status">Loading local engine…</div>}>
        <Workspace />
      </Suspense>
    </ToolLayout>
  );
}
