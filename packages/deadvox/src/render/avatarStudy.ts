// Debug look study for the player figure: authored body models stood beside the box figure in the
// third-person view, so the art direction and the voxel class can be judged by eye. `?avatarStudy=` names
// the model ids to show, comma-separated.

import { Group, type Object3D } from 'three';
import type { Vec3 } from '../core/coords.ts';
import { FIGURE_BOXES } from '../core/zombieRegions.ts';
import type { ModelLibrary } from './models.ts';
import { type PlayerFigurePlacement, setPlayerFigurePosition } from './playerFigure.ts';
import { castsAndReceives, PLAYER_FIGURE_LAYER } from './shadowFlags.ts';

/** Metres between neighbouring figures, centre to centre. */
const SPACING = 0.7;

/** The study the debug query asks for, added to the scene; it holds no figure when the query is off or names none. */
export const createAvatarStudy = (scene: Object3D, debug: boolean, blockSize: number, models: ModelLibrary) => {
  const search = debug ? (globalThis.location?.search ?? '') : '';
  const ids = (new URLSearchParams(search).get('avatarStudy') ?? '').split(',').filter(Boolean);
  const study = new AvatarStudy(blockSize, ids, models);
  scene.add(study.group);
  return study;
};

class AvatarStudy {
  readonly group = new Group();
  private readonly figures = new Map<string, Group>();
  private readonly placement: PlayerFigurePlacement;
  private readonly localPosition: Vec3 = [0, 0, 0];
  private readonly ids: readonly string[];
  private readonly models: ModelLibrary;

  constructor(blockSize: number, ids: readonly string[], models: ModelLibrary) {
    this.ids = ids;
    this.models = models;
    this.placement = { bodyPosition: [0, 0, 0], yaw: 0, blockSize, thirdPerson: true };
  }

  /** The figures stand on the player's two sides in turn, nearest first; the box figure stays in the middle. */
  sync(pose: { bodyPosition: Vec3; yaw: number; stepOffset: number; visible: boolean }): void {
    this.group.visible = pose.visible;
    if (!pose.visible) {
      return;
    }
    this.placement.bodyPosition = pose.bodyPosition;
    this.placement.yaw = pose.yaw;
    this.ids.forEach((id, index) => {
      const figure = this.figure(id);
      if (!figure) {
        return;
      }
      // The model's head top meets the box figure's head top, whatever the model's own height.
      const top = this.models.partBounds(id)!.max.y;
      const side = index % 2 === 0 ? 1 : -1;
      this.localPosition[0] = side * SPACING * (Math.floor(index / 2) + 1);
      this.localPosition[1] = pose.stepOffset + FIGURE_BOXES.head.at[1] + FIGURE_BOXES.head.size[1] / 2 - top;
      setPlayerFigurePosition(figure.position, this.placement, this.localPosition);
      // Models face +z and the box figure faces -z.
      figure.rotation.y = pose.yaw + Math.PI;
    });
  }

  private figure(id: string): Group | undefined {
    const known = this.figures.get(id);
    if (known) {
      return known;
    }
    const model = this.models.part(id);
    if (!model) {
      return undefined;
    }
    const figure = new Group();
    figure.name = `avatar-study-${id}`;
    figure.add(model);
    figure.traverse((object) => object.layers.set(PLAYER_FIGURE_LAYER));
    this.figures.set(id, figure);
    this.group.add(castsAndReceives(figure));
    return figure;
  }
}
