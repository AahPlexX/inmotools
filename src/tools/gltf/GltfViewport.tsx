import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';

function disposeScene(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      material.dispose();
    }
  });
  textures.forEach((texture) => texture.dispose());
}

export function shouldReuseGltfCamera(previousModelKey: string | null, currentModelKey: string): boolean {
  return previousModelKey === currentModelKey;
}

export default function GltfViewport({ bytes, wireframe, modelKey }: { bytes: Uint8Array | null; wireframe: boolean; modelKey: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cameraStateRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const lastModelKeyRef = useRef<string | null>(null);
  const loadedSceneRef = useRef<THREE.Object3D | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clipsRef = useRef<THREE.AnimationClip[]>([]);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [canFit, setCanFit] = useState(false);
  const [animations, setAnimations] = useState<string[]>([]);
  const [selectedAnimation, setSelectedAnimation] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const root = loadedSceneRef.current;
    if (!root) return;
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if ('wireframe' in material) (material as THREE.MeshStandardMaterial).wireframe = wireframe;
      });
    });
  }, [wireframe]);

  useEffect(() => {
    actionRef.current?.stop();
    actionRef.current = null;
    const mixer = mixerRef.current;
    const clip = clipsRef.current[selectedAnimation];
    if (!mixer || !clip || !playing) return;
    const action = mixer.clipAction(clip);
    action.reset().play();
    actionRef.current = action;
    return () => {
      action.stop();
      if (actionRef.current === action) actionRef.current = null;
    };
  }, [selectedAnimation, playing]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !bytes) return;

    const reuseCamera = shouldReuseGltfCamera(lastModelKeyRef.current, modelKey);
    if (!reuseCamera) cameraStateRef.current = null;
    lastModelKeyRef.current = modelKey;
    setPreviewError('');
    setCanFit(false);
    setAnimations([]);
    setSelectedAnimation(0);
    setPlaying(false);
    clipsRef.current = [];
    mixerRef.current = null;
    actionRef.current = null;

    let disposed = false, frame = 0, loadedScene: THREE.Object3D | null = null;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, .01, 10000);
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

    const resize = () => {
      const rect = host.getBoundingClientRect(), width = Math.max(1, rect.width), height = Math.max(1, rect.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const fitScene = (root: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), radius = Math.max(size.x, size.y, size.z, .1);
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(radius * 1.4, radius * .9, radius * 1.8));
      camera.near = Math.max(.001, radius / 1000);
      camera.far = Math.max(100, radius * 100);
      camera.updateProjectionMatrix();
      controls.update();
    };

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.parse(bytes.slice().buffer, '', (gltf) => {
      if (disposed) { disposeScene(gltf.scene); return; }
      loadedScene = gltf.scene;
      loadedSceneRef.current = gltf.scene;
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => { if ('wireframe' in material) (material as THREE.MeshStandardMaterial).wireframe = wireframe; });
      });
      scene.add(gltf.scene);

      const box = new THREE.Box3().setFromObject(gltf.scene);
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3()), radius = Math.max(size.x, size.y, size.z, .1);
        if (cameraStateRef.current) {
          camera.position.copy(cameraStateRef.current.position);
          controls.target.copy(cameraStateRef.current.target);
          camera.near = Math.max(.001, radius / 1000);
          camera.far = Math.max(100, radius * 100);
          camera.updateProjectionMatrix();
          controls.update();
        } else fitScene(gltf.scene);
        fitRef.current = () => fitScene(gltf.scene);
        setCanFit(true);
      }

      clipsRef.current = gltf.animations;
      setAnimations(gltf.animations.map((clip, index) => clip.name.trim() || `Animation ${index + 1}`));
      if (gltf.animations.length) mixerRef.current = new THREE.AnimationMixer(gltf.scene);
    }, (error: unknown) => {
      if (disposed) return;
      setPreviewError(`GLB preview failed: ${error instanceof Error ? error.message : 'the browser could not decode this model'}. The source file remains unchanged.`);
    });

    const clock = new THREE.Clock();
    const draw = () => {
      const delta = clock.getDelta();
      mixerRef.current?.update(delta);
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cameraStateRef.current = { position: camera.position.clone(), target: controls.target.clone() };
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      fitRef.current = null;
      setCanFit(false);
      actionRef.current?.stop();
      actionRef.current = null;
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      clipsRef.current = [];
      controls.dispose();
      loadedSceneRef.current = null;
      if (loadedScene) { scene.remove(loadedScene); disposeScene(loadedScene); }
      renderer.dispose();
      host.replaceChildren();
    };
  }, [bytes, modelKey]);

  return <div style={{ marginTop: 18, minWidth: 0 }}>
    <div className="button-row" aria-label="GLB preview controls">
      <button className="action-button secondary" type="button" disabled={!canFit} onClick={() => fitRef.current?.()}>Fit model to view</button>
      {animations.length ? <>
        <label>Animation<select aria-label="Preview animation" value={selectedAnimation} onChange={(event) => setSelectedAnimation(Number(event.target.value))}>{animations.map((name, index) => <option value={index} key={`${index}-${name}`}>{name}</option>)}</select></label>
        <button className="action-button secondary" type="button" aria-pressed={playing} onClick={() => setPlaying((value) => !value)}>{playing ? 'Pause animation' : 'Play animation'}</button>
      </> : <span data-testid="gltf-animation-status">No animations in this model.</span>}
    </div>
    <div data-testid="gltf-preview-model-key" style={{ display: 'none' }}>{modelKey}</div>
    {previewError ? <div className="notice" role="alert" style={{ marginBottom: 10 }}>{previewError}</div> : null}
    <div ref={hostRef} role="img" aria-label="Interactive GLB model preview" style={{ width: '100%', height: 'clamp(260px, 48vh, 440px)', minHeight: 0, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--surface-strong)' }} />
  </div>;
}
