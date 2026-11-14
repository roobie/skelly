// Routes the player's controls into the simulation: bound input commands and what a replay records of them, which
// modal UI takes a press, the input sample and session controls and trigger at the player tick, replayed actions,
// screen commands, furniture use and the item throw, with the firearm and melee readiness gate those read.

import type { Emote, EmoteMode } from '../core/actionMenuContent.ts';
import { actionText, fillText } from '../core/actionText.ts';
import type { BlockEntity } from '../core/blockEntities.ts';
import { claimed } from '../core/capabilities.ts';
import { dominantSide, offSide } from '../core/character.ts';
import type { Registry } from '../core/content.ts';
import { CHUNK, type Vec3 } from '../core/coords.ts';
import { coreMessage } from '../core/coreText.ts';
import type { RecoveryChoices, WorkOperation } from '../core/craftCommands.ts';
import { throwStanceWorldOffset } from '../core/heldPose.ts';
import { type InputContext, inventoryTabForAction } from '../core/inputActions.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { flightForItem, hasMetThrowMinimumHold, type ItemFlight, throwDistanceForItem } from '../core/itemThrow.ts';
import { offHandUse } from '../core/lights.ts';
import type { RestKind } from '../core/longAction.ts';
import { countText } from '../core/numberText.ts';
import { doorOptions, doorPlan, dropTarget, pocketGroundItem, toHands, wieldOrPocket } from '../core/options.ts';
import { pryPlan } from '../core/prying.ts';
import type { Simulation } from '../core/sim.ts';
import { fillText as fillScreenText } from '../core/textTemplate.ts';
import type { EmoteAvailability } from './actionMenu.ts';
import { continueActionResumesJob } from './continueAction.ts';
import { dispatchReplayStanceAction, type StanceReplayAction } from './crouchProneInput.ts';
import { DOOR_ACTION } from './doorAction.ts';
import { type FirearmShotInput, firearmHandlingFor } from './firearmHandling.ts';
import { FirearmTrigger } from './firearmTrigger.ts';
import { freeLookAllowsCommand, freeLookAllowsUse } from './freeLook.ts';
import { furnitureActionsFor } from './furnitureActions.ts';
import { createHandUse, type HandUse, type InteractionPickWorld } from './handUse.ts';
import type { InputReplayRecorder, ReplayAction, ReplayControlSample } from './inputReplay.ts';
import { routeDominantUse, toggleWalking } from './inputReplayActions.ts';
import { nextReplayInputSample } from './inputReplayDriver.ts';
import { applyReplayLook, type InputReplayPlayer } from './inputReplayPlayer.ts';
import type { ItemAction } from './itemActions.ts';
import { shouldEnterMeleeGuard } from './melee.ts';
import { routeModalCommand } from './modalCommand.ts';
import type { MoveIntent } from './player.ts';
import { adjustLookPitch, type PlayerControls } from './playerControls.ts';
import { applyToHeldItem, type PlayerTickActions } from './playerTickActions.ts';
import { selectPrimaryAction } from './primaryAction.ts';
import { QUICKBAR_SLOTS } from './quickbar.ts';
import { QuickbarActions } from './quickbarActions.ts';
import { stopReadingOnClose } from './readingClose.ts';
import { type ReloadBinding, reloadTarget } from './reloadInput.ts';
import { applyReplayActionPayload, type ReplayActionPayload, type ReplayCommandOwners } from './replayCommands.ts';
import { restKindForFurniture } from './rest.ts';
import { createScreenCommandDispatcher } from './screenCommandDispatcher.ts';
import type { PlayerInputSample, Session, SessionControls } from './session.ts';

const QUICKBAR_ACTION = /^quickbar\.(tap|hold)\.(\d+)$/;

/** A bound action's press or release, stamped with its Real time. */
interface InputCommand {
  readonly action: string;
  readonly phase: 'down' | 'up';
  readonly at: number;
}

const isGestureAction = (action: string): boolean =>
  action === 'firearm.reload' ||
  action === 'player.crouch-toggle' ||
  action === 'player.prone-toggle' ||
  action === 'player.throw' ||
  action === 'light.worn-toggle' ||
  action === 'world.interact' ||
  action === 'emote.menu' ||
  action.startsWith('quickbar.use.');

const isPayloadBackedScreenAction = (context: InputContext, action: string): boolean =>
  (context === 'inventory' &&
    ((action.startsWith('inventory.') && !['inventory.previous', 'inventory.next'].includes(action)) ||
      action.startsWith('quickbar.assign.') ||
      action === 'handling.stop')) ||
  action === 'craft.continue' ||
  action.startsWith('carry.');

const quickbarSlotFor = (action: string): number | undefined =>
  action.startsWith('quickbar.use.') ? Number(action.slice('quickbar.use.'.length)) - 1 : undefined;

const CarryCommands: Readonly<Record<string, 'furniture.turn' | 'furniture.tip'>> = {
  'carry.turn': 'furniture.turn',
  'carry.tip': 'furniture.tip',
};

/** A thrown item's arc, shown from launch to landing; the item already lies where it lands. */
interface ItemThrowLaunch {
  item: Item;
  itemUid: number;
  origin: Vec3;
  startedAtSimSeconds: number;
  landingAt: number;
  flight: ItemFlight;
}

/** Where routed effects reach the player; called in place, in the order the routing reaches them. */
interface CommandRouterPresentation {
  refusal: (reason: string, atSimSeconds: number) => void;
  /** Refuses a held item that has no primary action; presentation words the hint. */
  noPrimaryAction: (item: Item, atSimSeconds: number) => void;
  notice: (text: string) => void;
  closeInventoryScreen: () => void;
  syncMenuState: () => void;
  openInventory: (tab: InventoryTab) => void;
  /** Opens the movable piece's action list. */
  openFurnitureChoices: (entity: BlockEntity, actions: ItemAction[]) => void;
  /** Tells a playtest observer, if one watches, that a search began. */
  beginSearch: (entity: BlockEntity) => void;
  /** Tells the tutorial guide, if one runs, that a weapon was inspected. */
  weaponInspected: (item: Item) => void;
  throwVisual: (launch: ItemThrowLaunch, inventory: Inventory) => void;
  /** The spectator camera may withhold a command. */
  spectatorAllows: (action: string) => boolean;
  /** The open inventory screen takes a command first; true when it consumed it. */
  screenInputCommand: (command: InputCommand) => boolean;
  /** A locomotion press resets the third-person orbit. */
  locomotionPressed: (action: string) => void;
  /** Menus and reading take a press before gameplay. */
  modal: ModalPorts;
  debugCommand: (action: string, at: number) => boolean;
  /** The backquote hint and orbit gesture; true when it consumed the command. */
  hintCommand: (action: string, phase: InputCommand['phase'], at: number) => boolean;
}

type InventoryTab = NonNullable<ReturnType<typeof inventoryTabForAction>>;

/** The main menu, reading and inventory UIs a modal press reaches; the router decides which takes it. */
interface ModalPorts {
  toggleMainMenu: () => void;
  mainMenuOpen: () => boolean;
  readingOpen: () => boolean;
  readingAction: (action: string) => void;
  /** Closes an open book on a movement press; false when the page is not a book. */
  readingMovementAction: () => boolean;
  toggleInventory: () => void;
  screenOpen: () => boolean;
  screenAction: (action: string) => void;
}

/** A live press-and-hold recogniser; a replay records the action it resolves to, not the key. */
interface PressGesture {
  keyDown: (action: string, at: number) => void;
  keyUp: (action: string, at: number) => void;
}

