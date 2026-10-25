// A held screen faces the eye with the palm on the item's back, so the hand can never sit
// between the eye and the screen (`DESIGN.md`, "Held screens").
import { Box3, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import type { Vec3 } from '../core/coords.ts';
import type { ModelDef } from '../core/schema.ts';
import { heldModelFrame } from './models.ts';

const VIEW_UP = new Vector3(0, 1, 0);

const frameBasis = (normal: Vector3, up: Vector3): Matrix4 =>
  new Matrix4().makeBasis(up.clone().cross(normal), up, normal);

/** How far the model reaches behind its screen, along the screen's normal. */
const depthBehind = (frame: Object3D, at: Vector3, normal: Vector3): number => {
  frame.updateWorldMatrix(true, true);
  const toFrame = frame.matrixWorld.clone().invert();
  const box = new Box3();
  const corner = new Vector3();
  let deepest = 0;
  frame.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }
    child.geometry.computeBoundingBox();
    box.copy(child.geometry.boundingBox!).applyMatrix4(toFrame.clone().multiply(child.matrixWorld));
    for (let index = 0; index < 8; index += 1) {
      corner.set(
        index & 1 ? box.max.x : box.min.x,
        index & 2 ? box.max.y : box.min.y,
        index & 4 ? box.max.z : box.min.z,
      );
      deepest = Math.max(deepest, -corner.sub(at).dot(normal));
    }
  });
  return deepest;
};

/**
 * Places a held model's root, a child of the hand's group at `heldAt` in the eye's frame, so its
 * screen faces the eye with its top up and its back on the palm. Returns the frame the palm
 * takes behind it.
 */
export const presentHeldDisplay = (root: Object3D, display: NonNullable<ModelDef['display']>, heldAt: Vec3) => {
  const toEye = new Vector3(...heldAt).negate().normalize();
  const upOnScreen = VIEW_UP.clone().addScaledVector(toEye, -VIEW_UP.dot(toEye)).normalize();
  const presented = frameBasis(toEye, upOnScreen);
  const normal = new Vector3(...display.normal);
  const at = new Vector3(...display.at);
  const turn = presented.clone().multiply(frameBasis(normal, new Vector3(...display.up)).transpose());
  const frame = heldModelFrame(root);
  const back = depthBehind(frame, at, normal);
  // The hand's grip point is the palm's face, so the model's back sits on it with nothing in between.
  const screenAt = toEye.clone().multiplyScalar(back);
  const place = turn.clone().setPosition(screenAt.sub(at.applyMatrix4(turn)));
  root.updateWorldMatrix(true, true);
  const inner = root.matrixWorld.clone().invert().multiply(frame.matrixWorld);
  place.multiply(inner.invert()).decompose(root.position, root.quaternion, root.scale);
  const palm = new Object3D();
  palm.quaternion.copy(new Quaternion().setFromRotationMatrix(presented));
  return palm;
};
