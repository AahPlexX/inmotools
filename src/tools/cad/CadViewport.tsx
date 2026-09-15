import type { CadViewportProps } from './cad-workspace-types';

/**
 * Placeholder pending real Three.js rendering (camera, selection highlighting,
 * visibility). Deliberately does not touch Three.js yet so it stays honest
 * about what's implemented rather than faking a rendered viewport.
 */
export default function CadViewport({ bodies, rebuilding }: CadViewportProps) {
  return (
    <div className="cad-viewport-placeholder" role="img" aria-label="CAD viewport (rendering not yet implemented)">
      <p>{rebuilding ? 'Rebuilding…' : `${bodies.length} tessellated ${bodies.length === 1 ? 'body' : 'bodies'} ready.`}</p>
    </div>
  );
}
