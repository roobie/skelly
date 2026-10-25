// Debug mannequin: a second world body, drawn by the player's own figure code, stood near the player so
// each avatar pose can be judged from outside. It is a drawing only: no simulation, collision or save knows it.

import { Group, type Object3D } from 'three';
import type { FigureDef, ModelDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Body } from '../core/physics.ts';
import type { ModelLibrary } from './models.ts';
import { type AvatarPose, avatarPoses, type PlayerFigurePose, PlayerMeshes } from './playerFigure.ts';

/** Metres ahead of and beside the player, by the facing at the first sync, so both bodies show in one view. */
const DISTANCE_AHEAD = 1.2;
const DISTANCE_ASIDE = 1.2;
/** Radians of gait phase per real second while the mannequin walks. */
const GAIT_RATE = 6;

export interface MannequinFigure {
  debug: boolean;
  blockSize: number;
  figure: FigureDef;
  modelDefs: ReadonlyMap<string, Pick<ModelDef, 'anchors'>>;
  models: ModelLibrary;
}

/** The mannequin the debug query asks for, added to the scene; undefined when debug is off or the query is absent. */
export const createAvatarMannequin = (
  scene: Object3D,
  { debug, blockSize, figure, modelDefs, models }: MannequinFigure,
  search: string = globalThis.location?.search ?? '',
): AvatarMannequin | undefined => {
  const requested = debug ? new URLSearchParams(search).get('mannequin') : null;
  if (requested === null) {
    return undefined;
  }
  const meshes = new PlayerMeshes(blockSize, figure, modelDefs, models);
  const mannequin = new AvatarMannequin(blockSize, meshes, avatarPoses(figure), requested);
  scene.add(mannequin.group);
  return mannequin;
};

export class AvatarMannequin {
  readonly group = new Group();
  readonly poses: readonly AvatarPose[];
  private readonly blockSize: number;
  private readonly meshes: PlayerMeshes;
  private index: number;
  private placed = false;
  private readonly body: Body = { pos: [0, 0, 0], vel: [0, 0, 0], halfWidth: 0, height: 0, onGround: true };
  private readonly figurePose: PlayerFigurePose;

  constructor(blockSize: number, meshes: PlayerMeshes, poses: readonly AvatarPose[], requested: string) {
    this.blockSize = blockSize;
    this.meshes = meshes;
    this.poses = poses;
    this.index = Math.max(
      0,
      poses.findIndex((pose) => pose.name === requested),
    );
    this.figurePose = {
      body: this.body,
      yaw: 0,
      stepOffset: 0,
      gaitPhase: 0,
      moving: false,
      stance: 'standing',
      dt: 0,
      thirdPerson: true,
    };
    this.group.add(meshes.group);
  }

  get pose(): AvatarPose {
    return this.poses[this.index]!;
  }

  /** Moves to the next pose, or the previous one for a negative `delta`, wrapping round. */
  step(delta: number): void {
    this.index = (this.index + delta + this.poses.length) % this.poses.length;
  }

  /** The first call stands the mannequin ahead and aside of the player, facing back; later calls keep it there. */
  sync(playerPosition: Vec3, playerYaw: number, dt: number): void {
    const { body, figurePose } = this;
    if (!this.placed) {
      this.placed = true;
      const ahead = DISTANCE_AHEAD / this.blockSize;
      const aside = DISTANCE_ASIDE / this.blockSize;
      body.pos[0] = playerPosition[0] - Math.sin(playerYaw) * ahead + Math.cos(playerYaw) * aside;
      body.pos[1] = playerPosition[1];
      body.pos[2] = playerPosition[2] - Math.cos(playerYaw) * ahead - Math.sin(playerYaw) * aside;
      figurePose.yaw = playerYaw + Math.PI;
    }
    const { moving, stance } = this.pose;
    figurePose.gaitPhase += dt * GAIT_RATE;
    figurePose.moving = moving;
    figurePose.stance = stance;
    figurePose.dt = dt;
    this.meshes.sync(figurePose);
  }
}
