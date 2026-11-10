import type { ActionMenuSource, ActionMenuTuning } from '../core/actionMenuContent.ts';
import type { ItemAction } from './itemActions.ts';

export interface RadialAction extends ItemAction {
  /** Clockwise from straight up. */
  readonly angleRadians: number;
}

type PointTuning = Pick<ActionMenuTuning, 'radiusPixels' | 'deadZonePixels' | 'selectionHalfAngleDegrees'>;

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Each action at its authored direction, so a menu's entries keep their places whatever else it shows. */
export const radialEntries = (
  actions: readonly ItemAction[],
  directions: Readonly<Record<string, number>>,
): RadialAction[] =>
  actions.map((action) => {
    const degrees = directions[action.id];
    if (degrees === undefined) {
      throw new Error(`No radial direction for action "${action.id}"`);
    }
    return { ...action, angleRadians: radians(degrees) };
  });

/**
 * The entry a pull of (`x`, `y`) screen pixels points at. A pull inside the dead zone, or outside every entry's
 * half-angle, points at none, so a small or ambiguous movement never picks an action.
 */
export const radialEntryIndex = (
  x: number,
  y: number,
  actions: readonly RadialAction[],
  tuning: Pick<PointTuning, 'deadZonePixels' | 'selectionHalfAngleDegrees'>,
): number | undefined => {
  if (Math.hypot(x, y) <= tuning.deadZonePixels) {
    return undefined;
  }
  const angle = Math.atan2(x, -y);
  let nearest: number | undefined;
  let nearestGap = Number.POSITIVE_INFINITY;
  actions.forEach((action, index) => {
    const delta = angle - action.angleRadians;
    const gap = Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
    if (gap < nearestGap) {
      nearest = index;
      nearestGap = gap;
    }
  });
  return nearestGap <= radians(tuning.selectionHalfAngleDegrees) ? nearest : undefined;
};

/** A held item's treatments gather under one entry, so a body's wounds cannot crowd the ring. */
export const heldMenuActions = (actions: readonly ItemAction[], treatLabel: string): readonly ItemAction[] => {
  const treatments = actions.filter((action) => action.treatment);
  const direct = actions.filter((action) => !action.treatment);
  return treatments.length > 0 ? [...direct, { id: 'treat', label: treatLabel, children: treatments }] : direct;
};

/**
 * The one open action menu, for a furniture piece or a held item. Callers pass the current actions on every call, so
 * an action that went away since the menu opened is never chosen. Nothing is chosen until the player points at or
 * steps to an entry.
 */
export class ActionMenu {
  private target: Readonly<{ source: ActionMenuSource; uid: number }> | undefined;
  private x = 0;
  private y = 0;
  private selectedId: string | undefined;
  private parentId: string | undefined;

  /** Opens even for one action, so the player sees what confirming will do. */
  open(source: ActionMenuSource, target: { uid: number }, actions: readonly ItemAction[]): void {
    if (actions.length === 0) {
      return;
    }
    this.close();
    this.target = { source, uid: target.uid };
  }

  get opened(): Readonly<{ source: ActionMenuSource; uid: number }> | undefined {
    return this.target;
  }

  isOpen(source: ActionMenuSource, uid: number): boolean {
    return this.target?.source === source && this.target.uid === uid;
  }

  get pull(): Readonly<{ x: number; y: number }> {
    return { x: this.x, y: this.y };
  }

  get childOpen(): boolean {
    return this.parentId !== undefined;
  }

  /** Moves the pull by `movement` pixels, held within the ring, and selects what it then points at. */
  point(actions: readonly RadialAction[], movement: { x: number; y: number }, tuning: PointTuning): void {
    if (!this.target || this.childOpen) {
      return;
    }
    this.x += movement.x;
    this.y += movement.y;
    const length = Math.hypot(this.x, this.y);
    if (length > tuning.radiusPixels) {
      this.x *= tuning.radiusPixels / length;
      this.y *= tuning.radiusPixels / length;
    }
    const index = radialEntryIndex(this.x, this.y, actions, tuning);
    this.selectedId = index === undefined ? undefined : actions[index]!.id;
  }

  /** Selects the next entry clockwise, or anticlockwise for a negative `direction`. */
  step(actions: readonly RadialAction[], direction: number): boolean {
    if (!this.target || this.childOpen || direction === 0 || actions.length === 0) {
      return false;
    }
    const ring = [...actions].sort((a, b) => a.angleRadians - b.angleRadians);
    const index = ring.findIndex((action) => action.id === this.selectedId);
    let next = direction > 0 ? 0 : ring.length - 1;
    if (index >= 0) {
      next = (index + Math.sign(direction) + ring.length) % ring.length;
    }
    this.selectedId = ring[next]!.id;
    return true;
  }

  choice(actions: readonly ItemAction[]): ItemAction | undefined {
    return this.target && !this.childOpen ? actions.find((action) => action.id === this.selectedId) : undefined;
  }

  /**
   * Closes the menu and returns the chosen action, or opens the chosen entry's child list and returns nothing.
   * Confirming with nothing chosen closes the menu without acting.
   */
  confirm(actions: readonly ItemAction[]): ItemAction | undefined {
    if (this.childOpen) {
      return undefined;
    }
    const chosen = this.choice(actions);
    if (chosen?.children) {
      this.parentId = chosen.id;
      return undefined;
    }
    this.close();
    return chosen;
  }

  /** The open child list's entries among the current `actions`, or nothing once its parent has gone. */
  childList(actions: readonly ItemAction[]): readonly ItemAction[] | undefined {
    return this.childOpen ? actions.find((action) => action.id === this.parentId)?.children : undefined;
  }

  /**
   * Picks `id` from the current `children` and closes the menu. No `id` goes back to the ring with nothing selected;
   * an id no longer among `children` closes the menu without acting.
   */
  chooseChild(id: string | undefined, children: readonly ItemAction[]): ItemAction | undefined {
    if (!this.childOpen) {
      return undefined;
    }
    if (id === undefined) {
      this.parentId = undefined;
      this.selectedId = undefined;
      this.x = 0;
      this.y = 0;
      return undefined;
    }
    const chosen = children.find((action) => action.id === id);
    this.close();
    return chosen;
  }

  close(): void {
    this.target = undefined;
    this.x = 0;
    this.y = 0;
    this.selectedId = undefined;
    this.parentId = undefined;
  }

  /** Closes a `source` menu once its target is no longer `uid`, and any menu while paused. */
  sync(source: ActionMenuSource, uid: number | undefined, paused = false): void {
    if (paused || (this.target?.source === source && this.target.uid !== uid)) {
      this.close();
    }
  }
}