/** Live gesture recognisers the press routing feeds; play.ts owns them. */
interface LiveGesturePorts {
  crouchProne: PressGesture;
  throwStance: PressGesture;
  wornLight: PressGesture;
  /** Picks the interaction target at the press and forgets it at the release. */
  interact: PressGesture;
  /** Takes the off-hand use press when the held item offers a choice; false leaves it to the ordinary use. */
  offHandUse: { keyDown: (at: number) => boolean; keyUp: (at: number) => void };
  quickbar: { keyDown: (slot: number, at: number) => void; keyUp: (slot: number, at: number) => void };
  /** Holds the emote menu open while the emote key is down; the release performs its choice. */
  emote: { keyDown: () => void; keyUp: () => void };
  /** Cancels every held live gesture, as a refusal does. */
  cancelHeld: () => void;
}

/** What the router reads and drives; owners outside the router supply each port lazily. */
export interface CommandRouterPorts {
  controls: PlayerControls;
  registry: Registry;
  /** The session owns these; it is created with the router's controls, so they are read lazily. */
  session: () => Session;
  inventory: () => Inventory;
  sim: () => Pick<Simulation, 'time' | 'body'>;
  presentation: CommandRouterPresentation;
  /** Input reaches the world: loading finished and the pointer is in play, or a replay drives it. */
  active: () => boolean;
  /** The world finished loading; no command reaches it before. */
  worldReady: () => boolean;
  /** The pointer is locked to the view. */
  pointerLocked: () => boolean;
  /** A menu holds the pointer. */
  menuPointer: () => boolean;
  /** The save controller captures a save before a sleep begins. */
  beforeSleep: () => void;
  replaying: () => boolean;
  /** The replay that drives the player ticks, if one does. */
  replayPlayer: () => Pick<InputReplayPlayer, 'next'> | undefined;
  replaySample: () => ReplayControlSample | undefined;
  setReplaySample: (sample: ReplayControlSample | undefined) => void;
  recorder: () => Pick<InputReplayRecorder, 'queueAction' | 'recordTick'> | undefined;
  /** The recording ran out of room for generated columns. */
  stopRecordingForColumnOverflow: () => void;
  inputContext: () => InputContext;
  pendingPlayerTickActions: Pick<PlayerTickActions, 'enqueue' | 'applyAtNextTick'>;
  /** The debug gun pose's latch; outside debug it passes the live input through. */
  gunPose: {
    readonly active: boolean;
    readyHeld: (live: boolean) => boolean;
    aimingDownSights: (live: boolean) => boolean;
  };
  /** The debug block editor owns canvas clicks. */
  buildMode: () => boolean;
  handlingBusy: () => boolean;
  sprinting: () => boolean;
  itemThrowTuning: Parameters<typeof throwDistanceForItem>[2];
  throwMinimumHoldSimSeconds: number;
  scale: { readonly blockSize: number; readonly minCy: number };
  pick: InteractionPickWorld;
  advanceHeldStrip: (uid: number | undefined, atSimSeconds: number, held: boolean) => string | undefined;
  selectedMagazineAction: (item: Item) => string | undefined;
  firearmShotInput: (uid: number, atSimSeconds: number) => FirearmShotInput | undefined;
  fire: (shot: FirearmShotInput) => boolean;
  fireReason: (uid: number) => string | undefined;
  descending: () => boolean;
  liveGestures: LiveGesturePorts;
}

export interface CommandRouter {
  /** The session's controls, before any presentation guard wraps them. */
  readonly controls: SessionControls;
  fireWeapon: (item: Item, atSimSeconds: number) => boolean;
  cancelItemThrow: () => void;
  useTarget: (entity: BlockEntity) => void;
  itemThrowFlight: (item: Item, hand: HandSide, distanceMetres: number) => ItemFlight;
  applyScreenCommand: (payload: ReplayActionPayload) => string | undefined;
  /** Applies a screen command now, or records it and applies it at the next player tick. */
  dispatchScreenCommand: (payload: ReplayActionPayload) => string | undefined;
  /** Routes a press to the main menu, reading or inventory first; true when one of them took it. */
  modalCommand: (action: string) => boolean;
  /** The reading page closed: stop reading and return movement input. */
  readingClosed: () => void;
  dispatchReplayAction: (action: ReplayAction, sample: ReplayControlSample) => void;
  /** A live command, gated and recorded; a replay passes fromReplay so it is not recorded again. */
  dispatchInputCommand: (command: InputCommand, fromReplay?: boolean) => void;
  requestStanceAction: (action: StanceReplayAction) => void;
  throwingStance: () => boolean;
  /** A replay segment's start state sets the stance directly. */
  setThrowingStance: (value: boolean) => void;
  /** Leaves the throwing stance once both hands are empty. */
  syncThrowingStance: () => void;
  toggleThrowingStance: () => void;
  dropHeldItemForThrowingStance: () => void;
  beginItemThrow: () => void;
  /** Starts a waiting throw charge once handling frees the hands; run each frame. */
  advancePendingItemThrow: () => void;
  toggleWornLights: () => void;
  useForwardButton: () => void;
  quickbarTap: (slot: number) => void;
  quickbarHold: (slot: number) => void;
  /** Continue a craft, rest/sleep, or the debug compression test. */
  continueAction: () => void;
  /** Stop the current long action without discarding owned progress. */
  stopAction: () => void;
  compress: () => void;
  /** Default-view R reloads, racks and removes; menus own their own bindings (including inventory rotation). */
  reloadBinding: () => ReloadBinding | undefined;
  /** Which emote modes and emotes the player can use now, and performing one, recorded like any gesture it makes. */
  emotes: EmoteAvailability & { perform: (emote: Emote) => void };
  /** Sets a held bar across the door or lifts the bar off it, from the side the player stands on. */
  enqueueDoorBar: (entity: BlockEntity, barring: boolean) => string | undefined;
  /** The held item's primary use in this hand, as the player tick runs it. */
  performHandUse: HandUse['perform'];
  interactionTargetAt: HandUse['interactionTargetAt'];
  refusePrimaryUseWhileHandling: HandUse['refusePrimaryUseWhileHandling'];
  meleeSelection: HandUse['meleeSelection'];
  /** The firearm and melee readiness gate the simulation reads; presentation reads it too. */
  readiness: ReadinessGate;
}

/** Whether the raised gun may fire or aim and whether the player blocks, from the input that reaches the world. */
interface ReadinessGate {
  hasGunPoseInput: () => boolean;
  isFirearmReady: (uid: number) => boolean;
  isAimingDownSights: () => boolean;
  shouldPlayerBlock: () => boolean;
}

