// Routes the player's controls into the simulation at the player tick: the session controls and the trigger.

import { dominantSide, offSide } from '../core/character.ts';
import type { Registry } from '../core/content.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import type { Simulation } from '../core/sim.ts';
import { type FirearmShotInput, firearmHandlingFor } from './firearmHandling.ts';
import { FirearmTrigger } from './firearmTrigger.ts';
import { freeLookAllowsUse } from './freeLook.ts';
import type { ReplayControlSample } from './inputReplay.ts';
import { routeDominantUse } from './inputReplayActions.ts';
import { applyReplayLook } from './inputReplayPlayer.ts';
import type { MoveIntent } from './player.ts';
import { adjustLookPitch, type PlayerControls } from './playerControls.ts';
import { selectPrimaryAction } from './primaryAction.ts';
import type { SessionControls } from './session.ts';

/** Where routed refusals reach the player; called in place, in the order the routing reaches them. */
interface CommandRouterPresentation {
  refusal: (reason: string, atSimSeconds: number) => void;
}

/** What the router reads and drives; owners outside the router supply each port lazily. */
export interface CommandRouterPorts {
  controls: PlayerControls;
  registry: Registry;
  /** The session owns these; it is created with the router's controls, so they are read lazily. */
  inventory: () => Inventory;
  sim: () => Pick<Simulation, 'time' | 'body'>;
  presentation: CommandRouterPresentation;
  /** Input reaches the world: loading finished and the pointer is in play, or a replay drives it. */
  active: () => boolean;
  sampleAtPlayerTick: NonNullable<SessionControls['sampleAtPlayerTick']>;
  replaySample: () => ReplayControlSample | undefined;
  setReplaySample: (sample: ReplayControlSample) => void;
  firearmReady: (uid: number) => boolean;
  aimingDownSights: () => boolean;
  blocking: () => boolean;
  /** The debug block editor owns canvas clicks. */
  buildMode: () => boolean;
  handlingBusy: () => boolean;
  sprinting: () => boolean;
  throwingStance: () => boolean;
  beginItemThrow: () => void;
  /** Temporary until the item-throw path moves into the router (4b-3); play.ts owns the release. */
  releaseItemThrow: () => void;
  performHandUse: (hand: 'right' | 'left') => void;
  advanceHeldStrip: (uid: number | undefined, atSimSeconds: number, held: boolean) => string | undefined;
  selectedMagazineAction: (item: Item) => string | undefined;
  firearmShotInput: (uid: number, atSimSeconds: number) => FirearmShotInput | undefined;
  fire: (shot: FirearmShotInput) => boolean;
  fireReason: (uid: number) => string | undefined;
  descending: () => boolean;
}

export interface CommandRouter {
  /** The session's controls, before any presentation guard wraps them. */
  readonly controls: SessionControls;
  fireWeapon: (item: Item, atSimSeconds: number) => boolean;
  /** Ends a held automatic burst, as leaving the throwing stance does. */
  clearAutomaticFire: () => void;
}

export function createCommandRouter(ports: CommandRouterPorts): CommandRouter {
  const { controls, registry, presentation } = ports;
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
          ports.releaseItemThrow();
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
  };
}
