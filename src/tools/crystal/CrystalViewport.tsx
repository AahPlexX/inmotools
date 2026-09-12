import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CrystalProjection } from './project-engine';
import type { CrystalDocument } from './crystal-types';
import {
  buildCrystalRenderModel,
  defaultRenderOptions,
  type CrystalRepresentation,
} from './viewport-model';

type ViewAxis = 'x' | 'y' | 'z';

interface SavedCameraState {
  readonly structureKey: string;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly zoom: number;
}

interface ViewRuntime {
  fit(): void;
  reset(): void;
  preset(axis: ViewAxis): void;
}

export interface CrystalViewportProps {
  readonly document: CrystalDocument;
  readonly representation: CrystalRepresentation;
  readonly projection: CrystalProjection;
  readonly selectedSiteIds: ReadonlySet<string>;
  readonly onSelectionChange: (ids: ReadonlySet<string>) => void;
  readonly onProjectionChange: (projection: CrystalProjection) => void;
  readonly onCanvasChange?: (canvas: HTMLCanvasElement | null) => void;
}

const SELECTED_COLOR = new THREE.Color('#FFD166');

function structureKey(document: CrystalDocument): string {
  const cell = [
    document.cell.a,
    document.cell.b,
    document.cell.c,
    document.cell.alpha,
    document.cell.beta,
    document.cell.gamma,
  ].join(',');
  const sites = document.sites
    .map((site) => `${site.id}:${site.element}:${site.fractional.join(',')}:${site.occupancy}`)
    .join('|');
  return `${document.id}::${cell}::${sites}`;
}

function sceneBounds(model: ReturnType<typeof buildCrystalRenderModel>): THREE.Box3 {
  const box = new THREE.Box3();
  for (const atom of model.atoms) {
    const position = new THREE.Vector3(...atom.position);
    const radius = Math.max(atom.radius, 0.1);
    box.expandByPoint(position.clone().addScalar(radius));
    box.expandByPoint(position.clone().addScalar(-radius));
  }
  for (const [start, end] of model.cellEdges) {
    box.expandByPoint(new THREE.Vector3(...start));
    box.expandByPoint(new THREE.Vector3(...end));
  }
  if (box.isEmpty()) {
    box.expandByPoint(new THREE.Vector3(-1, -1, -1));
    box.expandByPoint(new THREE.Vector3(1, 1, 1));
  }
  return box;
}

