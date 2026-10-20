// A deliberately rough electronic compass: its lit screen belongs to the held object,
// not the HUD. Battery consumption is outside this readability spike.
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { compassBearing, headingLabel, yawFromBearing } from '../core/coords.ts';

const FULL_TURN = Math.PI * 2;

export const createCompass = () => {
  const group = new Group();
  // Grip the bottom of the device: centering it at the wrist hides the display behind the palm.
  group.position.y = 0.13;
  const caseGeometry = new BoxGeometry(0.1, 0.13, 0.018);
  const caseMaterial = new MeshLambertMaterial({ color: 0x34_3b_38 });
  const casing = new Mesh(caseGeometry, caseMaterial);
  group.add(casing);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Compass display requires a 2D canvas');
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const displayGeometry = new PlaneGeometry(0.086, 0.112);
  const displayMaterial = new MeshBasicMaterial({ map: texture, color: 0x9d_c9_b2 });
  const display = new Mesh(displayGeometry, displayMaterial);
  display.position.z = 0.0095;
  group.add(display);

  // A separate indicator keeps turning continuously, even between integer display updates.
  const needleGeometry = new CircleGeometry(0.019, 3);
  const needleMaterial = new MeshBasicMaterial({ color: 0xff_9f_86 });
  const needle = new Mesh(needleGeometry, needleMaterial);
  needle.geometry.rotateZ(Math.PI / 2);
  needle.scale.x = 0.45;
  needle.position.set(0, -0.022, 0.0105);
  group.add(needle);
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
    group,
    update,
    dispose: () => {
      caseGeometry.dispose();
      caseMaterial.dispose();
      displayGeometry.dispose();
      displayMaterial.dispose();
      needleGeometry.dispose();
      needleMaterial.dispose();
      texture.dispose();
    },
  };
};