export function createCommandRouter(ports: CommandRouterPorts): CommandRouter {
  const { controls, registry, presentation, liveGestures } = ports;
  const lines = actionText(registry);
  const restRefusals = { rest: lines.play.restRefused, sleep: lines.play.sleepRefused };
  const firearmTrigger = new FirearmTrigger();
  let automaticFireUid: number | undefined;
  let throwingStance = false;
  const refusalReason = (reason: string | undefined): void => {
    if (reason) {
      presentation.refusal(reason, ports.sim().time);
    }
  };

  // ---- readiness gate ----

  const { gunPose } = ports;
  const hasActiveFirearmInput = (): boolean => {
    const replaySample = ports.replaySample();
    return ports.replaying()
      ? replaySample?.active === true && !replaySample.inputLocked
      : ports.pointerLocked() && !ports.menuPointer();
  };
  const hasGunPoseInput = (): boolean => gunPose.active || hasActiveFirearmInput();
  const isFirearmReady = (uid: number): boolean =>
    gunPose.readyHeld(controls.rightMouseActionHeld) &&
    hasGunPoseInput() &&
    !ports.session().sim.compression.locksInput &&
    ports.session().firearms.isReady(uid);
  const isAimingDownSights = (): boolean => {
    const action = selectPrimaryAction(ports.inventory());
    return (
      gunPose.aimingDownSights(controls.aimingDownSights) &&
      gunPose.readyHeld(controls.rightMouseActionHeld) &&
      hasGunPoseInput() &&
      action.kind === 'firearm' &&
      isFirearmReady(action.item.uid) &&
      !ports.sprinting()
    );
  };
  controls.setAimingDownSightsAllowed(() => {
    const action = selectPrimaryAction(ports.inventory());
    return action.kind === 'firearm' && isFirearmReady(action.item.uid) && !ports.sprinting();
  });
  const meleeReadiness = (meleeWeaponHeld: boolean, emptyHand?: HandSide) => ({
    rightMouseHeld: controls.rightMouseActionHeld && hasActiveFirearmInput(),
    meleeWeaponHeld,
    handsEmpty:
      emptyHand === undefined
        ? !(ports.inventory().hands.right || ports.inventory().hands.left)
        : !ports.inventory().hands[emptyHand],
    debugBuild: ports.buildMode(),
    inputLocked: ports.session().sim.compression.locksInput,
  });
  const shouldPlayerBlock = (): boolean => {
    const action = selectPrimaryAction(ports.inventory());
    return shouldEnterMeleeGuard({ ...meleeReadiness(false), firearmHeld: action.kind === 'firearm' });
  };

  const fireWeapon = (item: Item, atSimSeconds: number): boolean => {
    const shot = ports.firearmShotInput(item.uid, atSimSeconds);
    return shot !== undefined && ports.fire(shot);
  };
  const triggerWeapon = (weapon: Item | undefined, pressed: boolean) => {
    if (!weapon) {
      return;
    }
    const reason = ports.fireReason(weapon.uid);
    if (reason) {
      if (pressed) {
        fireWeapon(weapon, ports.sim().time);
        presentation.refusal(reason, ports.sim().time);
      }
      return;
    }
    const { roundsPerSimSecond, action } = firearmHandlingFor(weapon, registry);
    return roundsPerSimSecond === undefined
      ? undefined
      : { uid: weapon.uid, roundsPerSimSecond, triggerMode: action.triggerMode };
  };
  const automaticFireWeapon = (): Item | undefined => {
    if (ports.buildMode() || ports.handlingBusy()) {
      return undefined;
    }
    const action = selectPrimaryAction(ports.inventory());
    if (
      throwingStance ||
      action.kind !== 'firearm' ||
      action.item.firearm?.cylinder ||
      !firearmHandlingFor(action.item, registry).action.fire
    ) {
      return undefined;
    }
    return action.item;
  };
  const updateAutomaticFireUid = (automaticItem: Item | undefined, pressed: boolean): void => {
    if (pressed) {
      automaticFireUid =
        automaticItem && isFirearmReady(automaticItem.uid) && !ports.sprinting() ? automaticItem.uid : undefined;
    }
  };
  const readyAutomaticWeapon = (automaticItem: Item | undefined): Item | undefined =>
    automaticItem && automaticItem.uid === automaticFireUid && isFirearmReady(automaticItem.uid) && !ports.sprinting()
      ? automaticItem
      : undefined;
  const advanceAutomaticTrigger = (
    atSimSeconds: number,
    pressed: boolean,
    triggerHeld: boolean,
    weapon?: Item,
  ): void => {
    const acceptedPress = pressed && weapon !== undefined;
    const deadlines = firearmTrigger.advance(
      atSimSeconds,
      triggerWeapon(weapon, acceptedPress),
      acceptedPress,
      triggerHeld && automaticFireUid !== undefined,
    );
    if (weapon) {
      for (const deadline of deadlines) {
        fireWeapon(weapon, deadline);
      }
    }
  };
  const handleHeldDominantUse = (atSimSeconds: number, pressed: boolean, triggerHeld: boolean): void => {
    const automaticItem = automaticFireWeapon();
    updateAutomaticFireUid(automaticItem, pressed);
    advanceAutomaticTrigger(atSimSeconds, pressed, triggerHeld, readyAutomaticWeapon(automaticItem));
    if (!triggerHeld) {
      automaticFireUid = undefined;
    }
  };

  // ---- item throw ----

  const cancelItemThrow = (): void => {
    ports.session().throwCharge.cancel();
  };
  /** A replay charges as the live game did, so a climber holds still alike, but throws from the recording. */
  function releaseItemThrow(): void {
    if (controls.freeLooking) {
      cancelItemThrow();
      return;
    }
    const session = ports.session();
    if (!session.throwCharge.active) {
      return;
    }
    if (ports.replaying()) {
      session.throwCharge.cancel();
    } else {
      finishItemThrow();
    }
  }
  function finishItemThrow(): void {
    const released = ports.session().throwCharge.release(ports.sim().time);
    if (!released) {
      return;
    }
    if (controls.consumeRightMousePressed() || controls.rightMouseHeld) {
      dispatchScreenCommand({ kind: 'item.throw.cancel' });
      controls.suppressRightMouseUntilRelease();
      return;
    }
    const { itemUid: uid, hand, heldSimSeconds } = released;
    if (!hasMetThrowMinimumHold(heldSimSeconds, ports.throwMinimumHoldSimSeconds)) {
      return;
    }
    const inventory = ports.inventory();
    const item = inventory.itemByUid(uid);
    if (!(item && inventory.hands[hand] === item)) {
      return;
    }
    const distance = throwDistanceForItem(item, registry, ports.itemThrowTuning, heldSimSeconds);
    if (!ports.replaying()) {
      ports.recorder()?.queueAction('item.throw', 'down', ports.inputContext(), {
        payload: {
          kind: 'item.throw',
          itemUid: uid,
          hand,
          distance,
        },
      });
      ports.pendingPlayerTickActions.enqueue(() => {
        applyToHeldItem(inventory.hands, hand, uid, (heldItem) => {
          throwHeldItem(heldItem, hand, distance);
          syncThrowingStance();
        });
      });
    }
  }
  function throwRecordedItem(itemUid: number, hand: HandSide, distanceMetres: number): void {
    applyToHeldItem(ports.inventory().hands, hand, itemUid, (item) => {
      throwHeldItem(item, hand, distanceMetres);
      syncThrowingStance();
    });
  }
  function itemThrowFlight(item: Item, hand: HandSide, distanceMetres: number): ItemFlight {
    const { itemThrowTuning, scale } = ports;
    const s = scale.blockSize;
    const fullStrength = throwDistanceForItem(item, registry, itemThrowTuning, itemThrowTuning.chargeSimSeconds);
    const chargeProgress = fullStrength > 0 ? Math.max(0, Math.min(1, distanceMetres / fullStrength)) : 0;
    const offset: Vec3 = throwingStance
      ? throwStanceWorldOffset(hand, controls.yaw, controls.pitch, chargeProgress)
      : [0, 0, 0];
    // A throw lands before the tick samples its input, so it aims with the look the controls hold then.
    const look = { yaw: controls.yaw, pitch: controls.pitch };
    const session = ports.session();
    const origin = session.playerEye(look).map((value, axis) => value * s + offset[axis]!) as Vec3;
    return flightForItem(item, registry, {
      from: origin,
      direction: session.playerLookDirection(look),
      distanceMetres,
      blockSize: s,
      minY: scale.minCy * CHUNK,
      isSolid: session.physicalSolid,
    });
  }
  function throwHeldItem(item: Item, hand: HandSide, distanceMetres: number): void {
    if (controls.freeLooking) {
      return;
    }
    const inventory = ports.inventory();
    if (inventory.hands[hand] !== item) {
      return;
    }
    const flight = itemThrowFlight(item, hand, distanceMetres);
    const origin = flight.points[0]!;
    const target = flight.landing ? { kind: 'pile' as const, pos: flight.landing } : undefined;
    if (!target) {
      presentation.refusal(coreMessage(registry, 'noLanding'), ports.sim().time);
      return;
    }
    const startedAtSimSeconds = ports.sim().time;
    const landingAt = startedAtSimSeconds + flight.durationSimSeconds;
    const landed = ports.session().throwCharge.place(item, hand, target);
    if (!landed.landed) {
      if (landed.reason) {
        presentation.refusal(landed.reason, ports.sim().time);
      }
      return;
    }
    presentation.throwVisual(
      { item, itemUid: landed.item.uid, origin, startedAtSimSeconds, landingAt, flight },
      inventory,
    );
  }

  function beginItemThrow(): void {
    if (controls.freeLooking) {
      return;
    }
    const sim = ports.sim();
    const refusal = sim.body.actionRefusal;
    if (refusal) {
      presentation.refusal(refusal, sim.time);
      return;
    }
    const session = ports.session();
    const begun = session.throwCharge.begin(sim.time, session.queue.busy || session.firearms.busy);
    if (begun.kind === 'refused') {
      presentation.refusal(begun.reason, sim.time);
    } else if (begun.kind === 'waiting') {
      presentation.notice(lines.play.waitingForHandling);
    }
  }
  function advancePendingItemThrow(): void {
    const session = ports.session();
    const charge = session.throwCharge;
    if (!charge.active || charge.startedAt !== undefined) {
      return;
    }
    if (!(ports.replaySample()?.intent.useDominantHeld ?? controls.dominantUseHeld)) {
      cancelItemThrow();
      return;
    }
    const { sim } = session;
    if (sim.paused || session.queue.busy || session.firearms.busy) {
      return;
    }
    if (!charge.start(sim.time)) {
      presentation.refusal(lines.play.throwLostItem, sim.time);
      return;
    }
    presentation.notice('');
  }

  // ---- throwing stance ----

  function toggleThrowingStance(): void {
    if (controls.freeLooking) {
      return;
    }
    throwingStance = !throwingStance;
    automaticFireUid = undefined;
    if (!ports.replaying()) {
      ports.recorder()?.queueAction('throw.stance.toggle', 'down', ports.inputContext(), { inSnapshot: true });
    }
    if (!throwingStance) {
      cancelItemThrow();
    }
    syncThrowingStance();
  }
  function syncThrowingStance(): void {
    if (throwingStance && !ports.inventory().hands.right && !ports.inventory().hands.left) {
      throwingStance = false;
      cancelItemThrow();
    }
  }
  function dropHeldItemForThrowingStance(): void {
    if (!ports.replaying()) {
      const sim = ports.sim();
      if (sim.body.actionRefusal) {
        presentation.refusal(sim.body.actionRefusal, sim.time);
        return;
      }
      if (!ports.inventory().hands[ports.session().throwCharge.throwHand()]) {
        return;
      }
      ports.recorder()?.queueAction('item.drop', 'down', ports.inputContext());
      ports.pendingPlayerTickActions.enqueue(dropHeldItemForThrowingStanceNow);
      return;
    }
    dropHeldItemForThrowingStanceNow();
  }
  function dropHeldItemForThrowingStanceNow(): void {
    if (controls.freeLooking) {
      return;
    }
    const sim = ports.sim();
    if (sim.body.actionRefusal) {
      presentation.refusal(sim.body.actionRefusal, sim.time);
      return;
    }
    const session = ports.session();
    const inventory = ports.inventory();
    const hand = session.throwCharge.throwHand();
    const item = inventory.hands[hand];
    if (!item) {
      return;
    }
    const drop = dropTarget(inventory, item, session.feet());
    const result = drop.plan.ok ? inventory.move(item, drop.target) : drop.plan;
    if (!result.ok) {
      presentation.refusal(fillText(lines.play.dropRefused, { reason: result.reason }), sim.time);
      return;
    }
    if (session.throwCharge.itemUid === item.uid) {
      cancelItemThrow();
    }
    syncThrowingStance();
  }

  // ---- worn lights and forward use ----

  function toggleWornLights(): void {
    if (!ports.replaying()) {
      ports.recorder()?.queueAction('light.worn-toggle', 'down', ports.inputContext());
      ports.pendingPlayerTickActions.enqueue(toggleWornLightsNow);
      return;
    }
    toggleWornLightsNow();
  }
  function toggleWornLightsNow(): void {
    if (controls.freeLooking) {
      return;
    }
    refusalReason(ports.session().survival.toggleWornLights());
  }
  function useForwardButton(): void {
    if (!ports.replaying()) {
      ports.recorder()?.queueAction('hand.use-forward', 'down', ports.inputContext());
      ports.pendingPlayerTickActions.enqueue(useForwardButtonNow);
      return;
    }
    useForwardButtonNow();
  }
  function useForwardButtonNow(): void {
    if (controls.freeLooking) {
      return;
    }
    // Instant off-hand use shares Survival's owner with a quickbar second press.
    const item = offHandUse(registry, ports.inventory());
    const reason = item && ports.session().survival.use(item);
    if (reason) {
      presentation.refusal(reason, ports.sim().time);
    }
  }

  // ---- quickbar ----

  /** Built at the first quickbar action, once the session exists. */
  let quickbarActions: QuickbarActions | undefined;
  const quickbarActionsFor = (session: Session): QuickbarActions => {
    quickbarActions ??= new QuickbarActions({
      inventory: session.inventory,
      queue: session.queue,
      feet: session.feet,
      survival: session.survival,
      notice: (text) => presentation.refusal(text, ports.sim().time),
    });
    return quickbarActions;
  };
  function runQuickbarAction(slot: number, held: boolean): void {
    if (controls.freeLooking) {
      return;
    }
    const sim = ports.sim();
    if (sim.body.actionRefusal) {
      presentation.refusal(sim.body.actionRefusal, sim.time);
      return;
    }
    const session = ports.session();
    const item = session.quickbar.resolve(slot, ports.inventory());
    if (!item) {
      presentation.refusal(fillText(lines.play.quickbarEmpty, { slot: countText(slot + 1) }), sim.time);
      return;
    }
    if (held) {
      quickbarActionsFor(session).hold(item);
    } else {
      quickbarActionsFor(session).tap(item);
    }
  }
  function quickbarTap(slot: number): void {
    const recorder = ports.replaying() ? undefined : ports.recorder();
    if (recorder) {
      recorder.queueAction(`quickbar.tap.${slot + 1}`, 'down', ports.inputContext());
      ports.pendingPlayerTickActions.enqueue(() => runQuickbarAction(slot, false));
      return;
    }
    runQuickbarAction(slot, false);
  }
  function quickbarHold(slot: number): void {
    const recorder = ports.replaying() ? undefined : ports.recorder();
    if (recorder) {
      recorder.queueAction(`quickbar.hold.${slot + 1}`, 'down', ports.inputContext());
      ports.pendingPlayerTickActions.enqueue(() => runQuickbarAction(slot, true));
      return;
    }
    runQuickbarAction(slot, true);
  }

  // ---- long actions: work, continue and stop ----

  function actOnWork(uid: number, operation: WorkOperation, choices: RecoveryChoices = {}): string | undefined {
    const reason = ports.session().crafting.act(uid, operation, choices);
    if (!reason && operation !== 'apart') {
      presentation.closeInventoryScreen();
      presentation.syncMenuState();
    }
    return reason;
  }
  function continueWork(): boolean {
    const workUid = ports.session().crafting.currentUid;
    if (workUid === undefined) {
      return false;
    }
    const reason = actOnWork(workUid, 'continue');
    if (reason) {
      presentation.refusal(fillText(lines.play.continueRefused, { reason }), ports.sim().time);
    }
    return true;
  }
  function compress(): void {
    const { queue, sim } = ports.session();
    queue.cancel();
    const result = sim.compress();
    if (!result.ok) {
      presentation.refusal(fillText(lines.play.restRefused, { reason: result.reason }), sim.time);
    }
  }
  function continueAction(): void {
    const refusal = ports.sim().body.actionRefusal;
    if (refusal) {
      presentation.refusal(refusal, ports.sim().time);
      return;
    }
    if (continueWork()) {
      return;
    }
    const { rest, sim } = ports.session();
    if (rest.action || continueActionResumesJob(sim.actions.job?.jobType)) {
      const reason = rest.action ? rest.resume() : sim.actions.resume();
      if (reason) {
        presentation.refusal(fillText(lines.play.continueRefused, { reason }), sim.time);
      }
    } else {
      compress();
    }
  }
  function stopAction(): void {
    const { rest, sim } = ports.session();
    if (rest.action && !rest.canStop) {
      return;
    }
    if (
      sim.actions.job?.jobType === 'craft' ||
      sim.actions.job?.jobType === 'wait' ||
      sim.actions.job?.jobType === 'reading' ||
      sim.actions.job?.jobType === 'forceDoor' ||
      sim.actions.job?.jobType === 'treatment' ||
      sim.actions.job?.jobType === 'vehicleWork'
    ) {
      sim.actions.stop();
    } else if (rest.action) {
      rest.stop();
    } else {
      sim.compression.stop();
    }
  }

  // ---- key admission ----

  /** A key press ends a ramp-down; replay never snaps, the recorded sample decides. */
  const keyAdmitted = (): boolean => {
    const { compression } = ports.session().sim;
    if (ports.replaying()) {
      return !(ports.replaySample()?.inputLocked ?? compression.locksInput);
    }
    return compression.admitKey();
  };

  // ---- reload and press check ----

  /** Input reaches a held firearm's gestures: play has the pointer, or a replay drives it, and nothing else owns the hands. */
  const firearmGesturesReachable = (): boolean => {
    const session = ports.session();
    const { sim } = session;
    const { compression } = sim;
    return !(
      !(ports.pointerLocked() || ports.replaying()) ||
      (ports.menuPointer() && !ports.replaying()) ||
      (ports.replaying() ? compression.locksInput : compression.refusesKeys) ||
      sim.paused ||
      sim.dead ||
      sim.body.actionRefusal ||
      ports.buildMode() ||
      session.throwCharge.startedAt !== undefined
    );
  };
  // An admitted gesture is recorded; replay drives it back.
  const admitFirearmGesture = (
    action: 'firearm.load' | 'firearm.rack' | 'firearm.remove' | 'firearm.press-check',
    reason: string | undefined,
  ): boolean => {
    const { sim } = ports.session();
    if (reason) {
      presentation.refusal(reason, sim.time);
    } else {
      ports.recorder()?.queueAction(action, 'down', ports.inputContext());
      if (!ports.replaying()) {
        sim.compression.admitKey();
      }
    }
    return reason === undefined;
  };
  // A reload or a press check works the firearm with both hands, so a hand on a ladder refuses it.
  const ladderRefusal = (): string | undefined => {
    const { ladderHold } = ports.session();
    const hand = ladderHold.hand();
    return hand && ladderHold.refusal(hand);
  };

  /**
   * Building the binding never changes state: a ramp-down alone leaves it available, and only an admitted
   * gesture ends the ramp, so a short tap or an owner refusal does not.
   */
  function reloadBinding(): ReloadBinding | undefined {
    if (!firearmGesturesReachable()) {
      return;
    }
    const session = ports.session();
    const { sim, queue, firearms } = session;
    const target = reloadTarget(firearms, session.magazines, lines.play.notHoldingGun);
    if (!target) {
      return;
    }
    return {
      uid: target.uid,
      busy: () => queue.busy || firearms.busy,
      oneAction: target.oneAction,
      load: () => admitFirearmGesture('firearm.load', ladderRefusal() ?? target.load(sim.time)),
      rack: () => admitFirearmGesture('firearm.rack', ladderRefusal() ?? target.rack(sim.time)),
      remove: () => admitFirearmGesture('firearm.remove', ladderRefusal() ?? target.remove(sim.time)),
      ...(target.stillLoaded ? { stillLoaded: target.stillLoaded } : {}),
      cancelLoad: target.cancelLoad,
      ...(target.releaseLoad ? { releaseLoad: () => target.releaseLoad!(sim.time) } : {}),
    };
  }

  /** The held gun a press check would check, while input reaches it. */
  const pressCheckUid = (): number | undefined =>
    firearmGesturesReachable() ? ports.session().firearms.pressCheckableUid() : undefined;
  const pressCheck = (): void => {
    const uid = pressCheckUid();
    if (uid !== undefined) {
      admitFirearmGesture('firearm.press-check', ladderRefusal() ?? ports.session().firearms.pressCheck(uid));
    }
  };

  // ---- emotes ----

  // A mode is what either hand holds, so its ring opens whenever the player holds one; each emote decides for itself.
  const emoteModes: Readonly<Record<EmoteMode, () => boolean>> = {
    gun: () => ports.session().firearms.holdsFirearm(),
  };
  const emoteActions: Readonly<Record<Emote, { available: () => boolean; perform: () => void }>> = {
    'press-check': { available: () => pressCheckUid() !== undefined, perform: pressCheck },
  };
  const emotes: CommandRouter['emotes'] = {
    mode: (mode) => emoteModes[mode](),
    emote: (emote) => emoteActions[emote].available(),
    perform: (emote) => emoteActions[emote].perform(),
  };

  // ---- furniture ----

  const furnitureActions = (entity: BlockEntity): ItemAction[] =>
    furnitureActionsFor(ports.inventory(), entity, ports.scale.blockSize);
  function toggleRest(kind: RestKind, entity: BlockEntity): void {
    const { rest, queue, sim } = ports.session();
    const { compression } = sim;
    const already = rest.action?.kind === kind && rest.action.furnitureUid === entity.uid;
    if (compression.interruption !== undefined && !already) {
      return;
    }
    if (!already) {
      if (!keyAdmitted()) {
        return;
      }
      queue.cancel();
      if (kind === 'sleep') {
        ports.beforeSleep();
      }
    }
    const reason = rest.toggle(kind, entity.uid);
    if (reason) {
      presentation.refusal(fillText(restRefusals[kind], { reason }), sim.time);
    }
  }
  function toggleRestFromTarget(kind: RestKind, entity: BlockEntity): void {
    const { rest } = ports.session();
    const { action } = rest;
    if (action?.kind === kind && action.furnitureUid === entity.uid && !rest.canStop) {
      return;
    }
    toggleRest(kind, entity);
  }
  function toggleDoor(entity: BlockEntity): void {
    const session = ports.session();
    const { inventory, entities, queue, sim } = session;
    if (entity.lock?.locked && Object.keys(entities.defOf(entity).door?.methods ?? {}).length > 0) {
      const plan = pryPlan(inventory, entity, undefined, session.character);
      if (!plan.ok) {
        presentation.refusal(plan.reason, sim.time);
        return;
      }
      queue.cancel();
      const reason = session.forceDoor(entity, plan.tool.uid, plan.method);
      if (reason) {
        presentation.refusal(reason, sim.time);
      }
      return;
    }
    const option = doorOptions(inventory, entity)[0]!;
    if (!option.plan.ok) {
      presentation.refusal(option.plan.reason, sim.time);
      return;
    }
    const label = fillText(lines.doors.operate, { action: option.label, door: session.nameOf(entity) });
    queue.enqueueAction(DOOR_ACTION, label, option.plan.time, {
      entityUid: entity.uid,
      closing: option.operation === 'close',
    });
  }
  /** Sets a held bar across the door or lifts the bar off it, from the side the player stands on. */
  function enqueueDoorBar(entity: BlockEntity, barring: boolean): string | undefined {
    const session = ports.session();
    const plan = doorPlan(session.inventory, entity, barring ? 'bar' : 'unbar');
    if (!plan.ok) {
      return plan.reason;
    }
    const { screenText } = claimed(registry.ui, 'interface')!;
    const label = barring
      ? fillScreenText(screenText.interaction.barDoor, { name: session.nameOf(entity) })
      : screenText.interaction.liftBar;
    session.queue.enqueueAction(DOOR_ACTION, label, plan.time, { entityUid: entity.uid, barring });
    return undefined;
  }

  function useTarget(entity: BlockEntity): void {
    const session = ports.session();
    const def = session.entities.defOf(entity);
    if (def.door) {
      toggleDoor(entity);
      return;
    }
    if (def.climbable) {
      refusalReason(session.grabLadder(entity));
      return;
    }
    if (def.readable) {
      const reason = session.readFurniture(entity);
      if (reason) {
        presentation.refusal(reason, ports.sim().time);
      }
      return;
    }
    const kind = restKindForFurniture(def);
    if (kind) {
      toggleRestFromTarget(kind, entity);
      return;
    }
    if (!entity.pockets) {
      return;
    }
    presentation.beginSearch(entity);
    session.search(entity);
    presentation.openInventory('items');
  }
  const interactFurniture = (uid: number, alternatives?: true): string | undefined => {
    const session = ports.session();
    const entity = session.entities.byUid(uid);
    if (!entity) {
      return lines.common.gone;
    }
    if (session.isObjective(entity)) {
      return session.activateGoal(entity);
    }
    if (session.rest.action?.furnitureUid !== entity.uid && !keyAdmitted()) {
      return undefined;
    }
    if (alternatives && furnitureActions(entity).length > 0) {
      presentation.openFurnitureChoices(entity, furnitureActions(entity));
    } else {
      useTarget(entity);
    }
    return undefined;
  };

  // ---- modal commands ----

  const timeKeys = (code: string): boolean => {
    if (ports.session().sim.compression.interruption === undefined) {
      return false;
    }
    if (code === 'compression.continue') {
      continueAction();
      return true;
    }
    if (code === 'handling.stop') {
      stopAction();
      return true;
    }
    return false;
  };
  const inventoryTabCommand = (action: string): boolean => {
    const tab = inventoryTabForAction(action);
    if (!tab) {
      return false;
    }
    if (keyAdmitted()) {
      presentation.openInventory(tab);
    }
    return true;
  };
  const { modal } = presentation;
  const modalCommand = (action: string): boolean =>
    routeModalCommand(action, {
      toggleMainMenu: () => modal.toggleMainMenu(),
      readingOpen: modal.readingOpen(),
      readingAction: (command) => modal.readingAction(command),
      readingMovementAction: () => modal.readingMovementAction(),
      toggleInventory: () => {
        if (keyAdmitted()) {
          modal.toggleInventory();
        }
      },
      inventoryTabAction: inventoryTabCommand,
      screenOpen: modal.screenOpen(),
      screenAction: (command) => modal.screenAction(command),
      mainMenuOpen: modal.mainMenuOpen(),
      interruptionCommand: timeKeys,
    });
  const readingClosed = (): void => stopReadingOnClose(ports.session().sim);

  // ---- live input commands ----

  const withUnlockedInput = (action: () => void): void => {
    if (keyAdmitted()) {
      action();
    }
  };
  const requestStanceAction = (action: StanceReplayAction): void => {
    withUnlockedInput(() => {
      if (!ports.replaying()) {
        ports.recorder()?.queueAction(action, 'down', ports.inputContext());
      }
      controls.requestStanceToggle(action === 'player.crouch-toggle' ? 'crouch' : 'prone');
    });
  };
  const stopHandling = (): void => {
    const session = ports.session();
    controls.reload.cancel();
    session.queue.cancel();
    if (session.sim.actions.job || session.rest.action || session.sim.compression.active) {
      stopAction();
    }
  };
  const assignQuickbarIfUnlocked = (slot: number | undefined, at: number): void => {
    if (slot !== undefined && keyAdmitted()) {
      liveGestures.quickbar.keyDown(slot, at);
    }
  };
  const gameplayCommand = (action: string, at: number, slot: number | undefined): void => {
    if (!freeLookAllowsCommand(controls.freeLooking, action)) {
      return;
    }
    switch (action) {
      case 'stance.ready':
        controls.rightMouseHeld = true;
        break;
      case 'aim.ads-toggle':
        controls.toggleAimingDownSights(ports.replaying());
        break;
      case 'view.free-look':
        controls.startFreeLook();
        break;
      case 'movement.walk-toggle':
        controls.walking = toggleWalking(
          controls.walking,
          ports.replaying() ? undefined : ports.recorder(),
          ports.inputContext(),
        );
        break;
      case 'player.crouch-toggle':
        withUnlockedInput(() => liveGestures.crouchProne.keyDown(action, at));
        break;
      case 'player.throw':
        withUnlockedInput(() => liveGestures.throwStance.keyDown(action, at));
        break;
      case 'light.worn-toggle':
        withUnlockedInput(() => liveGestures.wornLight.keyDown(action, at));
        break;
      case 'hand.use-off':
        if (!(ports.replaying() || liveGestures.offHandUse.keyDown(at))) {
          controls.useOff();
        }
        break;
      case 'firearm.reload':
        controls.reload.keyDown(at, reloadBinding());
        break;
      case 'emote.menu':
        withUnlockedInput(() => liveGestures.emote.keyDown());
        break;
      case 'world.interact':
        withUnlockedInput(() => liveGestures.interact.keyDown(action, at));
        break;
      case 'craft.continue':
        if (ports.session().crafting.currentUid !== undefined) {
          dispatchScreenCommand({ kind: 'craft.continue' });
        }
        break;
      case 'handling.stop':
        stopHandling();
        break;
      default:
        carryCommand(action);
        break;
    }
    assignQuickbarIfUnlocked(slot, at);
  };
  const carryCommand = (action: string): void => {
    const kind = CarryCommands[action];
    const reason = kind && dispatchScreenCommand({ kind });
    if (reason) {
      presentation.refusal(reason, ports.sim().time);
    }
  };
  const releaseHandlers = new Map<string, (action: string, at: number) => void>([
    [
      'stance.ready',
      () => {
        controls.rightMouseHeld = false;
        controls.aimingDownSights = false;
      },
    ],
    ['firearm.reload', (_action, at) => controls.reload.keyUp(at)],
    ['world.interact', (action, at) => liveGestures.interact.keyUp(action, at)],
    ['hand.use-off', (_action, at) => liveGestures.offHandUse.keyUp(at)],
    ['emote.menu', () => liveGestures.emote.keyUp()],
    ['player.crouch-toggle', (action, at) => liveGestures.crouchProne.keyUp(action, at)],
    ['player.throw', (action, at) => liveGestures.throwStance.keyUp(action, at)],
    ['light.worn-toggle', (action, at) => liveGestures.wornLight.keyUp(action, at)],
  ]);
  const releaseCommand = (action: string, at: number, slot: number | undefined): void => {
    releaseHandlers.get(action)?.(action, at);
    if (slot !== undefined) {
      liveGestures.quickbar.keyUp(slot, at);
    }
  };
  const rejectRefusedInput = (): boolean => {
    const refusal = ports.sim().body.actionRefusal;
    if (!refusal) {
      return false;
    }
    liveGestures.cancelHeld();
    presentation.refusal(refusal, ports.sim().time);
    return true;
  };
  const releaseInputCommand = (action: string, at: number, slot: number | undefined): void => {
    if (presentation.hintCommand(action, 'up', at)) {
      return;
    }
    if (ports.sim().body.actionRefusal) {
      liveGestures.cancelHeld();
      return;
    }
    releaseCommand(action, at, slot);
  };
  const dispatchPressCommand = (action: string, at: number, slot: number | undefined): void => {
    presentation.locomotionPressed(action);
    ports.session().sim.actions.cancelWaitForMovement(action);
    if (action === 'ui.main-menu-toggle') {
      modalCommand(action);
      return;
    }
    if (presentation.debugCommand(action, at)) {
      return;
    }
    if (rejectRefusedInput()) {
      return;
    }
    if (presentation.hintCommand(action, 'down', at)) {
      return;
    }
    if (ports.session().sim.dead) {
      return;
    }
    if (!modalCommand(action)) {
      gameplayCommand(action, at, slot);
    }
  };
  const dispatchInputCommand = ({ action, phase, at }: InputCommand, fromReplay = false): void => {
    if (!ports.worldReady() || (ports.replaying() && !fromReplay) || !presentation.spectatorAllows(action)) {
      return;
    }
    const context = ports.inputContext();
    const payloadBackedScreenAction = isPayloadBackedScreenAction(context, action);
    // Gameplay records this press after toggling saved state; recording it here too duplicates the live press.
    const walkToggleHandledByGameplay = action === 'movement.walk-toggle' && phase === 'down';
    if (!(fromReplay || isGestureAction(action) || payloadBackedScreenAction || walkToggleHandledByGameplay)) {
      ports.recorder()?.queueAction(action, phase, context);
    }
    const slot = quickbarSlotFor(action);
    if (context === 'inventory' && presentation.screenInputCommand({ action, phase, at })) {
      return;
    }
    if (phase === 'up') {
      releaseInputCommand(action, at, slot);
      return;
    }
    dispatchPressCommand(action, at, slot);
  };

  // ---- replayed and screen commands ----

  /** Built at the first command, once the session exists. */
  let replayCommandOwners: ReplayCommandOwners | undefined;
  const ownersFor = (session: Session): ReplayCommandOwners => {
    const { inventory, entities, queue, quickbar, survival, rest, sim } = session;
    return {
      pour: (sourceUid, receiverUid) => survival.pour(sourceUid, receiverUid),
      charger: session.chargerControl,
      power: session.powerControl,
      inventory,
      queue,
      quickbar,
      search: (uid) => {
        const entity = entities.byUid(uid);
        if (!entity) {
          return lines.common.gone;
        }
        presentation.beginSearch(entity);
        return session.search(entity);
      },
      inspect: (uid) => {
        const item = inventory.itemByUid(uid);
        if (item) {
          presentation.weaponInspected(item);
        }
      },
      work: actOnWork,
      vehicleWork: (work, vehicleId, target, itemUid) => session.beginVehicleWork(work, vehicleId, target, itemUid),
      fitAttachment: (firearmUid, slotId, attachmentUid) =>
        session.firearmAttachments.fit(firearmUid, slotId, attachmentUid),
      removeAttachment: (firearmUid, slotId) => session.firearmAttachments.remove(firearmUid, slotId),
      loadBattery: (lightUid, batteryUid) => survival.loadBattery(lightUid, batteryUid),
      unloadBattery: (lightUid, target) => survival.unloadBatteryTo(lightUid, target),
      toHands: (uid, feetPosition) => {
        const item = inventory.itemByUid(uid);
        return item ? toHands(inventory, queue, item, feetPosition) : lines.common.gone;
      },
      wieldOrPocket: (uid, feetPosition) => {
        const item = inventory.itemByUid(uid);
        return item ? wieldOrPocket(inventory, queue, item, feetPosition) : lines.common.gone;
      },
      activate: (uid) => {
        const item = inventory.itemByUid(uid);
        return item ? survival.activateHeld(item) : lines.common.gone;
      },
      handAction: (uid, actionId) => {
        const item = inventory.itemByUid(uid);
        const hand = item && survival.handOf(item);
        if (!item || hand === undefined) {
          return lines.common.gone;
        }
        return survival.withItemAction(item, actionId, (action) => {
          // Resumes here rather than through the hand use, which would record a second command for the one choice.
          if (action.continuing) {
            continueAction();
          } else {
            handUse.perform(hand);
          }
        });
      },
      pickup: (uid, mode, feetPosition) => {
        const item = inventory.itemByUid(uid);
        if (!item) {
          return lines.common.gone;
        }
        return mode === 'wield'
          ? toHands(inventory, queue, item, feetPosition)
          : pocketGroundItem(inventory, queue, item);
      },
      interact: interactFurniture,
      lift: (uid, floorLocked) => {
        const entity = entities.byUid(uid);
        return entity?.bar ? enqueueDoorBar(entity, false) : session.liftFurniture(uid, floorLocked);
      },
      useFurniture: (uid): string | undefined => {
        const entity = entities.byUid(uid);
        if (!entity) {
          return 'It is no longer there';
        }
        useTarget(entity);
        return undefined;
      },
      slide: (uid, way) => session.slideFurniture(uid, way),
      place: (pos) => session.placeFurniture(pos),
      turn: () => session.turnFurniture(),
      tip: () => session.tipFurniture(),
      clearDownedBody: (id, way) => session.clearDownedBody(id, way),
      craftStart: (recipeId, preference, sources) => session.crafting.start(recipeId, preference, sources),
      craftRepairEntity: (recipeId, entityUid, preference, sources) =>
        session.crafting.repairEntity(recipeId, entityUid, preference, sources),
      craftRepairCell: (recipeId, cell, preference, sources) =>
        session.crafting.repairCell(recipeId, cell, preference, sources),
      craftTakeApartEntity: (entityUid) => session.crafting.takeApartEntity(entityUid),
      craftTakeApartCell: (cell) => session.crafting.takeApartCell(cell),
      craftContinue: () => {
        continueAction();
      },
      craftStop: () => {
        stopAction();
      },
      wait: () => sim.actions.startWait(),
      setWakeGameHour: (gameHour) => {
        rest.wakeGameHour = gameHour;
      },
      cancelItemThrow,
      throwItem: throwRecordedItem,
    };
  };
  const applyScreenCommand = (payload: ReplayActionPayload): string | undefined => {
    replayCommandOwners ??= ownersFor(ports.session());
    const reason = applyReplayActionPayload(payload, replayCommandOwners);
    if (reason) {
      return reason;
    }
    if (
      payload.kind === 'craft.start' ||
      payload.kind === 'craft.repair-entity' ||
      payload.kind === 'craft.repair-cell' ||
      payload.kind === 'craft.take-apart-entity' ||
      payload.kind === 'craft.take-apart-cell' ||
      payload.kind === 'action.wait' ||
      payload.kind === 'vehicle.work'
    ) {
      presentation.closeInventoryScreen();
      presentation.syncMenuState();
    }
    return undefined;
  };
  /** Built at the first screen command, once the session exists. */
  let screenCommandDispatcher: ((payload: ReplayActionPayload) => string | undefined) | undefined;
  function dispatchScreenCommand(payload: ReplayActionPayload): string | undefined {
    screenCommandDispatcher ??= createScreenCommandDispatcher({
      isReplaying: ports.replaying,
      inputRecorder: ports.recorder,
      inputContext: ports.inputContext,
      pendingPlayerTickActions: ports.pendingPlayerTickActions,
      apply: applyScreenCommand,
      inventory: ports.inventory(),
      notice: presentation.notice,
      refusal: (reason) => presentation.refusal(reason, ports.sim().time),
    });
    return screenCommandDispatcher(payload);
  }
  const dispatchReplayQuickbar = (action: ReplayAction): boolean => {
    const match = QUICKBAR_ACTION.exec(action.action);
    if (!match) {
      return false;
    }
    const index = Number(match[2]);
    if (index < 1 || index > QUICKBAR_SLOTS) {
      return false;
    }
    (match[1] === 'tap' ? quickbarTap : quickbarHold)(index - 1);
    return true;
  };
  const dispatchReplayGesture = (action: ReplayAction): boolean => {
    if (dispatchReplayStanceAction(action.action, requestStanceAction)) {
      return true;
    }
    switch (action.action) {
      case 'firearm.load':
        reloadBinding()?.load();
        return true;
      case 'firearm.rack':
        reloadBinding()?.rack();
        return true;
      case 'firearm.remove':
        reloadBinding()?.remove();
        return true;
      case 'firearm.press-check':
        pressCheck();
        return true;
      case 'throw.stance.toggle':
        toggleThrowingStance();
        return true;
      case 'item.drop':
        dropHeldItemForThrowingStance();
        return true;
      case 'item.throw.cancel':
        cancelItemThrow();
        return true;
      case 'light.worn-toggle':
        toggleWornLights();
        return true;
      case 'hand.use-forward':
        useForwardButton();
        return true;
      default:
        return dispatchReplayQuickbar(action);
    }
  };
  const dispatchReplayAction = (action: ReplayAction, sample: ReplayControlSample): void => {
    ports.setReplaySample(sample);
    applyReplayLook(controls, sample);
    if (action.payload) {
      const reason = applyScreenCommand(action.payload);
      if (reason) {
        presentation.refusal(reason, ports.sim().time);
      }
      return;
    }
    if (dispatchReplayGesture(action)) {
      return;
    }
    dispatchInputCommand({ action: action.action, phase: action.phase, at: performance.now() }, true);
  };

  // ---- player tick ----

  /** Live play records the tick and applies the actions queued for it; a replay takes the recorded sample. */
  const sampleAtPlayerTick = (
    _tick: number,
    live: PlayerInputSample,
    _time: number,
    compressionAtTick: number,
  ): PlayerInputSample => {
    const replayPlayer = ports.replayPlayer();
    if (!replayPlayer) {
      controls.advanceFreeLook(0);
      const sample = {
        ...live,
        headYaw: controls.freeLook.yaw,
        headPitch: controls.freeLook.pitch,
        freeLooking: controls.freeLooking,
      };
      const recorder = ports.recorder();
      if (recorder && !recorder.recordTick(sample, compressionAtTick)) {
        ports.stopRecordingForColumnOverflow();
      }
      ports.pendingPlayerTickActions.applyAtNextTick();
      return live;
    }
    const replayInput = nextReplayInputSample(replayPlayer, ports.session().sim.compression, controls);
    ports.setReplaySample(replayInput.recordedSample);
    return replayInput.input;
  };

  const handUse = createHandUse({
    registry,
    controls,
    session: ports.session,
    inventory: ports.inventory,
    sim: ports.sim,
    replaySample: ports.replaySample,
    refusal: presentation.refusal,
    noPrimaryAction: presentation.noPrimaryAction,
    notice: presentation.notice,
    blockSize: ports.scale.blockSize,
    pick: ports.pick,
    firearmReady: isFirearmReady,
    sprinting: ports.sprinting,
    meleeReadiness,
    fireWeapon,
    enqueueDoorBar,
    dispatchScreenCommand,
  });
  const sessionControls: SessionControls = {
    active: () => ports.active(),
    intent: (): MoveIntent => controls.intent(),
    sampleAtPlayerTick,
    freeLooking: () => controls.freeLooking,
    readyHeld: () => controls.rightMouseHeld,
    firearmReady: (uid) => isFirearmReady(uid),
    aimingDownSights: () => gunPose.aimingDownSights(controls.aimingDownSights) && isAimingDownSights(),
    blocking: () => shouldPlayerBlock(),
    consumeDominantUse: () => controls.consumeDominantUse(),
    consumeOffUse: () => controls.consumeOffUse(),
    consumeStanceToggle: () => controls.consumeStanceToggle(),
    useDominant: () =>
      routeDominantUse(throwingStance, beginItemThrow, () => {
        // Build-mode canvas clicks belong exclusively to the block editor, not the held-item action.
        const action = selectPrimaryAction(ports.inventory());
        if (
          !(
            ports.buildMode() ||
            (action.kind === 'firearm' &&
              !action.item.firearm?.cylinder &&
              firearmHandlingFor(action.item, registry).action.fire !== undefined)
          )
        ) {
          handUse.perform(dominantSide(ports.inventory().character));
        }
      }),
    heldDominantUse: (atSimSeconds, pressed, triggerHeld) => {
      if (throwingStance) {
        ports.advanceHeldStrip(undefined, atSimSeconds, false);
        if (!triggerHeld) {
          releaseItemThrow();
        }
        return;
      }
      const sim = ports.sim();
      if (sim.body.actionRefusal) {
        ports.advanceHeldStrip(undefined, atSimSeconds, false);
        firearmTrigger.advance(atSimSeconds, undefined, pressed, triggerHeld);
        if (pressed) {
          presentation.refusal(sim.body.actionRefusal, sim.time);
        }
        return;
      }
      handleHeldDominantUse(atSimSeconds, pressed, triggerHeld);
      const action = selectPrimaryAction(ports.inventory());
      if (!freeLookAllowsUse(controls.freeLooking, action.kind)) {
        ports.advanceHeldStrip(undefined, atSimSeconds, false);
        return;
      }
      const stripUid =
        action.kind === 'magazine' && ports.selectedMagazineAction(action.item) === 'strip'
          ? action.item.uid
          : undefined;
      refusalReason(ports.advanceHeldStrip(stripUid, atSimSeconds, triggerHeld));
    },
    automaticFireHeld: () => {
      const weapon = automaticFireWeapon();
      return Boolean(
        (ports.replaySample()?.intent.useDominantHeld ?? controls.dominantUseHeld) &&
          !ports.sim().body.actionRefusal &&
          weapon &&
          automaticFireUid === weapon.uid &&
          isFirearmReady(weapon.uid) &&
          !ports.sprinting(),
      );
    },
    adjustPitch: (delta) => {
      const replaySample = ports.replaySample();
      if (!replaySample) {
        return controls.adjustPitch(delta);
      }
      const adjusted = adjustLookPitch(replaySample.pitch, delta);
      const next = { ...replaySample, pitch: adjusted.pitch };
      ports.setReplaySample(next);
      applyReplayLook(controls, next);
      return adjusted.applied;
    },
    useOff: () => {
      if (!ports.buildMode()) {
        handUse.perform(offSide(ports.inventory().character));
      }
    },
    yaw: () => controls.yaw,
    pitch: () => controls.pitch,
    walking: () => controls.walking,
    descending: () => ports.descending(),
  };
  return {
    controls: sessionControls,
    fireWeapon,
    cancelItemThrow,
    useTarget,
    itemThrowFlight,
    applyScreenCommand,
    dispatchScreenCommand,
    modalCommand,
    readingClosed,
    dispatchReplayAction,
    dispatchInputCommand,
    requestStanceAction,
    throwingStance: () => throwingStance,
    setThrowingStance: (value) => {
      throwingStance = value;
    },
    syncThrowingStance,
    toggleThrowingStance,
    dropHeldItemForThrowingStance,
    beginItemThrow,
    advancePendingItemThrow,
    toggleWornLights,
    useForwardButton,
    quickbarTap,
    quickbarHold,
    continueAction,
    stopAction,
    compress,
    reloadBinding,
    emotes,
    enqueueDoorBar,
    performHandUse: handUse.perform,
    interactionTargetAt: handUse.interactionTargetAt,
    refusePrimaryUseWhileHandling: handUse.refusePrimaryUseWhileHandling,
    meleeSelection: handUse.meleeSelection,
    readiness: { hasGunPoseInput, isFirearmReady, isAimingDownSights, shouldPlayerBlock },
  };
}
