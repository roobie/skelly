import type { HandSide } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import type { ActionMenu } from './actionMenu.ts';
import type { ItemAction } from './itemActions.ts';
import { PressHoldInput } from './pressHoldInput.ts';

/** The press that uses a held item: the dominant use, the off-hand use, or the forward mouse button. */
export type HeldActionTrigger = 'dominant' | 'off' | 'forward';

/** A lone action keeps its own hold, such as a weapon's charge or a magazine's stripping, so only a choice opens. */
export const heldMenuOpens = (actions: readonly ItemAction[]): boolean => actions.length >= 2;

/** What else may own a use press at the moment it is made. */
export interface HeldUseState {
  replaying: boolean;
  throwingStance: boolean;
  inputLocked: boolean;
  actionRefused: boolean;
  building: boolean;
  /** The melee guard is held, so the dominant hold is the power attack. */
  enGarde: boolean;
  /** The off hand has a use the forward button reaches. */
  offHandUse: boolean;
}

/**
 * Whether a use press goes to the held item's action press rather than its other owner. En-garde keeps the dominant
 * hold for the power attack, so a fighter's press never opens a menu.
 */
export const heldUsePressTaken = (trigger: HeldActionTrigger, state: HeldUseState): boolean =>
  !(
    state.replaying ||
    state.throwingStance ||
    state.inputLocked ||
    state.actionRefused ||
    state.building ||
    (trigger === 'dominant' && state.enGarde) ||
    (trigger === 'forward' && !state.offHandUse)
  );

export interface HeldActionPressPorts {
  menu: ActionMenu;
  item: (hand: HandSide) => Item | undefined;
  /** The item's raw actions, which decide whether its use opens a menu. */
  actions: (item: Item) => readonly ItemAction[];
  /** The entries its menu shows. */
  menuActions: (item: Item) => readonly ItemAction[];
  holdRealMs: number;
  /** The ordinary use the press would have made, run once on a tap. */
  tap: (hand: HandSide, trigger: HeldActionTrigger) => void;
  /** Runs the chosen action once. */
  act: (item: Item, actionId: string) => void;
}

/**
 * Owns the use press of a held item with a choice of actions: a tap keeps the ordinary use, a hold opens the item's
 * action menu, and the release confirms what the menu points at. Releasing at the centre chooses nothing. A ring
 * already open, as Back from a child list leaves it, is confirmed by the next press's release.
 */
export class HeldActionPress {
  private readonly ports: HeldActionPressPorts;
  private readonly gesture: PressHoldInput<HeldActionTrigger>;
  private pressed: Readonly<{ hand: HandSide; uid: number; trigger: HeldActionTrigger }> | undefined;
  /** The press whose release confirms the open held menu. */
  private menuTrigger: HeldActionTrigger | undefined;

  constructor(ports: HeldActionPressPorts) {
    this.ports = ports;
    this.gesture = new PressHoldInput({
      holdRealMs: () => ports.holdRealMs,
      tap: (trigger) => this.tapped(trigger),
      hold: (trigger) => this.held(trigger),
    });
  }

  /** Takes the press when the item in `hand` has a choice; false leaves it to the ordinary use. */
  press(hand: HandSide, trigger: HeldActionTrigger, at: number): boolean {
    const item = this.ports.item(hand);
    if (this.pressed || !item || !heldMenuOpens(this.ports.actions(item))) {
      return false;
    }
    this.pressed = { hand, uid: item.uid, trigger };
    if (this.ports.menu.isOpen('held', item.uid) && !this.ports.menu.childOpen) {
      // Back from a child list leaves the ring open, so this press confirms it rather than starting a new gesture.
      this.menuTrigger = trigger;
      return true;
    }
    this.ports.menu.close();
    this.gesture.keyDown(trigger, at);
    return true;
  }

  update(at: number): void {
    this.gesture.update(at);
  }

  release(trigger: HeldActionTrigger, at: number): void {
    if (this.pressed?.trigger !== trigger) {
      return;
    }
    this.gesture.keyUp(trigger, at);
    const item = this.pressedItem();
    if (this.menuTrigger === trigger && item && this.ports.menu.isOpen('held', item.uid)) {
      const choice = this.ports.menu.confirm(this.ports.menuActions(item));
      if (choice) {
        this.ports.act(item, choice.id);
      }
    }
    this.menuTrigger = undefined;
    this.pressed = undefined;
  }

  /**
   * Forgets the press and closes the ring it holds open, as losing focus or a refusal does. A child list its release
   * opened is a menu of its own, closed by Back or Escape, so the input context change it causes cannot close it.
   */
  cancel(): void {
    const ringHeld = this.menuTrigger !== undefined;
    this.gesture.cancel();
    this.pressed = undefined;
    this.menuTrigger = undefined;
    if (ringHeld && this.ports.menu.opened?.source === 'held') {
      this.ports.menu.close();
    }
  }

  /** The pressed item while it is still in the hand that pressed it. */
  private pressedItem(): Item | undefined {
    const item = this.pressed && this.ports.item(this.pressed.hand);
    return item && item.uid === this.pressed?.uid ? item : undefined;
  }

  private tapped(trigger: HeldActionTrigger): void {
    if (this.pressed && this.pressedItem()) {
      this.ports.tap(this.pressed.hand, trigger);
    }
  }

  private held(trigger: HeldActionTrigger): void {
    const item = this.pressedItem();
    if (item) {
      this.ports.menu.open('held', item, this.ports.menuActions(item));
      this.menuTrigger = trigger;
    }
  }
}
