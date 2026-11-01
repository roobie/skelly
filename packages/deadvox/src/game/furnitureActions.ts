import { type ItemAction, ItemActionSelection } from './itemActions.ts';

export interface RadialAction extends ItemAction {
  readonly angleRadians: number;
}

export const radialEntries = (
  actions: readonly ItemAction[],
  slots: Readonly<Record<string, number>>,
): RadialAction[] =>
  actions.map((action) => {
    const degrees = slots[action.id];
    if (degrees === undefined) {
      throw new Error(`No radial slot for action "${action.id}"`);
    }
    return { ...action, angleRadians: (degrees * Math.PI) / 180 };
  });

export const radialEntryIndex = (
  x: number,
  y: number,
  actions: readonly RadialAction[],
  deadZone: number,
): number | undefined => {
  if (Math.hypot(x, y) <= deadZone) {
    return undefined;
  }
  const angle = Math.atan2(x, -y);
  let nearest: number | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  actions.forEach((action, index) => {
    const delta = angle - action.angleRadians;
    const distance = Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  return nearest;
};

export class FurnitureActionSelection extends ItemActionSelection {
  private uid: number | undefined;
  private x = 0;
  private y = 0;
  private armed = false;

  choice(entity: { uid: number }, actions: readonly ItemAction[]): ItemAction | undefined {
    return this.isOpen(entity) && this.armed ? this.forItem(entity, actions) : undefined;
  }

  override step(entity: { uid: number }, actions: readonly ItemAction[], direction: number): boolean {
    if (!this.isOpen(entity) || direction === 0 || actions.length === 0) {
      return false;
    }
    super.step(entity, actions, direction);
    this.armed = true;
    return true;
  }

  get openedUid(): number | undefined {
    return this.uid;
  }

  page<Action extends ItemAction>(entity: { uid: number }, actions: readonly Action[], cap: number): readonly Action[] {
    const selected = this.forItem(entity, actions);
    const index = actions.findIndex((action) => action.id === selected?.id);
    const start = Math.floor(Math.max(0, index) / cap) * cap;
    return actions.slice(start, start + cap);
  }

  point(
    entity: { uid: number },
    actions: readonly RadialAction[],
    movement: { x: number; y: number },
    tuning: { radiusPixels: number; deadZonePixels: number; entryCap: number },
  ): void {
    this.x += movement.x;
    this.y += movement.y;
    const length = Math.hypot(this.x, this.y);
    if (length > tuning.radiusPixels) {
      this.x *= tuning.radiusPixels / length;
      this.y *= tuning.radiusPixels / length;
    }
    const page = this.page(entity, actions, tuning.entryCap);
    const index = radialEntryIndex(this.x, this.y, page, tuning.deadZonePixels);
    this.armed = index !== undefined;
    if (index !== undefined) {
      this.selected.set(entity.uid, page[index]!.id);
    }
  }

  constructor(openCanLabel: string) {
    super(openCanLabel);
  }

  open(entity: { uid: number }, actions: readonly ItemAction[]): void {
    this.uid = entity.uid;
    this.x = 0;
    this.y = 0;
    this.armed = false;
    this.forItem(entity, actions);
  }

  isOpen(entity: { uid: number }): boolean {
    return this.uid === entity.uid;
  }

  sync(targetUid: number | undefined, paused = false): void {
    if (paused || targetUid !== this.uid) {
      this.uid = undefined;
    }
  }

  confirm(entity: { uid: number }, actions: readonly ItemAction[]): ItemAction | undefined {
    const action = this.choice(entity, actions);
    this.uid = undefined;
    return action;
  }
}
