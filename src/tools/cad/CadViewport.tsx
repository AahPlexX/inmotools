import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CadViewportProps, CadSelection } from './cad-workspace-types';
import type { CadKernelBodyResult, CadKernelBounds, CadKernelMesh, CadKernelVector3 } from './kernel-contract';

/**
 * Milestone A viewport rendering. Consumes only already-tessellated
 * `CadKernelBodyResult`s (invariant #2: React state never owns live OCCT
 * shape handles) and never treats the rendered Three.js meshes as canonical
 * geometry (invariant #1) — they are rebuilt from `mesh` on every `bodies`
 * change and thrown away on unmount/change, never mutated or read back.
 */

const BASE_COLOR = 0x8ea1c7;
const HIGHLIGHT_COLOR = 0xffa53c;
const HIGHLIGHT_EMISSIVE = 0x5a3200;
const MIN_FIT_RADIUS = 0.1;
const CLICK_DRAG_THRESHOLD_PX = 4;

// ---------------------------------------------------------------------------
// Pure, DOM-free helpers (unit tested in tests/unit/cad-viewport.test.ts).
// ---------------------------------------------------------------------------

/** Union of every body's already-computed bounds. No re-derivation from geometry. */
export function computeBodiesBounds(bodies: readonly CadKernelBodyResult[]): CadKernelBounds | null {
  if (bodies.length === 0) return null;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const body of bodies) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], body.bounds.min[axis]);
      max[axis] = Math.max(max[axis], body.bounds.max[axis]);
    }
  }
  return { min, max };
}

export interface CadViewportFit {
  center: CadKernelVector3;
  radius: number;
}

/** Frame-fit parameters (center + orbit radius) derived from a bounds box. */
export function computeFitView(bounds: CadKernelBounds | null): CadViewportFit | null {
  if (!bounds) return null;
  const center: CadKernelVector3 = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const size = [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
  const radius = Math.max(size[0], size[1], size[2], MIN_FIT_RADIUS);
  return { center, radius };
}

/** True only for an explicit body selection — feature/null selections highlight nothing yet. */
export function isBodySelected(selection: CadSelection | null, bodyId: string): boolean {
  return selection !== null && selection.kind === 'body' && selection.id === bodyId;
}

/** Resolves a raycast hit list (nearest first) to the body id it belongs to, or null for a miss. */
export function resolveClickedBodyId(hitBodyIds: readonly (string | undefined)[]): string | null {
  for (const id of hitBodyIds) if (id) return id;
  return null;
}

/** Distinguishes an orbit-drag release from an intentional click. */
export function exceedsClickDragThreshold(dx: number, dy: number, thresholdPx = CLICK_DRAG_THRESHOLD_PX): boolean {
  return Math.hypot(dx, dy) > thresholdPx;
}

/** Human-readable summary used as the canvas host's aria-label / empty-state text. */
export function describeViewportState(bodyCount: number, rebuilding: boolean): string {
  if (bodyCount === 0) return rebuilding ? 'CAD viewport rebuilding, no bodies yet' : 'CAD viewport, no bodies to display yet';
  const noun = bodyCount === 1 ? 'body' : 'bodies';
  return rebuilding
    ? `CAD viewport rebuilding, showing last successful result of ${bodyCount} tessellated ${noun}`
    : `CAD viewport showing ${bodyCount} tessellated ${noun}`;
}

/** Builds a BufferGeometry directly from kernel-tessellated arrays. Normals are never recomputed. */
export function createBodyGeometry(mesh: CadKernelMesh): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  return geometry;
}

