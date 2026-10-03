import { lazy, Suspense, type ComponentType } from 'react';
import type { ToolMeta, ToolSlug } from '../catalog';
import { ToolLayout } from '../components/ToolLayout';

// Workspace loaders come from each tool's `<slug>.meta.ts` (`load`); there is no shared map.
const cached = new Map<ToolSlug, ComponentType>();

function getWorkspace(tool: ToolMeta): ComponentType {
  const existing = cached.get(tool.slug);
  if (existing) return existing;
  const component = lazy(tool.load);
  cached.set(tool.slug, component);
  return component;
}

export default function Workspaces({ tool }: { tool: ToolMeta }) {
  const Workspace = getWorkspace(tool);
  return (
    <ToolLayout tool={tool}>
      <Suspense fallback={<div className="workspace-body" role="status">Loading local engine…</div>}>
        <Workspace />
      </Suspense>
    </ToolLayout>
  );
}
