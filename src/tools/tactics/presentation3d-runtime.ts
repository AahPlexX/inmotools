import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CameraState } from './tactics-types';

export function applyTactical3DCamera(
  camera: THREE.PerspectiveCamera,
  controls: Pick<OrbitControls, 'enabled' | 'target' | 'update'>,
  state: CameraState,
  playerView = false,
): void {
  controls.enabled = !playerView;
  camera.position.set(state.position.x, state.position.y, state.position.z);
  camera.fov = state.fieldOfViewDeg;
  camera.updateProjectionMatrix();
  controls.target.set(state.target.x, state.target.y, state.target.z);
  if (playerView) camera.lookAt(controls.target);
  else controls.update();
}

export function disposeTactical3DObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.LineLoop)) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
}

export interface OnDemandFrameScheduler {
  invalidate: () => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

export function createOnDemandFrameScheduler(
  requestFrame: (callback: FrameRequestCallback) => number,
  cancelFrame: (handle: number) => void,
  draw: (time: number) => void,
  initiallyVisible = true,
): OnDemandFrameScheduler {
  let frame = 0;
  let visible = initiallyVisible;
  let disposed = false;

  const render = (time: number) => {
    frame = 0;
    if (!visible || disposed) return;
    draw(time);
  };

  const invalidate = () => {
    if (!visible || disposed || frame) return;
    frame = requestFrame(render);
  };

  return {
    invalidate,
    setVisible(nextVisible: boolean) {
      if (disposed || visible === nextVisible) return;
      visible = nextVisible;
      if (!visible && frame) {
        cancelFrame(frame);
        frame = 0;
        return;
      }
      if (visible) invalidate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) cancelFrame(frame);
      frame = 0;
    },
  };
}
