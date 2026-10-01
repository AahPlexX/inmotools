import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CameraState, TacticalProject } from './tactics-types';
import { normalizedPointToPitch3D } from './presentation3d-engine';
import {
  createOnDemandFrameScheduler,
  disposeTactical3DObject,
  type OnDemandFrameScheduler,
} from './presentation3d-runtime';

interface Tactical3DViewProps {
  project: TacticalProject;
  sceneId: string;
  selectedTokenId?: string;
  cameraState: CameraState;
  onSelectToken: (tokenId: string) => void;
  onCameraChange: (camera: CameraState) => void;
  onStatus: (message: string) => void;
}

interface Runtime3D {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  pitchGroup: THREE.Group;
  actorGroup: THREE.Group;
  tokenMeshes: Map<string, THREE.Mesh>;
  ballMesh: THREE.Mesh;
  scheduler: OnDemandFrameScheduler;
  visible: boolean;
}

function addPitchLines(group: THREE.Group, length: number, width: number): void {
  const halfL = length / 2;
  const halfW = width / 2;
  const points = [
    -halfL, 0.015, -halfW, halfL, 0.015, -halfW,
    halfL, 0.015, -halfW, halfL, 0.015, halfW,
    halfL, 0.015, halfW, -halfL, 0.015, halfW,
    -halfL, 0.015, halfW, -halfL, 0.015, -halfW,
    0, 0.015, -halfW, 0, 0.015, halfW,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xffffff })));

  const circlePoints: THREE.Vector3[] = [];
  const radius = Math.min(9.15, Math.min(length, width) * 0.18);
  for (let step = 0; step < 64; step += 1) {
    const angle = (step / 64) * Math.PI * 2;
    circlePoints.push(new THREE.Vector3(Math.cos(angle) * radius, 0.016, Math.sin(angle) * radius));
  }
  group.add(new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(circlePoints),
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  ));
}

function addGoals(group: THREE.Group, project: TacticalProject): void {
  const { lengthMeters, widthMeters } = project.pitch.dimensions;
  const goalWidth = Math.min(project.ruleset.goalDimensions?.widthMeters ?? 7.32, widthMeters * 0.75);
  const goalHeight = project.ruleset.goalDimensions?.heightMeters ?? 2.44;
  const depth = Math.min(2, lengthMeters * 0.05);
  for (const direction of [-1, 1] as const) {
    const box = new THREE.BoxGeometry(depth, goalHeight, goalWidth);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    const goal = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xf1f5f9 }));
    goal.position.set(direction * (lengthMeters / 2 + depth / 2), goalHeight / 2, 0);
    group.add(goal);
  }
}

function applyCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, state: CameraState): void {
  camera.position.set(state.position.x, state.position.y, state.position.z);
  camera.fov = state.fieldOfViewDeg;
  camera.updateProjectionMatrix();
  controls.target.set(state.target.x, state.target.y, state.target.z);
  controls.update();
}
export default function Tactical3DView({
  project,
  sceneId,
  selectedTokenId,
  cameraState,
  onSelectToken,
  onCameraChange,
  onStatus,
}: Tactical3DViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime3D | null>(null);
  const selectRef = useRef(onSelectToken);
  const cameraChangeRef = useRef(onCameraChange);
  const statusRef = useRef(onStatus);
  const cameraStateRef = useRef(cameraState);
  const [renderError, setRenderError] = useState('');

  selectRef.current = onSelectToken;
  cameraChangeRef.current = onCameraChange;
  statusRef.current = onStatus;
  cameraStateRef.current = cameraState;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : 'This browser could not start WebGL.');
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.replaceChildren(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.minDistance = 5;
    controls.maxDistance = 300;
    controls.maxPolarAngle = Math.PI / 2 - 0.015;

    const pitchGroup = new THREE.Group();
    const actorGroup = new THREE.Group();
    scene.add(pitchGroup, actorGroup);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.25);
    key.position.set(20, 45, 20);
    scene.add(key);
    const ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 18, 12),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.72 }),
    );
    ballMesh.userData.kind = 'ball';
    actorGroup.add(ballMesh);

    const initiallyVisible = document.visibilityState !== 'hidden';
    const scheduler = createOnDemandFrameScheduler(
      requestAnimationFrame,
      cancelAnimationFrame,
      () => renderer.render(scene, camera),
      initiallyVisible,
    );
    const runtime: Runtime3D = {
      scene,
      camera,
      renderer,
      controls,
      pitchGroup,
      actorGroup,
      tokenMeshes: new Map(),
      ballMesh,
      scheduler,
      visible: initiallyVisible,
    };
    runtimeRef.current = runtime;

    const invalidate = () => scheduler.invalidate();

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      invalidate();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const handleVisibility = () => {
      runtime.visible = document.visibilityState !== 'hidden';
      scheduler.setVisible(runtime.visible);
    };
    const handleLost = (event: Event) => {
      event.preventDefault();
      setRenderError('3D graphics paused because the browser lost its WebGL context.');
      statusRef.current('3D graphics paused. Your tactical project is still safe.');
    };
    const handleRestored = () => {
      setRenderError('');
      statusRef.current('3D graphics restored.');
      invalidate();
    };
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown: { x: number; y: number } | null = null;
    const handlePointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) {
        pointerDown = null;
        return;
      }
      pointerDown = { x: event.clientX, y: event.clientY };
    };
    const handleSelect = (event: PointerEvent) => {
      const start = pointerDown;
      pointerDown = null;
      if (!start || !event.isPrimary || event.button !== 0) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([...runtime.tokenMeshes.values()], false)[0];
      const tokenId = hit?.object.userData.tokenId;
      if (typeof tokenId === 'string') selectRef.current(tokenId);
    };
    const handleCameraEnd = () => {
      const currentCamera = cameraStateRef.current;
      cameraChangeRef.current({
        id: currentCamera.id,
        timeMs: currentCamera.timeMs,
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
        fieldOfViewDeg: camera.fov,
      });
      invalidate();
    };

    controls.addEventListener('change', invalidate);
    controls.addEventListener('end', handleCameraEnd);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handleSelect);
    renderer.domElement.addEventListener('webglcontextlost', handleLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleRestored);
    document.addEventListener('visibilitychange', handleVisibility);
    applyCamera(camera, controls, cameraState);
    resize();
    invalidate();

    return () => {
      scheduler.dispose();
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      controls.removeEventListener('change', invalidate);
      controls.removeEventListener('end', handleCameraEnd);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handleSelect);
      renderer.domElement.removeEventListener('webglcontextlost', handleLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleRestored);
      controls.dispose();
      disposeTactical3DObject(scene);
      renderer.dispose();
      host.replaceChildren();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    applyCamera(runtime.camera, runtime.controls, cameraState);
    if (runtime.visible) runtime.renderer.render(runtime.scene, runtime.camera);
  }, [cameraState]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const { pitchGroup, actorGroup, tokenMeshes, renderer, scene, camera } = runtime;
    disposeTactical3DObject(pitchGroup);
    pitchGroup.clear();

    const { lengthMeters, widthMeters } = project.pitch.dimensions;
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(lengthMeters, widthMeters),
      new THREE.MeshStandardMaterial({ color: 0x176b3a, roughness: 0.92 }),
    );
    field.rotation.x = -Math.PI / 2;
    pitchGroup.add(field);
    addPitchLines(pitchGroup, lengthMeters, widthMeters);
    addGoals(pitchGroup, project);

    for (const mesh of tokenMeshes.values()) {
      actorGroup.remove(mesh);
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    }
    tokenMeshes.clear();

    const activeLayerIds = new Set(
      project.scenes.find((sceneItem) => sceneItem.id === sceneId)?.layers
        .filter((layer) => layer.visible)
        .map((layer) => layer.id) ?? [],
    );
    for (const token of project.playerTokens) {
      if (token.sceneId !== sceneId || !token.visible || !activeLayerIds.has(token.layerId)) continue;
      const team = project.teams.find((candidate) => candidate.id === token.teamId);
      const selected = token.id === selectedTokenId;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(selected ? 0.62 : 0.52, selected ? 0.62 : 0.52, 1.5, 20),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(team?.primaryColor || '#2563eb'),
          emissive: selected ? new THREE.Color(0xffffff) : new THREE.Color(0x000000),
          emissiveIntensity: selected ? 0.28 : 0,
          roughness: 0.7,
        }),
      );
      const point = normalizedPointToPitch3D(token.position, project.pitch.dimensions);
      mesh.position.set(point.x, 0.75, point.z);
      mesh.rotation.y = THREE.MathUtils.degToRad(-token.rotationDeg);
      mesh.userData.tokenId = token.id;
      tokenMeshes.set(token.id, mesh);
      actorGroup.add(mesh);
    }

    const ballPoint = normalizedPointToPitch3D(
      project.ball.position,
      project.pitch.dimensions,
      project.ball.elevationMeters,
    );
    runtime.ballMesh.position.set(ballPoint.x, Math.max(0.11, ballPoint.y + 0.11), ballPoint.z);
    if (runtime.visible) renderer.render(scene, camera);
  }, [project, sceneId, selectedTokenId]);

  const visibleLayerIds = new Set(
    project.scenes.find((sceneItem) => sceneItem.id === sceneId)?.layers
      .filter((layer) => layer.visible)
      .map((layer) => layer.id) ?? [],
  );
  const visibleTokens = project.playerTokens.filter(
    (token) => token.sceneId === sceneId && token.visible && visibleLayerIds.has(token.layerId),
  );
  const selectedToken = visibleTokens.find((token) => token.id === selectedTokenId);

  return (
    <section className="tactical-3d-runtime" aria-labelledby="tactical-3d-view-title">
      <div className="tactical-3d-runtime__heading">
        <div>
          <h3 id="tactical-3d-view-title">3D pitch view</h3>
          <p>Orbit, pan, or zoom the view. Selecting a player here selects the same player on the 2D board and in the precision controls.</p>
        </div>
      </div>
      <p data-testid="tactical-3d-summary" className="tactical-3d-help">
        {visibleTokens.length} visible player{visibleTokens.length === 1 ? '' : 's'}.
        {selectedToken
          ? ` Selected ${selectedToken.id} at ${(selectedToken.position.x * 100).toFixed(1)}% X, ${(selectedToken.position.y * 100).toFixed(1)}% Y.`
          : ' No player selected.'}
        {` Ball elevation ${project.ball.elevationMeters.toFixed(2)} m.`}
      </p>
      {renderError ? <div className="notice" role="alert">{renderError}</div> : null}
      <div
        ref={hostRef}
        className="tactical-3d-canvas"
        role="img"
        aria-label="Interactive three-dimensional tactical pitch presentation"
        data-testid="tactical-3d-canvas"
      />
      <p className="tactical-3d-help">
        Keyboard and touch alternatives stay available in the Players and Precision move controls; 3D pointer gestures are optional.
      </p>
    </section>
  );
}
