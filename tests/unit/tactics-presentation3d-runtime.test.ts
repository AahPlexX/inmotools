import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  createOnDemandFrameScheduler,
  disposeTactical3DObject,
} from '../../src/tools/tactics/presentation3d-runtime';

describe('Tactical 3D runtime lifecycle', () => {
  it('deduplicates pending frames, pauses while hidden, resumes once, and cancels on disposal', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextHandle = 1;
    const request = vi.fn((callback: FrameRequestCallback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    });
    const cancel = vi.fn((handle: number) => callbacks.delete(handle));
    const draw = vi.fn();
    const scheduler = createOnDemandFrameScheduler(request, cancel, draw);

    scheduler.invalidate();
    scheduler.invalidate();
    expect(request).toHaveBeenCalledTimes(1);

    callbacks.get(1)?.(10);
    expect(draw).toHaveBeenCalledTimes(1);

    scheduler.invalidate();
    expect(request).toHaveBeenCalledTimes(2);
    scheduler.setVisible(false);
    expect(cancel).toHaveBeenCalledWith(2);
    expect(draw).toHaveBeenCalledTimes(1);

    scheduler.invalidate();
    expect(request).toHaveBeenCalledTimes(2);
    scheduler.setVisible(true);
    expect(request).toHaveBeenCalledTimes(3);

    scheduler.dispose();
    expect(cancel).toHaveBeenCalledWith(3);
    scheduler.invalidate();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('disposes mesh and line GPU resources throughout a tactical scene graph', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
    ]);
    const lineMaterial = new THREE.LineBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const lineGeometryDispose = vi.spyOn(lineGeometry, 'dispose');
    const lineMaterialDispose = vi.spyOn(lineMaterial, 'dispose');

    root.add(new THREE.Mesh(geometry, material));
    root.add(new THREE.LineSegments(lineGeometry, lineMaterial));
    disposeTactical3DObject(root);

    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(lineGeometryDispose).toHaveBeenCalledOnce();
    expect(lineMaterialDispose).toHaveBeenCalledOnce();
  });
});
