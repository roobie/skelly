import { Mesh, type Object3D, PerspectiveCamera, Plane, Vector3 } from 'three';
import { PLAYER_SELF_MASK_LAYER } from './shadowFlags.ts';

export class OwnBodyClip {
  active = false;
  private readonly attached = new WeakSet<Mesh>();
  private readonly plane = new Plane();
  private readonly planes = [this.plane];
  private readonly forward = new Vector3();
  private readonly point = new Vector3();

  private readonly clearanceMetres: number;

  constructor(clearanceMetres: number) {
    this.clearanceMetres = clearanceMetres;
  }

  attach(groups: Iterable<Object3D>): void {
    for (const group of groups) {
      group.traverse((object) => {
        if (!(object instanceof Mesh) || this.attached.has(object)) {
          return;
        }
        this.attached.add(object);
        const before = object.onBeforeRender;
        const after = object.onAfterRender;
        let previous: Plane[] | null | undefined;
        object.onBeforeRender = (...args) => {
          before.call(object, ...args);
          previous = undefined;
          const [, , camera, , material] = args;
          if (
            !(this.active && camera instanceof PerspectiveCamera) ||
            camera.layers.isEnabled(PLAYER_SELF_MASK_LAYER)
          ) {
            return;
          }
          camera.getWorldDirection(this.forward);
          camera
            .getWorldPosition(this.point)
            .addScaledVector(this.forward, Math.max(camera.near, this.clearanceMetres));
          this.plane.setFromNormalAndCoplanarPoint(this.forward, this.point);
          previous = material.clippingPlanes;
          material.clippingPlanes = previous ? [...previous, this.plane] : this.planes;
        };
        object.onAfterRender = (...args) => {
          if (previous !== undefined) {
            args[4].clippingPlanes = previous;
            previous = undefined;
          }
          after.call(object, ...args);
        };
      });
    }
  }
}
