import type { ActionMenuSource, ActionMenuTuning } from '../core/actionMenuContent.ts';
import type { ItemAction } from './itemActions.ts';

export interface RadialAction extends ItemAction {
  /** Clockwise from straight up. */
  readonly angleRadians: number;
  /** The child ring this entry opens instead of acting itself. */
  readonly children?: readonly RadialAction[];
}

type PointTuning = Pick<ActionMenuTuning, 'radiusPixels' | 'deadZonePixels' | 'selectionHalfAngleDegrees'>;

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Each action at its authored direction, so a menu's entries keep their places whatever else it shows. `key` names
 * the direction an action takes, its id unless the menu places entries by something else.
 */
export const radialEntries = (
  actions: readonly ItemAction[],
  directions: Readonly<Record<string, number>>,
  key: (action: ItemAction) => string | undefined = (action) => action.id,
): RadialAction[] =>
  actions.map((action) => {
    const name = key(action);
    const degrees = name === undefined ? undefined : directions[name];
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

/**
 * A held item's entries. Its treatments gather under one entry, so a body's wounds cannot crowd the ring, and its
 * child ring places each wound by body region, so a hand learns where a wound lies.
 */
export const heldRadialEntries = (
  actions: readonly ItemAction[],
  treatLabel: string,
  directions: Pick<ActionMenuTuning['directions'], 'held' | 'treat'>,
): RadialAction[] => {
  const treatments = actions.filter((action) => action.treatment);
  const direct = radialEntries(
    actions.filter((action) => !action.treatment),
    directions.held,
  );
  if (treatments.length === 0) {
    return direct;
  }
  const [treat] = radialEntries([{ id: 'treat', label: treatLabel }], directions.held);
  const children = radialEntries(treatments, directions.treat, (action) => action.treatment?.region);
  return [...direct, { ...treat!, children }];
};

/**
 * The one open action menu, for a furniture piece or a held item. Callers pass the current entries on every call, so
 * an action that went away since the menu opened is never chosen. With alternatives, nothing is chosen until the
 * player points at or steps to an entry. Child rings keep the same choice grammar without adding a lone-entry step.
 */
export class ActionMenu {
  private target: Readonly<{ source: ActionMenuSource; uid: number }> | undefined;
  private x = 0;
  private y = 0;
  private selectedId: string | undefined;
  private parentId: string | undefined;

  /** Returns a lone action to its caller to run; only alternatives need a menu. */
  open(source: ActionMenuSource, target: { uid: number }, actions: readonly RadialAction[]): RadialAction | undefined {
    this.close();
    const sole = actions.length === 1 ? actions[0] : undefined;
    if (sole && !sole.children) {
      return sole;
    }
    if (sole?.children?.length === 1) {
      return sole.children[0];
    }
    if (actions.length === 0 || sole?.children?.length === 0) {
      return undefined;
    }
    this.target = { source, uid: target.uid };
    if (sole) {
      this.enter(sole.id);
    }
    return undefined;
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

  canReturn(actions: readonly RadialAction[]): boolean {
    return this.childOpen && actions.length > 1;
  }

  /** Losing alternatives cancels rather than choosing an unseen fallback. */
  ring(actions: readonly RadialAction[]): readonly RadialAction[] | undefined {
    if (!this.target) {
      return undefined;
    }
    const ring = this.childOpen ? actions.find((action) => action.id === this.parentId)?.children : actions;
    if (ring && ring.length > 1) {
      return ring;
    }
    this.close();
    return undefined;
  }

  /** Moves the pull by `movement` pixels, held within the ring, and selects what it then points at. */
  point(actions: readonly RadialAction[], movement: { x: number; y: number }, tuning: PointTuning): void {
    const ring = this.ring(actions);
    if (!ring) {
      return;
    }
    this.x += movement.x;
    this.y += movement.y;
    const length = Math.hypot(this.x, this.y);
    if (length > tuning.radiusPixels) {
      this.x *= tuning.radiusPixels / length;
      this.y *= tuning.radiusPixels / length;
    }
    const index = radialEntryIndex(this.x, this.y, ring, tuning);
    this.selectedId = index === undefined ? undefined : ring[index]!.id;
  }

  /** Selects the next entry clockwise, or anticlockwise for a negative `direction`. */
  step(actions: readonly RadialAction[], direction: number): boolean {
    const ring = this.ring(actions);
    if (!ring || direction === 0 || ring.length === 0) {
      return false;
    }
    const sorted = [...ring].sort((a, b) => a.angleRadians - b.angleRadians);
    const index = sorted.findIndex((action) => action.id === this.selectedId);
    let next = direction > 0 ? 0 : sorted.length - 1;
    if (index >= 0) {
      next = (index + Math.sign(direction) + sorted.length) % sorted.length;
    }
    this.selectedId = sorted[next]!.id;
    return true;
  }

  choice(actions: readonly RadialAction[]): RadialAction | undefined {
    return this.ring(actions)?.find((action) => action.id === this.selectedId);
  }

  /**
   * Returns the chosen action or its sole child; child alternatives open their own ring.
   * An unchosen child ring returns to a parent with alternatives, otherwise closes without acting.
   */
  confirm(actions: readonly RadialAction[]): RadialAction | undefined {
    const chosen = this.choice(actions);
    if (chosen?.children) {
      if (chosen.children.length > 1) {
        this.enter(chosen.id);
        return undefined;
      }
      this.close();
      return chosen.children[0];
    }
    if (!chosen && this.canReturn(actions)) {
      this.enter(undefined);
      return undefined;
    }
    this.close();
    return chosen;
  }

  close(): void {
    this.target = undefined;
    this.enter(undefined);
  }

  /** Closes a `source` menu once its target is no longer `uid`, and any menu while paused. */
  sync(source: ActionMenuSource, uid: number | undefined, paused = false): void {
    if (paused || (this.target?.source === source && this.target.uid !== uid)) {
      this.close();
    }
  }

  /** Shows `parentId`'s child ring, or the top ring for none, with nothing selected. */
  private enter(parentId: string | undefined): void {
    this.parentId = parentId;
    this.selectedId = undefined;
    this.x = 0;
    this.y = 0;
  }
}
