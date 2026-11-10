// Primary hand use at the player tick: the held item's action, a melee swing, or the station or door in the crosshair.

import { actionText, fillText } from '../../../engine/src/core/actionText.ts';
import type { MeleeWeapon } from '../../../engine/src/core/actorSystem.ts';
import type { BlockEntity } from '../../../engine/src/core/blockEntities.ts';
import { claimed } from '../../../engine/src/core/capabilities.ts';
import { dominantSide, offSide } from '../../../engine/src/core/character.ts';
import type { Registry } from '../../../engine/src/core/content.ts';
import type { Vec3 } from '../../../engine/src/core/coords.ts';
import { type InteractionTarget, pickInteractionTarget } from '../../../engine/src/core/interactionPick.ts';
import type { HandSide, Inventory } from '../../../engine/src/core/inventory.ts';
import type { Item } from '../../../engine/src/core/items.ts';
import type { MeleeProfile } from '../../../engine/src/core/meleePose.ts';
import { doorPlan } from '../../../engine/src/core/options.ts';
import type { SolidAt } from '../../../engine/src/core/raycast.ts';
import { reachTuning } from '../../../engine/src/core/reach.ts';
import type { Simulation } from '../../../engine/src/core/sim.ts';
import { openingTargetForHand } from './canOpening.ts';
import { DOOR_ACTION } from './doorAction.ts';
import { freeLookAllowsUse } from './freeLook.ts';
import type { ReplayControlSample } from './inputReplay.ts';
import {
  meleeProfileForWeapon,
  meleeWeaponFromContent,
  resolvePlayerMeleeWeapon,
  startPlayerMelee,
  unarmedMeleeWeapon,
} from './melee.ts';
import type { PlayerControls } from './playerControls.ts';
import { ignitionTargetForHand, primaryMeleeAction, selectPrimaryAction } from './primaryAction.ts';
import type { ReplayActionPayload } from './replayCommands.ts';
import type { Session } from './session.ts';

/** The melee readiness a primary melee action is chosen with (`src/game/primaryAction.ts`, `primaryMeleeAction`). */
type MeleeReadiness = Parameters<typeof primaryMeleeAction>[1];

/** The interaction pick's world inputs. */
export interface InteractionPickWorld {
  readonly worldSeed: number;
  readonly isSolid: SolidAt;
  readonly isOpaque: SolidAt;
}

export interface HandUseDeps {
  registry: Registry;
  controls: PlayerControls;
  session: () => Session;
  inventory: () => Inventory;
  sim: () => Pick<Simulation, 'time' | 'body'>;
  replaySample: () => ReplayControlSample | undefined;
  refusal: (reason: string, atSimSeconds: number) => void;
  /** Refuses a held item that has no primary action; presentation words the hint. */
  noPrimaryAction: (item: Item, atSimSeconds: number) => void;
  notice: (text: string) => void;
  blockSize: number;
  pick: InteractionPickWorld;
  firearmReady: (uid: number) => boolean;
  sprinting: () => boolean;
  meleeReadiness: (meleeWeaponHeld: boolean, emptyHand?: HandSide) => MeleeReadiness;
  fireWeapon: (item: Item, atSimSeconds: number) => boolean;
  enqueueDoorBar: (entity: BlockEntity, barring: boolean) => string | undefined;
  dispatchScreenCommand: (payload: ReplayActionPayload) => string | undefined;
}

interface MeleeSelection {
  weapon: MeleeWeapon;
  profile: MeleeProfile;
  hand?: 'right' | 'left';
  twoHanded: boolean;
  item?: Inventory['hands']['right'];
}

export interface HandUse {
  perform: (hand: 'right' | 'left') => void;
  /** The nearest visible furniture panel, cell or vehicle part along this look from this eye. */
  interactionTargetAt: (origin: Vec3, direction: Vec3) => InteractionTarget | undefined;
  /** Refuses a primary use while handling is busy; true when it refused. */
  refusePrimaryUseWhileHandling: () => boolean;
  meleeSelection: (preferredHand?: 'right' | 'left') => MeleeSelection;
}

