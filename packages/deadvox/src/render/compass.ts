// A deliberately rough electronic compass: its lit screen belongs to the held object,
// not the HUD. Battery consumption is outside this readability spike.
import {
  CanvasTexture,
  CircleGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { compassBearing, headingLabel, yawFromBearing } from '../core/coords.ts';
import type { ModelDef } from '../core/schema.ts';
import { heldModelFrame } from './models.ts';

const FULL_TURN = Math.PI * 2;

export const createCompass = (model: {
  readonly root: Object3D;
  readonly display: NonNullable<ModelDef['display']>;
  readonly needleMount: readonly [number, number, number];
}) => {
  const { root, display: screen, needleMount } = model;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Compass display requires a 2D canvas');
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const displayGeometry = new PlaneGeometry(0.024, 0.012);
  const displayMaterial = new MeshBasicMaterial({ map: texture, color: 0x9d_c9_b2 });
  const display = new Mesh(displayGeometry, displayMaterial);
  display.name = 'compass-live-display';
  const needleGeometry = new CircleGeometry(0.006, 3);
  const needleMaterial = new MeshBasicMaterial({ color: 0xff_9f_86 });
  const needle = new Mesh(needleGeometry, needleMaterial);
  needle.name = 'compass-live-needle';
  needle.geometry.rotateZ(Math.PI / 2);
  needle.scale.x = 0.45;
  // A plane's front is +z and its top +y: the face turns them to the screen's normal and up,
  // and the live layers stand off the screen to avoid z-fighting.
  const normal = new Vector3(...screen.normal);
  const up = new Vector3(...screen.up);
  const face = new Group();
  face.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(up.clone().cross(normal), up, normal));
  face.position.set(...screen.at).addScaledVector(normal, 0.001);
  needle.position
    .set(...needleMount)
    .sub(new Vector3(...screen.at))
    .applyQuaternion(face.quaternion.clone().invert());
  needle.position.z += 0.001;
  face.add(display, needle);
  heldModelFrame(root).add(face);
  let displayed = -1;
  const update = (yaw: number) => {
    const bearing = compassBearing(yaw);
    // Looking east puts north on the left of the held display.
    needle.rotation.z = bearing * (Math.PI / 180);
    const label = headingLabel(bearing);
    if (label.degrees === displayed) {
      return;
    }
    displayed = label.degrees;
    context.fillStyle = '#10221c';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#d3ffe6';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = 'bold 110px monospace';
    context.fillText(label.cardinal, 256, 96);
    context.font = 'bold 120px monospace';
    context.fillText(`${String(label.degrees).padStart(3, '0')}°`, 256, 225);
    context.font = '22px sans-serif';
    context.fillText('NORTH POINTER', 256, 472);
    context.strokeStyle = '#608c76';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(256, 365, 80, 0, FULL_TURN);
    context.stroke();
    texture.needsUpdate = true;
  };
  update(yawFromBearing(0));
  return {
    group: root,
    update,
    dispose: () => {
      displayGeometry.dispose();
      displayMaterial.dispose();
      needleGeometry.dispose();
      needleMaterial.dispose();
      texture.dispose();
    },
  };
};
