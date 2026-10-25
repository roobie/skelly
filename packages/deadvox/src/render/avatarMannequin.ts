// Debug mannequin: a second world body, drawn by the player's own figure code, stood near the player so
// each avatar pose can be judged from outside. `?mannequin=` names its first pose; Delete and Insert step
// through the poses. It is a drawing only: no simulation, collision or save knows it.

import { Group, type Object3D } from 'three';
import type { FigureDef, ModelDef } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { ModelLibrary } from './models.ts';
import { type AvatarPose, avatarPoses, PlayerMeshes } from './playerFigure.ts';

/** Metres ahead of and beside the player, by the facing at the first sync, so both bodies show in one view. */
const DISTANCE_AHEAD = 1.2;
const DISTANCE_ASIDE = 1.2;
/** Keys no control binds (`src/content/base/controls.jsonnet`). */
const PREVIOUS_KEY = 'Delete';
const NEXT_KEY = 'Insert';

export interface MannequinPage {
  addEventListener: (type: 'keydown', listener: (event: KeyboardEvent) => void) => void;
  readonly label?: { textContent: string | null };
}

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
  {
    search = globalThis.location?.search ?? '',
    page = globalThis.document
      ? {
          addEventListener: (type, listener) => globalThis.document.addEventListener(type, listener),
          label: labelElement(),
        }
      : { addEventListener: () => undefined },
  }: { search?: string; page?: MannequinPage } = {},
): AvatarMannequin | undefined => {
  const requested = debug ? new URLSearchParams(search).get('mannequin') : null;
  if (requested === null) {
    return undefined;
  }
  const meshes = new PlayerMeshes(blockSize, figure, modelDefs, models);
  const mannequin = new AvatarMannequin(blockSize, meshes, avatarPoses(figure), { requested, label: page.label });
  scene.add(mannequin.group);
  page.addEventListener('keydown', (event) => mannequin.handleKey(event));
  return mannequin;
};

const labelElement = (): HTMLElement => {
  const label = document.createElement('div');
  label.style.cssText =
    'position:fixed;left:12px;top:220px;padding:2px 6px;background:#000a;color:#fff;font:12px monospace;z-index:9;pointer-events:none';
  document.body.append(label);
  return label;
};

export class AvatarMannequin {
  readonly group = new Group();
  private readonly label: { textContent: string | null } | undefined;
  private index: number;
  private placed: { position: Vec3; yaw: number } | undefined;
  private gaitPhase = 0;

  private readonly blockSize: number;
  private readonly meshes: PlayerMeshes;
  readonly poses: readonly AvatarPose[];

  constructor(
    blockSize: number,
    meshes: PlayerMeshes,
    poses: readonly AvatarPose[],
    { requested, label }: { requested: string; label?: { textContent: string | null } | undefined },
  ) {
    this.blockSize = blockSize;
    this.meshes = meshes;
    this.poses = poses;
    this.index = Math.max(
      0,
      this.poses.findIndex((pose) => pose.name === requested),
    );
    this.label = label;
    this.group.add(this.meshes.group);
    this.showLabel();
  }

  get pose(): AvatarPose {
    return this.poses[this.index]!;
  }

  select(name: string): boolean {
    const index = this.poses.findIndex((pose) => pose.name === name);
    if (index < 0) {
      return false;
    }
    this.index = index;
    this.showLabel();
    return true;
  }

  handleKey(event: Pick<KeyboardEvent, 'code' | 'target'>): void {
    const target = event.target as Partial<HTMLElement> | null;
    if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
      return;
    }
    const steps: Record<string, number> = { [NEXT_KEY]: 1, [PREVIOUS_KEY]: -1 };
    const step = steps[event.code];
    if (step !== undefined) {
      this.index = (this.index + step + this.poses.length) % this.poses.length;
      this.showLabel();
    }
  }

  /** The first call stands the mannequin ahead and aside of the player, facing back; later calls keep it there. */
  sync(player: { bodyPosition: Vec3; yaw: number; dt: number; visible: boolean }): void {
    this.group.visible = player.visible;
    if (!this.placed) {
      const ahead = DISTANCE_AHEAD / this.blockSize;
      const aside = DISTANCE_ASIDE / this.blockSize;
      const [x, y, z] = player.bodyPosition;
      const { yaw } = player;
      this.placed = {
        position: [
          x - Math.sin(yaw) * ahead + Math.cos(yaw) * aside,
          y,
          z - Math.cos(yaw) * ahead - Math.sin(yaw) * aside,
        ],
        yaw: player.yaw + Math.PI,
      };
    }
    const { moving, stance } = this.pose;
    this.gaitPhase += player.dt * 6;
    this.meshes.sync({
      body: { pos: this.placed.position, vel: [0, 0, 0], halfWidth: 0, height: 0, onGround: true },
      yaw: this.placed.yaw,
      stepOffset: 0,
      gaitPhase: this.gaitPhase,
      moving,
      stance,
      dt: player.dt,
      thirdPerson: true,
    });
  }

  private showLabel(): void {
    if (this.label) {
      this.label.textContent = `mannequin: ${this.pose.name} (${PREVIOUS_KEY} / ${NEXT_KEY} change)`;
    }
  }
}
