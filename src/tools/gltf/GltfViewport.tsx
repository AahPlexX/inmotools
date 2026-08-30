import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

export default function GltfViewport({ bytes, wireframe }: { bytes: Uint8Array | null; wireframe: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !bytes) return;
    let disposed = false;
    let animation = 0;
    let loadedScene: THREE.Object3D | null = null;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10_000);
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

    const loader = new GLTFLoader();
    loader.parse(bytes.slice().buffer, '', (gltf) => {
      if (disposed) { disposeScene(gltf.scene); return; }
      loadedScene = gltf.scene;
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => { if ('wireframe' in material) (material as THREE.MeshStandardMaterial).wireframe = wireframe; });
      });
      scene.add(gltf.scene);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, 0.1);
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(radius * 1.4, radius * 0.9, radius * 1.8));
      camera.near = Math.max(0.001, radius / 1000);
      camera.far = Math.max(100, radius * 100);
      camera.updateProjectionMatrix();
      controls.update();
    }, (error) => { console.error('GLB preview failed', error); });

    const draw = () => {
      controls.update();
      renderer.render(scene, camera);
      animation = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      disposed = true;
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.dispose();
      if (loadedScene) { scene.remove(loadedScene); disposeScene(loadedScene); }
      renderer.dispose();
      host.replaceChildren();
    };
  }, [bytes, wireframe]);

  return <div ref={hostRef} role="img" aria-label="Interactive GLB model preview" style={{ width: '100%', height: 440, minHeight: 280, border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--surface-strong)' }}/>;
}
