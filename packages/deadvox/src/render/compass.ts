// A magnetic card compass: its card and needle belong to the held object, not the HUD.
// The card turns with the needle, so its marks name the world's directions and the model's
// lubber mark shows the heading.
import { MATERIALS } from '@skelly/thing-core/materials';
import {
  CanvasTexture,
  CircleGeometry,
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { compassBearing, yawFromBearing } from '../core/coords.ts';
import type { CompassDial, ModelDef } from '../core/schema.ts';
import { heldModelFrame } from './models.ts';

const FULL_TURN = Math.PI * 2;
const TEXTURE_SIZE = 512;

const style = (material: string) =>
  `#${new Color().setRGB(...MATERIALS[material]!.colour, SRGBColorSpace).getHexString()}`;

/** Paints the card with north up; the canvas is a square whose inscribed circle is the card. */
const paintCard = (context: CanvasRenderingContext2D, dial: CompassDial) => {
  const radius = TEXTURE_SIZE / 2;
  context.translate(radius, radius);
  context.fillStyle = style(dial.face);
  context.beginPath();
  context.arc(0, 0, radius, 0, FULL_TURN);
  context.fill();
  context.strokeStyle = style(dial.ink);
  context.lineWidth = radius * 0.05;
  context.beginPath();
  context.arc(0, 0, radius * 0.95, 0, FULL_TURN);
  context.stroke();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `bold ${Math.round(dial.markHeight * radius)}px sans-serif`;
  dial.marks.forEach((mark, index) => {
    context.save();
    context.rotate((index / dial.marks.length) * FULL_TURN);
    context.fillStyle = style(index === 0 ? dial.north : dial.ink);
    context.fillText(mark, 0, -radius * (0.9 - dial.markHeight / 2));
    context.restore();
  });
  const reach = dial.needleLength * radius;
  const half = (dial.needleWidth * radius) / 2;
  for (const [end, colour] of [
    [-reach, dial.north],
    [reach, dial.south],
  ] as const) {
    context.fillStyle = style(colour);
    context.beginPath();
    context.moveTo(-half, 0);
    context.lineTo(0, end);
    context.lineTo(half, 0);
    context.closePath();
    context.fill();
  }
  context.fillStyle = style(dial.ink);
  context.beginPath();
  context.arc(0, 0, half * 0.6, 0, FULL_TURN);
  context.fill();
};

export const createCompass = (model: {
  readonly root: Object3D;
  readonly display: NonNullable<ModelDef['display']>;
  readonly needleMount: readonly [number, number, number];
  readonly dial: CompassDial;
}) => {
  const { root, display: screen, needleMount, dial } = model;
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Compass card requires a 2D canvas');
  }
  paintCard(context, dial);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // The card fills the display, lit like the rest of the model.
  const cardGeometry = new CircleGeometry(Math.min(...screen.size) / 2, 48);
  const cardMaterial = new MeshStandardMaterial({ map: texture, roughness: 0.8 });
  const card = new Mesh(cardGeometry, cardMaterial);
  card.name = 'compass-live-dial';
  // A circle's front is +z and its top +y: the face turns them to the display's normal and up,
  // and the card stands off the dial to avoid z-fighting.
  const normal = new Vector3(...screen.normal);
  const up = new Vector3(...screen.up);
  const face = new Group();
  face.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(up.clone().cross(normal), up, normal));
  face.position.set(...screen.at).addScaledVector(normal, 0.0005);
  // The card turns on the needle's pin.
  card.position
    .set(...needleMount)
    .sub(new Vector3(...screen.at))
    .applyQuaternion(face.quaternion.clone().invert());
  card.position.z = 0;
  face.add(card);
  heldModelFrame(root).add(face);
  const update = (yaw: number) => {
    // Looking east puts north on the left of the held card.
    card.rotation.z = compassBearing(yaw) * (Math.PI / 180);
  };
  update(yawFromBearing(0));
  return {
    group: root,
    update,
    dispose: () => {
      cardGeometry.dispose();
      cardMaterial.dispose();
      texture.dispose();
    },
  };
};