export function createHandUse(deps: HandUseDeps): HandUse {
  const { registry, controls } = deps;
  const lines = actionText(registry);
  const showRefusal = (reason: string, atSimSeconds: number): void => deps.refusal(reason, atSimSeconds);

  const interactionTargetAt = (origin: Vec3, direction: Vec3): InteractionTarget | undefined => {
    const session = deps.session();
    const s = deps.blockSize;
    return pickInteractionTarget({
      inventory: deps.inventory(),
      entities: session.entities,
      origin,
      direction,
      maxDistance: reachTuning(registry).useReachMetres / s,
      blockSize: s,
      worldSeed: deps.pick.worldSeed,
      // Vehicles take part through their part boxes, so the cell queries leave them out.
      isSolid: deps.pick.isSolid,
      isOpaque: deps.pick.isOpaque,
      vehicleParts: session.vehicleParts.all(),
      throughLadders: session.ladderHold.on,
      // Piles lay out as drawn once their content's models load, never by load timing (`CONTROLS.md`, "Replay boundary").
      hasModel: (id) => registry.models.has(id),
      downedBodies: [...session.actorStore.entries()]
        .filter(([, actor]) => actor.incapacitated)
        .map(([id, actor]) => ({ id, body: actor.body })),
    });
  };
  /** The furniture in the crosshair from the session's eye, if the pick found furniture. */
  const lookedAt = (): BlockEntity | undefined => {
    const session = deps.session();
    const target = interactionTargetAt(session.playerEye(), session.playerLookDirection());
    return target?.kind === 'furniture' ? target.entity : undefined;
  };

  // ---- doors ----

  const activateKey = (item: Item) => {
    const entity = lookedAt();
    const { entities, inventory, queue, nameOf } = deps.session();
    if (!(entity && entities.defOf(entity).door)) {
      return;
    }
    const lock = registry.items.get(item.type)?.key?.lock;
    if (lock === undefined) {
      return;
    }
    const operation = entity.lock?.locked ? 'unlock' : 'lock';
    const plan = doorPlan(inventory, entity, operation, [lock]);
    if (!plan.ok) {
      showRefusal(plan.reason, deps.sim().time);
      return;
    }
    const label = fillText(operation === 'lock' ? lines.doors.lock : lines.doors.unlock, { door: nameOf(entity) });
    queue.enqueueAction(DOOR_ACTION, label, plan.time, {
      entityUid: entity.uid,
      locked: operation === 'lock',
    });
  };
  const activateBar = () => {
    const entity = lookedAt();
    const reason = entity && deps.session().entities.defOf(entity).door ? deps.enqueueDoorBar(entity, true) : undefined;
    if (reason) {
      showRefusal(reason, deps.sim().time);
    }
  };

  // ---- melee ----

  const handUids = () => {
    const inventory = deps.inventory();
    return {
      right: inventory.hands.right?.uid ?? null,
      left: inventory.hands.left?.uid ?? null,
    };
  };
  const meleeSelection = (preferredHand?: 'right' | 'left'): MeleeSelection => {
    const inventory = deps.inventory();
    const handOrder: readonly ('right' | 'left')[] = preferredHand
      ? [preferredHand]
      : [dominantSide(inventory.character), offSide(inventory.character)];
    for (const hand of handOrder) {
      const item = inventory.hands[hand];
      const weapon = item && registry.items.get(item.type)?.weapon?.melee;
      if (item && weapon) {
        return {
          weapon: meleeWeaponFromContent(weapon),
          profile: meleeProfileForWeapon(registry.meleeClasses, weapon.type),
          hand,
          twoHanded: registry.items.get(item.type)?.twoHanded ?? false,
          item,
        };
      }
    }
    return {
      weapon: unarmedMeleeWeapon(registry.meleeClasses),
      profile: 'fists',
      ...(preferredHand === undefined ? {} : { hand: preferredHand }),
      twoHanded: false,
    };
  };
  const swing = (preferredHand?: 'right' | 'left') => {
    const session = deps.session();
    const { sim } = session;
    if (sim.body.actionRefusal) {
      showRefusal(sim.body.actionRefusal, sim.time);
      return;
    }
    const selected = meleeSelection(preferredHand);
    const classTuning =
      selected.profile === 'fists'
        ? claimed(registry.meleeClasses, 'unarmed')
        : registry.meleeClasses.get(selected.weapon.type!);
    if (classTuning === undefined) {
      throw new Error(`Missing melee class tuning for ${selected.profile}`);
    }
    const swingWeapon = resolvePlayerMeleeWeapon(
      selected.weapon,
      classTuning,
      session.sim.body.consequences.swingSlowdown * session.sim.body.pain.effects.handlingSlowdown,
    );
    const look = session.playerLook();
    const result = startPlayerMelee(
      session.playerCombat,
      sim.needs,
      {
        origin: session.playerEye(look),
        direction: session.playerLookDirection(look),
        weapon: swingWeapon,
        profile: selected.profile,
        ...(selected.hand === undefined ? {} : { hand: selected.hand }),
        twoHanded: selected.twoHanded,
        hands: handUids(),
        aimYaw: look.yaw,
        aimPitch: look.pitch,
      },
      sim.body.tuning.staminaRegenDelaySimSeconds,
    );
    if (result === 'too-tired') {
      showRefusal(lines.melee.tooTired, sim.time);
    }
  };
  const startPrimaryMelee = (action: ReturnType<typeof selectPrimaryAction>): void => {
    const selected = primaryMeleeAction(
      action,
      deps.meleeReadiness(action.kind === 'melee', action.kind === 'fists' ? action.hand : undefined),
    );
    if (!selected) {
      return;
    }
    // On a ladder only the free hand swings.
    swing(deps.session().ladderHold.freeHand(selected.hand));
  };

  // ---- held items ----

  const refusalReason = (reason: string | undefined): void => {
    if (reason) {
      showRefusal(reason, deps.sim().time);
    }
  };
  const refusePrimaryUseWhileHandling = (): boolean => {
    const { queue, firearms } = deps.session();
    if (!(queue.busy || firearms.busy)) {
      return false;
    }
    showRefusal(lines.common.busy, deps.sim().time);
    return true;
  };
  const activateIgniter = (item: Item, hand: HandSide): void => {
    const target = ignitionTargetForHand(deps.inventory(), hand);
    const usable = target ?? (registry.items.get(item.type)?.light ? item : undefined);
    if (usable) {
      refusalReason(deps.session().survival.use(usable));
      return;
    }
    deps.noPrimaryAction(item, deps.sim().time);
  };
  const fireHeldItem = (item: Item): void => {
    if (!deps.firearmReady(item.uid) || deps.sprinting() || deps.fireWeapon(item, deps.sim().time)) {
      return;
    }
    showRefusal(deps.session().firearms.fireReason(item.uid) ?? lines.play.gunNotReady, deps.sim().time);
  };
  const togglePin = (item: Item): void => {
    const state = deps.session().fuses.togglePin(item);
    if (state === 'pulled') {
      deps.notice(lines.play.pinPulled);
    } else if (state === 'in') {
      deps.notice(lines.play.pinIn);
    } else if (state === 'burning') {
      showRefusal(lines.play.fuseBurning, deps.sim().time);
    }
  };
  const openHeldCan = (hand: HandSide): void => {
    const target = openingTargetForHand(deps.inventory(), hand);
    refusalReason(target ? deps.session().unpacking.activate(target) : lines.unpacking.noCan);
  };
  const sharpenAtWheel = (hand: HandSide): boolean => {
    const held = deps.inventory().hands[hand];
    const station = lookedAt();
    const { sharpening } = deps.session();
    if (!(held && sharpening.wheelMethod(held, station))) {
      return false;
    }
    refusalReason(sharpening.activate(hand, station));
    return true;
  };

  const perform = (hand: 'right' | 'left') => {
    const session = deps.session();
    const { sim, survival, sharpening, unpacking, magazines } = session;
    if (sim.body.actionRefusal) {
      showRefusal(sim.body.actionRefusal, sim.time);
      return;
    }
    if (refusePrimaryUseWhileHandling()) {
      return;
    }
    const inventory = deps.inventory();
    const held = inventory.hands[hand];
    const action = selectPrimaryAction(inventory, hand, held && survival.selectedItemAction(held)?.id);
    if (!freeLookAllowsUse(controls.freeLooking, action.kind)) {
      return;
    }
    if (sharpenAtWheel(hand)) {
      return;
    }
    switch (action.kind) {
      case 'sharpen':
        refusalReason(sharpening.activate(hand));
        return;
      case 'open-can':
        openHeldCan(hand);
        return;
      case 'continue-work':
        deps.dispatchScreenCommand({ kind: 'craft.continue' });
        return;
      case 'unpack':
        refusalReason(unpacking.activate(action.item));
        return;
      case 'pin':
        togglePin(action.item);
        return;
      case 'melee':
        startPrimaryMelee(action);
        return;
      case 'ignite':
        activateIgniter(action.item, action.hand);
        return;
      case 'light':
      case 'read':
      case 'use':
        refusalReason(survival.use(action.item));
        return;
      case 'firearm':
        fireHeldItem(action.item);
        return;
      case 'magazine':
        refusalReason(
          survival.selectedItemAction(action.item)?.magazine === 'strip'
            ? magazines.strip(
                action.item.uid,
                sim.time,
                deps.replaySample()?.intent.useDominantHeld ?? controls.dominantUseHeld,
              )
            : lines.magazine.empty,
        );
        return;
      case 'fists':
        startPrimaryMelee(action);
        return;
      case 'noop':
        return;
      case 'key':
        activateKey(action.item);
        return;
      case 'bar':
        activateBar();
        return;
      case 'none':
        deps.noPrimaryAction(action.item, sim.time);
        return;
      default: {
        const unhandled: never = action;
        throw new Error(`Unhandled primary action ${String(unhandled)}`);
      }
    }
  };

  return { perform, interactionTargetAt, refusePrimaryUseWhileHandling, meleeSelection };
}
