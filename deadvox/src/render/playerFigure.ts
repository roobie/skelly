// The player's world body and held-item arms: one shared figure layout, with a
// player palette and a short first-person arm ending at each held item's grip.

import {
  BoxGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  Vector3,
} from 'three';
import type { FigureDef } from '../core/content.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import type { Body } from '../core/physics.ts';
import type { Vec3 } from '../core/coords.ts';
import { defOf } from '../core/items.ts';
import { FIGURE_BOXES, PLAYER_ARM_BOXES, type FigureBox } from './figure.ts';

/** Metres behind the eye. It clears the torso's 14 cm half-depth by 4 cm. */
export const PLAYER_BODY_REAR_OFFSET = 0.18;
export const PLAYER_ARM_PARTS = [
  'body',
  'leftUpperArm',
  'rightUpperArm',
  'leftForearm',
  'rightForearm',
  'leftHand',
  'rightHand',
  'leftLeg',
  'rightLeg',
] as const;
export type PlayerArmPart = (typeof PLAYER_ARM_PARTS)[number];

const PLAYER_BOXES: Readonly<Record<PlayerArmPart, FigureBox>> = {
  body: FIGURE_BOXES.body,
  leftUpperArm: PLAYER_ARM_BOXES.leftUpperArm,
  rightUpperArm: PLAYER_ARM_BOXES.rightUpperArm,
  leftForearm: PLAYER_ARM_BOXES.leftForearm,
  rightForearm: PLAYER_ARM_BOXES.rightForearm,
  leftHand: PLAYER_ARM_BOXES.leftHand,
  rightHand: PLAYER_ARM_BOXES.rightHand,
  leftLeg: FIGURE_BOXES.leftLeg,
  rightLeg: FIGURE_BOXES.rightLeg,
};

const PLAYER_COLORS: Readonly<Record<PlayerArmPart, keyof FigureDef['palette']>> = {
  body: 'shirt',
  leftUpperArm: 'shirt',
  rightUpperArm: 'shirt',
  leftForearm: 'skin',
  rightForearm: 'skin',
  leftHand: 'skin',
  rightHand: 'skin',
  leftLeg: 'trousers',
  rightLeg: 'trousers',
};

const SHIRT_SHOULDER: Readonly<Record<HandSide, Vec3>> = {
  right: [0.3, -0.55, 0.05],
  left: [-0.3, -0.55, 0.05],
};
const SEGMENT_UP = new Vector3(0, 1, 0);
const segmentDirection = new Vector3();

const placeSegment = (mesh: Mesh, start: Vector3, end: Vector3, width: number, depth: number): void => {
  segmentDirection.subVectors(end, start);
  const length = segmentDirection.length();
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(SEGMENT_UP, segmentDirection.normalize());
  mesh.scale.set(width, length, depth);
};

/** A sleeve, skin forearm and hand whose palm anchor is exactly at `grip`. */
export const createFirstPersonArm = (palette: FigureDef['palette'], side: HandSide, grip: Vec3): Group => {
  const arm = new Group();
  arm.name = `first-person-arm-${side}`;
  const shirt = new MeshLambertMaterial({ color: palette.shirt });
  const skin = new MeshLambertMaterial({ color: palette.skin });
  const geometry = new BoxGeometry(1, 1, 1);
  const shoulder = new Vector3(...SHIRT_SHOULDER[side]);
  const wrist = new Vector3(...grip);
  const elbow = shoulder.clone().lerp(wrist, 0.56);
  const sleeve = new Mesh(geometry, shirt);
  placeSegment(sleeve, shoulder, elbow, 0.17, 0.15);
  arm.add(sleeve);
  const forearm = new Mesh(geometry, skin);
  placeSegment(forearm, elbow, wrist, 0.125, 0.125);
  arm.add(forearm);
  const palm = new Mesh(new BoxGeometry(0.14, 0.12, 0.15), skin);
  palm.position.copy(wrist);
  palm.quaternion.setFromUnitVectors(SEGMENT_UP, wrist.clone().sub(elbow).normalize());
  arm.add(palm);
  const gripAnchor = new Object3D();
  gripAnchor.name = 'grip-anchor';
  gripAnchor.position.copy(wrist);
  arm.add(gripAnchor);
  return arm;
};

export interface PlayerFigurePose {
  body: Body;
  yaw: number;
  stepOffset: number;
  gaitPhase: number;
  moving: boolean;
  inventory?: Inventory;
}

/** A coloured, headless world figure. Its body and legs are the shared figure boxes. */
export class PlayerMeshes {
  readonly group = new Group();
  private readonly meshes = new Map<PlayerArmPart, InstancedMesh>();
  private readonly dummy = new Object3D();
  private readonly blockSize: number;

  constructor(blockSize: number, palette: FigureDef['palette']) {
    this.blockSize = blockSize;
    for (const part of PLAYER_ARM_PARTS) {
      const mesh = new InstancedMesh(
        new BoxGeometry(1, 1, 1),
        new MeshLambertMaterial({ color: palette[PLAYER_COLORS[part]] }),
        1,
      );
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.meshes.set(part, mesh);
      this.group.add(mesh);
    }
  }

  sync({ body, yaw, stepOffset, gaitPhase, moving, inventory }: PlayerFigurePose): void {
    const s = this.blockSize;
    const rearX = Math.sin(yaw) * PLAYER_BODY_REAR_OFFSET;
    const rearZ = Math.cos(yaw) * PLAYER_BODY_REAR_OFFSET;
    const hiddenArms: Record<HandSide, boolean> = { right: false, left: false };
    for (const side of ['right', 'left'] as const) {
      const held = inventory?.hands[side];
      if (held) {
        hiddenArms[side] = true;
        if (defOf(inventory!.registry, held.type).twoHanded) {
          hiddenArms[side === 'right' ? 'left' : 'right'] = true;
        }
      }
    }

    for (const part of PLAYER_ARM_PARTS) {
      const mesh = this.meshes.get(part)!;
      const side = part.startsWith('left') ? 'left' : part.startsWith('right') ? 'right' : undefined;
      const isArm = part.includes('UpperArm') || part.includes('Forearm') || part.includes('Hand');
      mesh.count = isArm && side && hiddenArms[side] ? 0 : 1;
      if (mesh.count === 0) {
        continue;
      }
      const box = PLAYER_BOXES[part];
      const isLeg = part === 'leftLeg' || part === 'rightLeg';
      const stride = (part === 'leftLeg' ? 1 : -1) * Math.sin(gaitPhase) * 0.22;
      this.dummy.position.set(
        body.pos[0] * s + rearX + box.at[0] * Math.cos(yaw) + box.at[2] * Math.sin(yaw),
        body.pos[1] * s + stepOffset + box.at[1],
        body.pos[2] * s + rearZ - box.at[0] * Math.sin(yaw) + box.at[2] * Math.cos(yaw),
      );
      this.dummy.rotation.set(0, yaw, 0);
      if (isLeg && moving) {
        this.dummy.rotateX(stride);
      }
      if (isLeg) {
        this.dummy.translateY(-box.size[1] / 2);
      }
      this.dummy.scale.set(...box.size);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(0, this.dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null;
    }
  }
}
