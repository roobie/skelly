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
import type { Vec3 } from '../core/coords.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf } from '../core/items.ts';
import type { Body } from '../core/physics.ts';
import { FIGURE_BOXES, type FigureBox } from '../core/zombieRegions.ts';
import { PLAYER_ARM_BOXES } from './figure.ts';
import { withHeightFog } from './heightFog.ts';
import { castsAndReceives, PLAYER_FIGURE_LAYER } from './shadowFlags.ts';

/** Metres behind the eye; leaves the torso's front face 5 cm behind the eye. */
export const PLAYER_BODY_REAR_OFFSET = 0.19;
const BODY_HIP_HEIGHT = 0.62;
export const PLAYER_ARM_PARTS = [
  'body',
  'head',
  'leftUpperArm',
  'rightUpperArm',
  'leftForearm',
  'rightForearm',
  'leftHand',
  'rightHand',
  'leftLeg',
  'rightLeg',
  'leftFoot',
  'rightFoot',
] as const;
export type PlayerArmPart = (typeof PLAYER_ARM_PARTS)[number];

const PLAYER_BOXES: Readonly<Record<PlayerArmPart, FigureBox>> = {
  body: FIGURE_BOXES.body,
  head: FIGURE_BOXES.head,
  leftUpperArm: PLAYER_ARM_BOXES.leftUpperArm,
  rightUpperArm: PLAYER_ARM_BOXES.rightUpperArm,
  leftForearm: PLAYER_ARM_BOXES.leftForearm,
  rightForearm: PLAYER_ARM_BOXES.rightForearm,
  leftHand: PLAYER_ARM_BOXES.leftHand,
  rightHand: PLAYER_ARM_BOXES.rightHand,
  leftLeg: FIGURE_BOXES.leftLeg,
  rightLeg: FIGURE_BOXES.rightLeg,
  leftFoot: { size: [0.18, 0.12, 0.28], at: [-0.12, 0.06, -0.16] },
  rightFoot: { size: [0.18, 0.12, 0.28], at: [0.12, 0.06, -0.16] },
};

const PLAYER_COLORS: Readonly<Record<PlayerArmPart, keyof FigureDef['palette']>> = {
  body: 'shirt',
  head: 'skin',
  leftUpperArm: 'shirt',
  rightUpperArm: 'shirt',
  leftForearm: 'skin',
  rightForearm: 'skin',
  leftHand: 'skin',
  rightHand: 'skin',
  leftLeg: 'trousers',
  rightLeg: 'trousers',
  leftFoot: 'trousers',
  rightFoot: 'trousers',
};

export const FIRST_PERSON_SHOULDER: Readonly<Record<HandSide, Vec3>> = {
  right: [0.3, -0.55, 0.05],
  left: [-0.3, -0.55, 0.05],
};
const SEGMENT_UP = new Vector3(0, 1, 0);
const segmentDirection = new Vector3();

const armSideOf = (part: PlayerArmPart): HandSide | undefined => {
  if (part.startsWith('left')) {
    return 'left';
  }
  if (part.startsWith('right')) {
    return 'right';
  }
  return undefined;
};

const isArmPart = (part: PlayerArmPart): boolean =>
  part.includes('UpperArm') || part.includes('Forearm') || part.includes('Hand');

const hiddenWorldArms = (inventory?: Inventory): Record<HandSide, boolean> => {
  const hidden: Record<HandSide, boolean> = { right: false, left: false };
  if (!inventory) {
    return hidden;
  }
  for (const side of ['right', 'left'] as const) {
    const held = inventory.hands[side];
    if (!held) {
      continue;
    }
    hidden[side] = true;
    if (defOf(inventory.registry, held.type).twoHanded) {
      hidden[side === 'right' ? 'left' : 'right'] = true;
    }
  }
  return hidden;
};

