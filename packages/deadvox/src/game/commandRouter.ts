// Routes the player's controls into the simulation: the session controls and trigger at the player tick, replayed
// actions, screen commands, furniture use and the item throw.

import { actionText } from '../core/actionText.ts';
import type { BlockEntity } from '../core/blockEntities.ts';
import { dominantSide, offSide } from '../core/character.ts';
import type { Registry } from '../core/content.ts';
import { CHUNK, type Vec3 } from '../core/coords.ts';
import { coreMessage } from '../core/coreText.ts';
import type { RecoveryChoices, WorkOperation } from '../core/craftCommands.ts';
import { throwStanceWorldOffset } from '../core/heldPose.ts';
import type { InputContext } from '../core/inputActions.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { flightForItem, hasMetThrowMinimumHold, type ItemFlight, throwDistanceForItem } from '../core/itemThrow.ts';
import type { RestKind } from '../core/longAction.ts';
import { pocketGroundItem, toHands, wieldOrPocket } from '../core/options.ts';
import type { Simulation } from '../core/sim.ts';
import { dispatchReplayStanceAction, type StanceReplayAction } from './crouchProneInput.ts';
import { type FirearmShotInput, firearmHandlingFor } from './firearmHandling.ts';
import { FirearmTrigger } from './firearmTrigger.ts';
import { freeLookAllowsUse } from './freeLook.ts';
import type { InputReplayRecorder, ReplayAction, ReplayControlSample } from './inputReplay.ts';
import { routeDominantUse } from './inputReplayActions.ts';
import { applyReplayLook } from './inputReplayPlayer.ts';
import type { ItemAction } from './itemActions.ts';
import type { MoveIntent } from './player.ts';
import { adjustLookPitch, type PlayerControls } from './playerControls.ts';
import { applyToHeldItem, type PlayerTickActions } from './playerTickActions.ts';
import { selectPrimaryAction } from './primaryAction.ts';
import { QUICKBAR_SLOTS } from './quickbar.ts';
import type { ReloadBinding } from './reloadInput.ts';
import { applyReplayActionPayload, type ReplayActionPayload, type ReplayCommandOwners } from './replayCommands.ts';
import { restKindForFurniture } from './rest.ts';
import type { Session, SessionControls } from './session.ts';

const QUICKBAR_ACTION = /^quickbar\.(tap|hold)\.(\d+)$/;

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
  closeInventoryScreen: () => void;
  syncMenuState: () => void;
  openInventory: (tab: 'items') => void;
  /** Opens the movable piece's action list. */
  openFurnitureChoices: (entity: BlockEntity, actions: ItemAction[]) => void;
  /** Tells a playtest observer, if one watches, that a search began. */
  beginSearch: (entity: BlockEntity) => void;
  /** Tells the tutorial guide, if one runs, that a weapon was inspected. */
  weaponInspected: (item: Item) => void;
  throwVisual: (launch: ItemThrowLaunch, inventory: Inventory) => void;
}

