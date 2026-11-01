import { type ItemAction, ItemActionSelection } from './itemActions.ts';

export const radialEntryIndex = (x: number, y: number, count: number, deadZone: number): number | undefined => {
  if (count === 0 || Math.hypot(x, y) <= deadZone) {
    return undefined;
  }
  const turn = Math.PI * 2;
  const angle = (Math.atan2(x, -y) + turn) % turn;
  return Math.floor((angle / turn) * count + 0.5) % count;
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

  page(entity: { uid: number }, actions: readonly ItemAction[], cap: number): readonly ItemAction[] {
    const index = actions.indexOf(this.forItem(entity, actions)!);
    const start = Math.floor(Math.max(0, index) / cap) * cap;
    return actions.slice(start, start + cap);
  }

  point(
    entity: { uid: number },
    actions: readonly ItemAction[],
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
    const index = radialEntryIndex(this.x, this.y, page.length, tuning.deadZonePixels);
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