export const placeFirstPersonSegment = (
  mesh: Mesh,
  start: Vector3,
  end: Vector3,
  { width, depth }: { width: number; depth: number },
): void => {
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
  const shoulder = new Vector3(...FIRST_PERSON_SHOULDER[side]);
  const wrist = new Vector3(...grip);
  const elbow = shoulder.clone().lerp(wrist, 0.56);
  const sleeve = new Mesh(geometry, shirt);
  placeFirstPersonSegment(sleeve, shoulder, elbow, { width: 0.12, depth: 0.12 });
  arm.add(sleeve);
  const forearm = new Mesh(geometry, skin);
  placeFirstPersonSegment(forearm, elbow, wrist, { width: 0.09, depth: 0.09 });
  arm.add(forearm);
  const palm = new Mesh(new BoxGeometry(0.09, 0.08, 0.09), skin);
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
  thirdPerson?: boolean;
  inventory?: Inventory;
}

/** A coloured world figure whose head is visible only in third person. */
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
        withHeightFog(new MeshLambertMaterial({ color: palette[PLAYER_COLORS[part]] }), 'player'),
        1,
      );
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.layers.set(PLAYER_FIGURE_LAYER);
      this.meshes.set(part, mesh);
      this.group.add(castsAndReceives(mesh));
    }
  }

  sync(pose: PlayerFigurePose): void {
    const { yaw, inventory, thirdPerson = false } = pose;
    const s = this.blockSize;
    const rearX = thirdPerson ? 0 : Math.sin(yaw) * PLAYER_BODY_REAR_OFFSET;
    const rearZ = thirdPerson ? 0 : Math.cos(yaw) * PLAYER_BODY_REAR_OFFSET;
    const hidden = thirdPerson ? { right: false, left: false } : hiddenWorldArms(inventory);
    const offset = { blockSize: s, rearX, rearZ };
    for (const part of PLAYER_ARM_PARTS) {
      const mesh = this.meshes.get(part)!;
      const side = armSideOf(part);
      const hiddenHeldArm = isArmPart(part) && side !== undefined && hidden[side];
      const hiddenInFirstPerson = part === 'head' && !thirdPerson;
      mesh.count = hiddenHeldArm || hiddenInFirstPerson ? 0 : 1;
      if (!(hiddenHeldArm || hiddenInFirstPerson)) {
        this.updatePart(part, mesh, pose, offset);
      }
    }
  }

  private updatePart(
    part: PlayerArmPart,
    mesh: InstancedMesh,
    pose: PlayerFigurePose,
    offset: { blockSize: number; rearX: number; rearZ: number },
  ): void {
    const { body, yaw, stepOffset, gaitPhase, moving } = pose;
    const { blockSize, rearX, rearZ } = offset;
    const box = PLAYER_BOXES[part];
    const isLeg = part === 'leftLeg' || part === 'rightLeg';
    const isFoot = part === 'leftFoot' || part === 'rightFoot';
    const stride = (part.startsWith('left') ? 1 : -1) * Math.sin(gaitPhase) * 0.22;
    const footStride = isFoot && moving ? stride : 0;
    const localY = isFoot
      ? BODY_HIP_HEIGHT + (box.at[1] - BODY_HIP_HEIGHT) * Math.cos(footStride) - box.at[2] * Math.sin(footStride)
      : box.at[1];
    const localZ = isFoot
      ? (box.at[1] - BODY_HIP_HEIGHT) * Math.sin(footStride) + box.at[2] * Math.cos(footStride)
      : box.at[2];
    this.dummy.position.set(
      body.pos[0] * blockSize + rearX + box.at[0] * Math.cos(yaw) + localZ * Math.sin(yaw),
      body.pos[1] * blockSize + stepOffset + localY,
      body.pos[2] * blockSize + rearZ - box.at[0] * Math.sin(yaw) + localZ * Math.cos(yaw),
    );
    this.dummy.rotation.order = 'YXZ';
    this.dummy.rotation.set(footStride, yaw, 0);
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