function setLinePositions(
  geometry: THREE.BufferGeometry,
  segments: readonly (readonly [readonly [number, number, number], readonly [number, number, number]])[],
): void {
  const positions: number[] = [];
  for (const [start, end] of segments) {
    positions.push(...start, ...end);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
}

export default function CrystalViewport({
  document,
  representation,
  projection,
  selectedSiteIds,
  onSelectionChange,
  onProjectionChange,
  onCanvasChange,
}: CrystalViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<ViewRuntime | null>(null);
  const savedCameraRef = useRef<SavedCameraState | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const currentStructureKey = useMemo(() => structureKey(document), [document]);
  const model = useMemo(
    () => buildCrystalRenderModel(document, {
      ...defaultRenderOptions,
      representation,
      selectedSiteIds,
    }),
    [document, representation, selectedSiteIds],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      setRenderError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WebGL is unavailable in this browser.';
      setRenderError(message);
      runtimeRef.current = null;
      onCanvasChange?.(null);
      return;
    }

    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = 'crystal-viewport__canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);
    onCanvasChange?.(renderer.domElement);

    const scene = new THREE.Scene();
    const camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = projection === 'perspective'
      ? new THREE.PerspectiveCamera(42, 1, 0.01, 10_000)
      : new THREE.OrthographicCamera(-5, 5, 5, -5, 0.01, 10_000);
    camera.up.set(0, 1, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x30343f, 1.35));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(6, 8, 10);
    scene.add(keyLight);

    const atomGeometry = new THREE.SphereGeometry(1, 24, 18);
    const atomMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.56,
      metalness: 0.04,
      vertexColors: true,
      wireframe: representation === 'wireframe',
    });
    const atomMesh = new THREE.InstancedMesh(atomGeometry, atomMaterial, model.atoms.length);
    atomMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    atomMesh.userData.kind = 'crystal-atoms';
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    model.atoms.forEach((atom, index) => {
      position.set(...atom.position);
      scale.setScalar(atom.radius);
      matrix.compose(position, quaternion, scale);
      atomMesh.setMatrixAt(index, matrix);
      atomMesh.setColorAt(index, atom.selected ? SELECTED_COLOR : new THREE.Color(atom.color));
    });
    atomMesh.instanceMatrix.needsUpdate = true;
    if (atomMesh.instanceColor) atomMesh.instanceColor.needsUpdate = true;
    scene.add(atomMesh);

    const bondGeometry = new THREE.BufferGeometry();
    setLinePositions(
      bondGeometry,
      model.bonds.map((bond) => [bond.start, bond.end] as const),
    );
    const bondMaterial = new THREE.LineBasicMaterial({ color: 0x7f8794, transparent: true, opacity: 0.8 });
    const bondLines = new THREE.LineSegments(bondGeometry, bondMaterial);
    scene.add(bondLines);

    const cellGeometry = new THREE.BufferGeometry();
    setLinePositions(cellGeometry, model.cellEdges);
    const cellMaterial = new THREE.LineBasicMaterial({ color: 0x4a5568, transparent: true, opacity: 0.8 });
    const cellLines = new THREE.LineSegments(cellGeometry, cellMaterial);
    scene.add(cellLines);

    const bounds = sceneBounds(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 1);
    let orthographicHalfHeight = radius * 1.35;

    const applyOrthographicFrustum = (width: number, height: number) => {
      if (!(camera instanceof THREE.OrthographicCamera)) return;
      const aspect = width / Math.max(1, height);
      camera.left = -orthographicHalfHeight * aspect;
      camera.right = orthographicHalfHeight * aspect;
      camera.top = orthographicHalfHeight;
      camera.bottom = -orthographicHalfHeight;
      camera.updateProjectionMatrix();
    };

    const setView = (direction: THREE.Vector3, refit: boolean) => {
      const normalized = direction.lengthSq() > 0 ? direction.normalize() : new THREE.Vector3(1, 1, 1).normalize();
      const perspectiveDistance = radius / Math.tan(THREE.MathUtils.degToRad(42 / 2)) * 1.35;
      const distance = Math.max(perspectiveDistance, radius * 2.4, 3);
      camera.position.copy(center).addScaledVector(normalized, distance);
      controls.target.copy(center);
      if (refit) {
        orthographicHalfHeight = radius * 1.35;
        camera.zoom = 1;
        applyOrthographicFrustum(host.clientWidth || 1, host.clientHeight || 1);
      }
      camera.near = Math.max(0.01, distance - radius * 4);
      camera.far = Math.max(100, distance + radius * 8);
      camera.updateProjectionMatrix();
      controls.update();
    };

    const fit = () => {
      const direction = camera.position.clone().sub(controls.target);
      setView(direction.lengthSq() > 0 ? direction : new THREE.Vector3(1, 1, 1), true);
    };
    const reset = () => setView(new THREE.Vector3(1, 1, 1), true);
    const preset = (axis: ViewAxis) => {
      const direction = axis === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : axis === 'y'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
      setView(direction, false);
    };
    runtimeRef.current = { fit, reset, preset };

    const saved = savedCameraRef.current;
    if (saved?.structureKey === currentStructureKey) {
      camera.position.set(...saved.position);
      camera.zoom = saved.zoom;
      controls.target.set(...saved.target);
      controls.update();
    } else {
      reset();
    }

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      } else {
        applyOrthographicFrustum(width, height);
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handlePointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(atomMesh, false)[0];
      if (!hit || typeof hit.instanceId !== 'number') return;
      const site = model.atoms[hit.instanceId];
      if (!site) return;
      const next = event.ctrlKey || event.metaKey || event.shiftKey
        ? new Set(selectedSiteIds)
        : new Set<string>();
      if (next.has(site.siteId)) next.delete(site.siteId);
      else next.add(site.siteId);
      onSelectionChange(next);
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    let animationFrame = 0;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      savedCameraRef.current = {
        structureKey: currentStructureKey,
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
        zoom: camera.zoom,
      };
      runtimeRef.current = null;
      onCanvasChange?.(null);
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      controls.dispose();
      atomGeometry.dispose();
      atomMaterial.dispose();
      bondGeometry.dispose();
      bondMaterial.dispose();
      cellGeometry.dispose();
      cellMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [currentStructureKey, model, onCanvasChange, onSelectionChange, projection, representation, selectedSiteIds]);

  return (
    <section className="crystal-viewport-shell" aria-labelledby="crystal-viewport-heading">
      <div className="crystal-viewport__heading-row">
        <div>
          <h3 id="crystal-viewport-heading">Structure view</h3>
          <p>Drag to orbit, scroll to zoom, and select an atom directly in the view.</p>
        </div>
        <div className="crystal-viewport__toolbar" aria-label="Structure view controls">
          <button type="button" onClick={() => runtimeRef.current?.fit()}>Fit structure</button>
          <button type="button" onClick={() => runtimeRef.current?.reset()}>Reset view</button>
          <button type="button" onClick={() => runtimeRef.current?.preset('x')}>+X</button>
          <button type="button" onClick={() => runtimeRef.current?.preset('y')}>+Y</button>
          <button type="button" onClick={() => runtimeRef.current?.preset('z')}>+Z</button>
          <button
            type="button"
            onClick={() => onProjectionChange(projection === 'perspective' ? 'orthographic' : 'perspective')}
          >
            {projection === 'perspective' ? 'Use orthographic projection' : 'Use perspective projection'}
          </button>
        </div>
      </div>
      <div
        ref={hostRef}
        className="crystal-viewport"
        role="img"
        aria-label="Interactive crystal structure"
      >
        {renderError ? (
          <p className="crystal-viewport__fallback" role="status">
            The 3D renderer is unavailable: {renderError}
          </p>
        ) : null}
      </div>
      {model.diagnostics.length > 0 ? (
        <details className="crystal-viewport__diagnostics">
          <summary>Rendering notes ({model.diagnostics.length})</summary>
          <ul>{model.diagnostics.map((message) => <li key={message}>{message}</li>)}</ul>
        </details>
      ) : null}
    </section>
  );
}
