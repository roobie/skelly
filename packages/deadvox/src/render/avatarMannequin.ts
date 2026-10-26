// Debug mannequin: a second world body, drawn by the player's own figure code, stood near the player so
// each avatar pose can be judged from outside. It is a drawing only: no simulation, collision or save knows it.

import { Group, type Object3D } from 'three';
import type { FigureDef, ModelDef, Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Item } from '../core/items.ts';
import type { Body } from '../core/physics.ts';
import type { PlayerStance } from '../core/playerStance.ts';
import { heldItemPoses, type ItemHoldPose } from './heldPresentation.ts';
import type { ModelLibrary } from './models.ts';
import { type PlayerFigurePose, PlayerMeshes } from './playerFigure.ts';

/** Radians of gait phase per real second while the mannequin walks. */
const GAIT_RATE = 6;

/** One way the world body can be drawn: a stance, standing still or walking. */
export interface AvatarPose {
  name: string;
  stance: PlayerStance;
  moving: boolean;
  hold?: ItemHoldPose;
  emptyFists?: boolean;
}

/** Every pose the figure row defines: standing and each stance it poses, each still and walking. */
const avatarPoses = (figure: FigureDef, registry: Registry): AvatarPose[] => {
  const posed = Object.keys(figure.stancePoses).filter((key) => key !== 'blendRealSeconds') as PlayerStance[];
  const stances = (['standing', ...posed] as PlayerStance[]).flatMap((stance) => [
    { name: stance, stance, moving: false },
    { name: `${stance}-walking`, stance, moving: true },
  ]);
  return [
    ...stances,
    { name: 'en-garde', stance: 'standing', moving: false, emptyFists: true },
    ...heldItemPoses(registry).map(
      (hold): AvatarPose => ({
        name: hold.name,
        stance: 'standing',
        moving: false,
        hold,
      }),
    ),
  ];
};

export interface MannequinFigure {
  registry: Registry;
  debug: boolean;
  blockSize: number;
  figure: FigureDef;
  modelDefs: ReadonlyMap<string, Pick<ModelDef, 'anchors'>>;
  models: ModelLibrary;
}

/** The mannequin the debug query asks for, added to the scene; undefined when debug is off or the query is absent. */
export const createAvatarMannequin = (
  scene: Object3D,
  { debug, blockSize, figure, modelDefs, models, registry }: MannequinFigure,
  search: string = globalThis.location?.search ?? '',
): AvatarMannequin | undefined => {
  const requested = debug ? new URLSearchParams(search).get('mannequin') : null;
  if (requested === null) {
    return undefined;
  }
  const meshes = new PlayerMeshes(blockSize, figure, modelDefs, models);
  const mannequin = new AvatarMannequin(meshes, avatarPoses(figure, registry), {
    registry,
    blockSize,
    placement: figure.mannequinPlacement,
    requested,
  });
  scene.add(mannequin.group);
  return mannequin;
};

export class AvatarMannequin {
  readonly group = new Group();
  readonly poses: readonly AvatarPose[];
  private readonly blockSize: number;
  private readonly registry: Registry;
  private readonly samples = new Map<string, Item>();
  private readonly placement: FigureDef['mannequinPlacement'];
  private readonly meshes: PlayerMeshes;
  private index: number;
  private placed = false;
  private readonly body: Body = { pos: [0, 0, 0], vel: [0, 0, 0], halfWidth: 0, height: 0, onGround: true };
  private readonly figurePose: PlayerFigurePose;
  /** The player as last synced, which `place` stands the mannequin by. */
  private readonly playerPosition: Vec3 = [0, 0, 0];
  private playerYaw = 0;

  constructor(
    meshes: PlayerMeshes,
    poses: readonly AvatarPose[],
    {
      blockSize,
      placement,
      requested,
      registry,
    }: { blockSize: number; placement: FigureDef['mannequinPlacement']; requested: string; registry: Registry },
  ) {
    this.blockSize = blockSize;
    this.registry = registry;
    this.placement = placement;
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

  dispose(): void {
    this.meshes.dispose();
  }

  get pose(): AvatarPose {
    return this.poses[this.index]!;
  }

  /** Where the mannequin stands, in blocks. */
  get position(): Readonly<Vec3> {
    return this.body.pos;
  }

  /** Moves to the next pose, or the previous one for a negative `delta`, wrapping round. */
  step(delta: number): void {
    this.index = (this.index + delta + this.poses.length) % this.poses.length;
  }

  /** Stands the mannequin ahead and aside of the player as last synced, facing back, and keeps it there. */
  place(): void {
    const [x, y, z] = this.playerPosition;
    const yaw = this.playerYaw;
    const ahead = this.placement.aheadMetres / this.blockSize;
    const aside = this.placement.asideMetres / this.blockSize;
    this.body.pos[0] = x - Math.sin(yaw) * ahead + Math.cos(yaw) * aside;
    this.body.pos[1] = y;
    this.body.pos[2] = z - Math.cos(yaw) * ahead - Math.sin(yaw) * aside;
    this.figurePose.yaw = yaw + Math.PI;
  }

  /** The first call places the mannequin by the player; later calls keep it where it stands. */
  sync(playerPosition: Vec3, playerYaw: number, dt: number): void {
    const { figurePose } = this;
    this.playerPosition[0] = playerPosition[0];
    this.playerPosition[1] = playerPosition[1];
    this.playerPosition[2] = playerPosition[2];
    this.playerYaw = playerYaw;
    if (!this.placed) {
      this.placed = true;
      this.place();
    }
    const { moving, stance, hold, emptyFists } = this.pose;
    let item = hold && this.samples.get(hold.itemType);
    if (hold && !item) {
      // A mannequin sample is presentation only, not a simulated inventory item with ownership or persistence.
      item = { uid: this.samples.size + 1, type: hold.itemType, count: 1, condition: 1 };
      this.samples.set(hold.itemType, item);
    }
    figurePose.heldItems = { registry: this.registry, hands: hold && item ? { [hold.side]: item } : {} };
    figurePose.holdReady = hold?.ready ?? emptyFists ?? false;
    figurePose.emptyFists = emptyFists ?? false;
    figurePose.gaitPhase += dt * GAIT_RATE;
    figurePose.moving = moving;
    figurePose.stance = stance;
    figurePose.dt = dt;
    this.meshes.sync(figurePose);
  }
}