/** Live gestures a replay re-dispatches by their recorded action; their owners still live in play.ts. */
interface ReplayGesturePorts {
  requestStanceAction: (action: StanceReplayAction) => void;
  reloadBinding: () => ReloadBinding | undefined;
  toggleThrowingStance: () => void;
  dropHeldItemForThrowingStance: () => void;
  toggleWornLights: () => void;
  useForwardButton: () => void;
  quickbarTap: (slot: number) => void;
  quickbarHold: (slot: number) => void;
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
  sampleAtPlayerTick: NonNullable<SessionControls['sampleAtPlayerTick']>;
  replaying: () => boolean;
  replaySample: () => ReplayControlSample | undefined;
  setReplaySample: (sample: ReplayControlSample) => void;
  recorder: () => Pick<InputReplayRecorder, 'queueAction'> | undefined;
  inputContext: () => InputContext;
  pendingPlayerTickActions: Pick<PlayerTickActions, 'enqueue'>;
  /** Applies a screen command now, or records it and applies it at the next player tick. */
  dispatchScreenCommand: (payload: ReplayActionPayload) => string | undefined;
  firearmReady: (uid: number) => boolean;
  aimingDownSights: () => boolean;
  blocking: () => boolean;
  /** The debug block editor owns canvas clicks. */
  buildMode: () => boolean;
  handlingBusy: () => boolean;
  sprinting: () => boolean;
  throwingStance: () => boolean;
  syncThrowingStance: () => void;
  beginItemThrow: () => void;
  itemThrowTuning: Parameters<typeof throwDistanceForItem>[2];
  throwMinimumHoldSimSeconds: number;
  scale: { readonly blockSize: number; readonly minCy: number };
  eye: () => Vec3;
  lookDir: () => Vec3;
  performHandUse: (hand: 'right' | 'left') => void;
  advanceHeldStrip: (uid: number | undefined, atSimSeconds: number, held: boolean) => string | undefined;
  selectedMagazineAction: (item: Item) => string | undefined;
  firearmShotInput: (uid: number, atSimSeconds: number) => FirearmShotInput | undefined;
  fire: (shot: FirearmShotInput) => boolean;
  fireReason: (uid: number) => string | undefined;
  descending: () => boolean;
  actOnWork: (uid: number, operation: WorkOperation, choices?: RecoveryChoices) => string | undefined;
  enqueueDoorBar: (entity: BlockEntity, barring: boolean) => string | undefined;
  toggleDoor: (entity: BlockEntity) => void;
  toggleRestFromTarget: (kind: RestKind, entity: BlockEntity) => void;
  furnitureActions: (entity: BlockEntity) => ItemAction[];
  continueAction: () => void;
  stopAction: () => void;
  gestures: ReplayGesturePorts;
  /** Temporary until the input-command gate moves into the router (4b-4); play.ts owns it. */
  dispatchInputCommand: (
    command: { action: ReplayAction['action']; phase: ReplayAction['phase']; at: number },
    fromReplay: true,
  ) => void;
}

export interface CommandRouter {
  /** The session's controls, before any presentation guard wraps them. */
  readonly controls: SessionControls;
  fireWeapon: (item: Item, atSimSeconds: number) => boolean;
  /** Ends a held automatic burst, as leaving the throwing stance does. */
  clearAutomaticFire: () => void;
  cancelItemThrow: () => void;
  useTarget: (entity: BlockEntity) => void;
  itemThrowFlight: (item: Item, hand: HandSide, distanceMetres: number) => ItemFlight;
  applyScreenCommand: (payload: ReplayActionPayload) => string | undefined;
  dispatchReplayAction: (action: ReplayAction, sample: ReplayControlSample) => void;
}