/** Assigns the highlight material to the selected body's mesh and the base material to every other. */
export function applyBodyHighlight(
  meshes: ReadonlyMap<string, THREE.Mesh>,
  selection: CadSelection | null,
  baseMaterial: THREE.Material,
  highlightMaterial: THREE.Material,
): void {
  for (const [bodyId, mesh] of meshes) {
    mesh.material = isBodySelected(selection, bodyId) ? highlightMaterial : baseMaterial;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CadViewport({ bodies, selection, onSelectBody, rebuilding }: CadViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const baseMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const highlightMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const fitRef = useRef<() => void>(() => {});
  const hasAutoFitRef = useRef(false);
  const onSelectBodyRef = useRef(onSelectBody);
  const selectionRef = useRef(selection);
  const bodiesRef = useRef(bodies);
  const [canFit, setCanFit] = useState(false);

  // Refs stay current for the imperative Three.js effects below without
  // forcing those effects to re-run (and therefore re-create the renderer)
  // every time a prop identity changes.
  onSelectBodyRef.current = onSelectBody;
  selectionRef.current = selection;
  bodiesRef.current = bodies;

  // Mount-only lifecycle: renderer, camera, controls, lights, resize, input,
  // render loop. Runs once; bodies/selection updates never recreate any of this.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
    camera.position.set(5, 4, 7);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(3, 5, 4);
    scene.add(key);

    const baseMaterial = new THREE.MeshStandardMaterial({ color: BASE_COLOR, metalness: 0.1, roughness: 0.6 });
    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: HIGHLIGHT_COLOR,
      emissive: HIGHLIGHT_EMISSIVE,
      metalness: 0.1,
      roughness: 0.5,
    });

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    baseMaterialRef.current = baseMaterial;
    highlightMaterialRef.current = highlightMaterial;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    fitRef.current = () => {
      const bounds = computeBodiesBounds(bodiesRef.current);
      const fit = computeFitView(bounds);
      if (!fit) return;
      const [cx, cy, cz] = fit.center;
      const center = new THREE.Vector3(cx, cy, cz);
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(fit.radius * 1.4, fit.radius * 0.9, fit.radius * 1.8));
      camera.near = Math.max(0.001, fit.radius / 1000);
      camera.far = Math.max(100, fit.radius * 100);
      camera.updateProjectionMatrix();
      controls.update();
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (exceedsClickDragThreshold(event.clientX - downX, event.clientY - downY)) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const meshList = Array.from(meshesRef.current.values());
      const hits = raycaster.intersectObjects(meshList, false);
      const bodyId = resolveClickedBodyId(hits.map((hit) => hit.object.userData.bodyId as string | undefined));
      onSelectBodyRef.current(bodyId);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    let frame = 0;
    const draw = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      baseMaterial.dispose();
      highlightMaterial.dispose();
      renderer.dispose();
      host.replaceChildren();
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      baseMaterialRef.current = null;
      highlightMaterialRef.current = null;
      fitRef.current = () => {};
    };
  }, []);

  // Rebuild body meshes whenever the tessellation result changes. The last-good
  // `bodies` array is only ever replaced by CadWorkspace on a successful
  // rebuild (invariant #5), so this effect intentionally does not depend on
  // `rebuilding` — an in-flight or failed rebuild never clears the scene.
  useEffect(() => {
    const scene = sceneRef.current;
    const baseMaterial = baseMaterialRef.current;
    const highlightMaterial = highlightMaterialRef.current;
    if (!scene || !baseMaterial || !highlightMaterial) return;

    const meshes = new Map<string, THREE.Mesh>();
    for (const body of bodies) {
      const geometry = createBodyGeometry(body.mesh);
      const mesh = new THREE.Mesh(geometry, baseMaterial);
      mesh.userData.bodyId = body.bodyId;
      scene.add(mesh);
      meshes.set(body.bodyId, mesh);
    }
    meshesRef.current = meshes;
    applyBodyHighlight(meshes, selectionRef.current, baseMaterial, highlightMaterial);
    setCanFit(bodies.length > 0);

    if (bodies.length > 0 && !hasAutoFitRef.current) {
      hasAutoFitRef.current = true;
      fitRef.current();
    }

    return () => {
      for (const mesh of meshes.values()) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      meshesRef.current = new Map();
    };
  }, [bodies]);

  // Selection-only updates never rebuild geometry, only swap materials.
  useEffect(() => {
    const baseMaterial = baseMaterialRef.current;
    const highlightMaterial = highlightMaterialRef.current;
    if (!baseMaterial || !highlightMaterial) return;
    applyBodyHighlight(meshesRef.current, selection, baseMaterial, highlightMaterial);
  }, [selection]);

  const ariaLabel = describeViewportState(bodies.length, rebuilding);

  return (
    <div className="cad-viewport" data-testid="cad-viewport" style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div className="button-row" aria-label="CAD viewport controls">
        <button
          className="action-button secondary"
          type="button"
          data-testid="cad-viewport-fit-button"
          disabled={!canFit}
          onClick={() => fitRef.current()}
        >
          Fit to view
        </button>
      </div>
      <div style={{ position: 'relative', width: '100%', height: 'clamp(320px, 56vh, 640px)', minHeight: 0 }}>
        <div
          ref={hostRef}
          role="img"
          aria-label={ariaLabel}
          data-testid="cad-viewport-canvas-host"
          style={{
            position: 'absolute',
            inset: 0,
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            background: 'var(--surface-strong)',
          }}
        />
        {bodies.length === 0 ? (
          <div
            data-testid="cad-viewport-empty-state"
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              color: 'var(--text-muted, inherit)',
              textAlign: 'center',
              padding: 16,
            }}
          >
            <p style={{ margin: 0 }}>No bodies to display yet.</p>
          </div>
        ) : null}
        {rebuilding ? (
          <div
            data-testid="cad-viewport-rebuilding-indicator"
            aria-live="polite"
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--line)',
              background: 'var(--surface-strong)',
              fontSize: 12,
              pointerEvents: 'none',
            }}
          >
            Rebuilding…
          </div>
        ) : null}
      </div>
    </div>
  );
}