export function createCommandRouter(ports: CommandRouterPorts): CommandRouter {
  const { controls, registry, presentation, gestures } = ports;
  const lines = actionText(registry);
  const firearmTrigger = new FirearmTrigger();
  let automaticFireUid: number | undefined;
  const refusalReason = (reason: string | undefined): void => {
    if (reason) {
      presentation.refusal(reason, ports.sim().time);
    }
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
      ports.throwingStance() ||
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
        automaticItem && ports.firearmReady(automaticItem.uid) && !ports.sprinting() ? automaticItem.uid : undefined;
    }
  };
  const readyAutomaticWeapon = (automaticItem: Item | undefined): Item | undefined =>
    automaticItem &&
    automaticItem.uid === automaticFireUid &&
    ports.firearmReady(automaticItem.uid) &&
    !ports.sprinting()
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
      ports.dispatchScreenCommand({ kind: 'item.throw.cancel' });
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
          ports.syncThrowingStance();
        });
      });
    }
  }
  function throwRecordedItem(itemUid: number, hand: HandSide, distanceMetres: number): void {
    applyToHeldItem(ports.inventory().hands, hand, itemUid, (item) => {
      throwHeldItem(item, hand, distanceMetres);
      ports.syncThrowingStance();
    });
  }
  function itemThrowFlight(item: Item, hand: HandSide, distanceMetres: number): ItemFlight {
    const { itemThrowTuning, scale } = ports;
    const s = scale.blockSize;
    const fullStrength = throwDistanceForItem(item, registry, itemThrowTuning, itemThrowTuning.chargeSimSeconds);
    const chargeProgress = fullStrength > 0 ? Math.max(0, Math.min(1, distanceMetres / fullStrength)) : 0;
    const offset: Vec3 = ports.throwingStance()
      ? throwStanceWorldOffset(hand, controls.yaw, controls.pitch, chargeProgress)
      : [0, 0, 0];
    const origin = ports.eye().map((value, axis) => value * s + offset[axis]!) as Vec3;
    return flightForItem(item, registry, {
      from: origin,
      direction: ports.lookDir(),
      distanceMetres,
      blockSize: s,
      minY: scale.minCy * CHUNK,
      isSolid: ports.session().physicalSolid,
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

  // ---- furniture ----

  function useTarget(entity: BlockEntity): void {
    const session = ports.session();
    const def = session.entities.defOf(entity);
    if (def.door) {
      ports.toggleDoor(entity);
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
      ports.toggleRestFromTarget(kind, entity);
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
    if (session.sim.compression.locksInput && session.rest.action?.furnitureUid !== entity.uid) {
      return undefined;
    }
    if (alternatives && ports.furnitureActions(entity).length > 0) {
      presentation.openFurnitureChoices(entity, ports.furnitureActions(entity));
    } else {
      useTarget(entity);
    }
    return undefined;
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
      work: ports.actOnWork,
      vehicleWork: (work, vehicleId, target, itemUid) => session.beginVehicleWork(work, vehicleId, target, itemUid),
      fitAttachment: (firearmUid, slotId, attachmentUid) =>
        session.firearmAttachments.fit(firearmUid, slotId, attachmentUid),
      removeAttachment: (firearmUid, slotId) => session.firearmAttachments.remove(firearmUid, slotId),
      loadBattery: (lightUid, batteryUid) => survival.loadBattery(lightUid, batteryUid),
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
        return entity?.bar ? ports.enqueueDoorBar(entity, false) : session.liftFurniture(uid, floorLocked);
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
      craftContinue: () => {
        ports.continueAction();
      },
      craftStop: () => {
        ports.stopAction();
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
      payload.kind === 'action.wait' ||
      payload.kind === 'vehicle.work'
    ) {
      presentation.closeInventoryScreen();
      presentation.syncMenuState();
    }
    return undefined;
  };
  const dispatchReplayQuickbar = (action: ReplayAction): boolean => {
    const match = QUICKBAR_ACTION.exec(action.action);
    if (!match) {
      return false;
    }
    const index = Number(match[2]);
    if (index < 1 || index > QUICKBAR_SLOTS) {
      return false;
    }
    (match[1] === 'tap' ? gestures.quickbarTap : gestures.quickbarHold)(index - 1);
    return true;
  };
  const dispatchReplayGesture = (action: ReplayAction): boolean => {
    if (dispatchReplayStanceAction(action.action, gestures.requestStanceAction)) {
      return true;
    }
    switch (action.action) {
      case 'firearm.load':
        gestures.reloadBinding()?.load();
        return true;
      case 'firearm.rack':
        gestures.reloadBinding()?.rack();
        return true;
      case 'firearm.remove':
        gestures.reloadBinding()?.remove();
        return true;
      case 'throw.stance.toggle':
        gestures.toggleThrowingStance();
        return true;
      case 'item.drop':
        gestures.dropHeldItemForThrowingStance();
        return true;
      case 'item.throw.cancel':
        cancelItemThrow();
        return true;
      case 'light.worn-toggle':
        gestures.toggleWornLights();
        return true;
      case 'hand.use-forward':
        gestures.useForwardButton();
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
    ports.dispatchInputCommand({ action: action.action, phase: action.phase, at: performance.now() }, true);
  };

  // ---- player tick ----

  const sessionControls: SessionControls = {
    active: () => ports.active(),
    intent: (): MoveIntent => controls.intent(),
    sampleAtPlayerTick: ports.sampleAtPlayerTick,
    freeLooking: () => controls.freeLooking,
    readyHeld: () => controls.rightMouseHeld,
    firearmReady: (uid) => ports.firearmReady(uid),
    aimingDownSights: () => ports.aimingDownSights(),
    blocking: () => ports.blocking(),
    consumeDominantUse: () => controls.consumeDominantUse(),
    consumeOffUse: () => controls.consumeOffUse(),
    consumeStanceToggle: () => controls.consumeStanceToggle(),
    useDominant: () =>
      routeDominantUse(ports.throwingStance(), ports.beginItemThrow, () => {
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
          ports.performHandUse(dominantSide(ports.inventory().character));
        }
      }),
    heldDominantUse: (atSimSeconds, pressed, triggerHeld) => {
      if (ports.throwingStance()) {
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
          ports.firearmReady(weapon.uid) &&
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
        ports.performHandUse(offSide(ports.inventory().character));
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
    clearAutomaticFire: () => {
      automaticFireUid = undefined;
    },
    cancelItemThrow,
    useTarget,
    itemThrowFlight,
    applyScreenCommand,
    dispatchReplayAction,
  };
}
