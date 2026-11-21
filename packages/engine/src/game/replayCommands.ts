import { actionText } from '../core/actionText.ts';
import { isCastRay } from '../core/castRules.ts';
import type { RecoveryChoices, WorkOperation } from '../core/craftCommands.ts';
import type { CraftPreference, CraftSources } from '../core/crafting.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory, TargetState } from '../core/inventory.ts';
import type { PartServiceRequest } from '../core/partService.ts';
import {
  copyVehicleWorkPlacement,
  type VehicleWorkPlacement,
  type VehicleWorkTarget,
  validVehicleWorkPlacement,
} from '../core/vehicleInstances.ts';
import type { WorldDestination } from '../core/worldDestination.ts';
import { type CastAttempt, PLAYER_CASTER_ID } from './castCommit.ts';
import { type DownedBodyWay, isDownedBodyWay } from './downedBody.ts';
import { QUICKBAR_SLOTS, type Quickbar } from './quickbar.ts';

export type ReplayActionPayload =
  | { kind: 'liquid.pour'; sourceUid: number; receiverUid: number }
  | { kind: 'inventory.move'; itemUid: number; target: TargetState; count: number }
  | { kind: 'inventory.to-hands'; itemUid: number; feet: [number, number, number] }
  | { kind: 'inventory.inspect'; itemUid: number }
  | { kind: 'inventory.activate'; itemUid: number }
  | { kind: 'hand.action'; itemUid: number; actionId: string }
  | { kind: 'inventory.wield-or-pocket'; itemUid: number; feet: [number, number, number] }
  | { kind: 'item.pickup'; itemUid: number; mode: 'pocket' | 'wield'; feet: [number, number, number] }
  | { kind: 'furniture.interact'; entityUid: number; alternatives?: true }
  | { kind: 'furniture.lift'; entityUid: number; floorLocked?: boolean }
  | { kind: 'furniture.use'; entityUid: number }
  | { kind: 'furniture.slide'; entityUid: number; way: 'push' }
  | { kind: 'furniture.place'; pos: [number, number, number] }
  | { kind: 'power.set'; entityUid: number; enabled: boolean }
  | { kind: 'charger.start'; entityUid: number }
  | { kind: 'charger.stop'; entityUid: number }
  | { kind: 'furniture.turn' }
  | { kind: 'furniture.tip' }
  | { kind: 'actor.downed'; actorId: number; way: DownedBodyWay }
  | { kind: 'inventory.search'; entityUid: number }
  | ({ kind: 'inventory.work'; itemUid: number; operation: WorkOperation } & RecoveryChoices)
  | { kind: 'inventory.assign'; slot: number; itemUid: number }
  | { kind: 'inventory.cancel-handling' }
  | { kind: 'firearm.attachment.fit'; firearmUid: number; slotId: string; attachmentUid: number }
  | { kind: 'firearm.attachment.remove'; firearmUid: number; slotId: string }
  | ({
      kind: 'vehicle.work';
      work: 'install' | 'remove';
      vehicleId: number;
      fittingId: string;
      itemUid: number;
    } & VehicleWorkPlacement)
  | { kind: 'vehicle.part'; vehicleId: number; fittingId: string }
  | { kind: 'light.battery.load'; lightUid: number; batteryUid: number }
  | { kind: 'light.battery.unload'; lightUid: number; target: TargetState }
  | { kind: 'craft.start'; recipeId: string; preference?: CraftPreference; sources?: CraftSources }
  | {
      kind: 'craft.place';
      recipeId: string;
      destination: WorldDestination;
      preference?: CraftPreference;
      sources?: CraftSources;
    }
  | {
      kind: 'craft.repair-entity';
      recipeId: string;
      entityUid: number;
      preference: CraftPreference;
      sources?: CraftSources;
    }
  | {
      kind: 'craft.repair-cell';
      expected: Readonly<{ epoch: number }>;
      recipeId: string;
      cell: [number, number, number];
      preference: CraftPreference;
      sources?: CraftSources;
    }
  | { kind: 'craft.take-apart-entity'; entityUid: number }
  | {
      kind: 'craft.take-apart-cell';
      cell: [number, number, number];
      expected: Readonly<{ block: string; epoch: number }>;
    }
  | ({ kind: 'craft.service-part'; entityUid: number } & PartServiceRequest)
  | { kind: 'craft.continue' }
  | { kind: 'craft.stop' }
  | { kind: 'action.wait' }
  | { kind: 'action.wake-hour'; gameHour: number | null }
  | { kind: 'item.throw.cancel' }
  | { kind: 'item.throw'; itemUid: number; hand: 'left' | 'right'; distance: number }
  | { kind: 'cast.cancel' }
  | {
      kind: 'cast.commit';
      abilityId: string;
      itemUid: number;
      hand: 'left' | 'right';
      origin: [number, number, number];
      aim: [number, number, number];
      heldSimSeconds: number;
    };

// Checked against the payload union both ways, so a new screen command cannot reach the recorder without an
// encodable id: `satisfies` refuses an extra kind, and the exported type names a missing one. A list, not a record
// keyed by kind, because time-lint reads a property named for a unit as a runtime temporal name.
const PAYLOAD_KINDS = [
  'liquid.pour',
  'inventory.move',
  'inventory.to-hands',
  'inventory.inspect',
  'inventory.activate',
  'hand.action',
  'inventory.wield-or-pocket',
  'item.pickup',
  'furniture.interact',
  'furniture.lift',
  'furniture.use',
  'furniture.slide',
  'furniture.place',
  'power.set',
  'charger.start',
  'charger.stop',
  'furniture.turn',
  'furniture.tip',
  'actor.downed',
  'inventory.search',
  'inventory.work',
  'inventory.assign',
  'inventory.cancel-handling',
  'firearm.attachment.fit',
  'firearm.attachment.remove',
  'vehicle.work',
  'vehicle.part',
  'light.battery.load',
  'light.battery.unload',
  'craft.start',
  'craft.place',
  'craft.repair-entity',
  'craft.repair-cell',
  'craft.take-apart-entity',
  'craft.take-apart-cell',
  'craft.service-part',
  'craft.continue',
  'craft.stop',
  'action.wait',
  'action.wake-hour',
  'item.throw.cancel',
  'item.throw',
  'cast.cancel',
  'cast.commit',
] as const satisfies readonly ReplayActionPayload['kind'][];
type MissingPayloadKind = Exclude<ReplayActionPayload['kind'], (typeof PAYLOAD_KINDS)[number]>;
export const REPLAY_PAYLOAD_KINDS: [MissingPayloadKind] extends [never] ? typeof PAYLOAD_KINDS : MissingPayloadKind =
  PAYLOAD_KINDS;

const isCellExpected = (value: unknown, rubble: boolean): boolean => {
  if (!value || typeof value !== 'object' || !('epoch' in value)) {
    return false;
  }
  return (
    Number.isSafeInteger(value.epoch) &&
    (value.epoch as number) >= (rubble ? 0 : 1) &&
    (!rubble || ('block' in value && typeof value.block === 'string' && value.block.length > 0)) &&
    Object.keys(value).every((key) => key === 'epoch' || (rubble && key === 'block'))
  );
};

const isUid = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const isTriple = (value: unknown, isPart: (part: unknown) => boolean = Number.isFinite): boolean =>
  Array.isArray(value) && value.length === 3 && value.every(isPart);
const isSpot = (value: unknown): boolean =>
  Boolean(value) &&
  typeof value === 'object' &&
  Number.isSafeInteger((value as { x?: unknown }).x) &&
  Number.isSafeInteger((value as { y?: unknown }).y) &&
  typeof (value as { rotated?: unknown }).rotated === 'boolean';
const isSpotPart = (target: Record<string, unknown>): boolean =>
  (target.at === undefined || isSpot(target.at)) &&
  (target.ontoUid === undefined || isUid(target.ontoUid)) &&
  (target.reserved === undefined || target.reserved === true);
const isTargetState = (value: unknown): value is TargetState => {
  if (!(value && typeof value === 'object')) {
    return false;
  }
  const target = value as Record<string, unknown>;
  switch (target.kind) {
    case 'hand':
      return target.side === 'right' || target.side === 'left';
    case 'worn':
      return true;
    case 'pocket':
      return (
        isUid(target.ownerUid) &&
        Number.isSafeInteger(target.pocket) &&
        (target.pocket as number) >= 0 &&
        isSpotPart(target)
      );
    case 'pile':
      return (
        Array.isArray(target.pos) && target.pos.length === 3 && target.pos.every(Number.isFinite) && isSpotPart(target)
      );
    case 'furniture':
      return (
        isUid(target.entityUid) &&
        Number.isSafeInteger(target.pocket) &&
        (target.pocket as number) >= 0 &&
        isSpotPart(target)
      );
    default:
      return false;
  }
};

const isAttachmentPayload = (payload: Record<string, unknown>): boolean =>
  isUid(payload.firearmUid) &&
  typeof payload.slotId === 'string' &&
  (payload.kind !== 'firearm.attachment.fit' || isUid(payload.attachmentUid));

const isRecoveryChoices = (payload: Record<string, unknown>): boolean => {
  const { receivers, spillApproval: approval } = payload;
  return (
    (payload.recoveryOperation === undefined ||
      payload.recoveryOperation === 'salvage' ||
      payload.recoveryOperation === 'disassembly') &&
    (receivers === undefined ||
      (Array.isArray(receivers) &&
        receivers.every((row: unknown) => {
          if (!row || typeof row !== 'object') {
            return false;
          }
          const entry = row as Record<string, unknown>;
          return typeof entry.liquid === 'string' && entry.liquid.length > 0 && isUid(entry.uid);
        }))) &&
    (approval === undefined ||
      (Array.isArray(approval) &&
        approval.every((row: unknown) => {
          if (!row || typeof row !== 'object') {
            return false;
          }
          const entry = row as Record<string, unknown>;
          return (
            typeof entry.liquid === 'string' &&
            entry.liquid.length > 0 &&
            Number.isSafeInteger(entry.volumeMicrolitres) &&
            (entry.volumeMicrolitres as number) >= 0
          );
        })))
  );
};

const isPourPayload = (payload: Record<string, unknown>): boolean =>
  isUid(payload.sourceUid) && isUid(payload.receiverUid);

const isPowerPayload = (payload: Record<string, unknown>): boolean =>
  isUid(payload.entityUid) && typeof payload.enabled === 'boolean';

const isSlidePayload = (payload: Record<string, unknown>): boolean =>
  isUid(payload.entityUid) && payload.way === 'push';

const isInteractPayload = (payload: Record<string, unknown>): boolean =>
  isUid(payload.entityUid) && (payload.alternatives === undefined || payload.alternatives === true);

const isLiftPayload = (payload: Record<string, unknown>): boolean =>
  isUid(payload.entityUid) && (payload.floorLocked === undefined || typeof payload.floorLocked === 'boolean');

const isVehicleWorkPayload = (payload: Record<string, unknown>): boolean =>
  (payload.work === 'install' || payload.work === 'remove') &&
  isUid(payload.vehicleId) &&
  typeof payload.fittingId === 'string' &&
  payload.fittingId !== '' &&
  isUid(payload.itemUid) &&
  validVehicleWorkPlacement(payload);

const isVehiclePartPayload = (payload: Record<string, unknown>): boolean =>
  isUid(payload.vehicleId) &&
  typeof payload.fittingId === 'string' &&
  payload.fittingId !== '' &&
  Object.keys(payload).length === 3;

/** An hour of the day, or null to sleep until rested. */
const isWakeGameHour = (value: unknown): boolean =>
  value === null || (Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < 24);

const isCraftStartPayload = (payload: Record<string, unknown>): boolean =>
  typeof payload.recipeId === 'string' &&
  (payload.preference === undefined ||
    (payload.preference !== null &&
      typeof payload.preference === 'object' &&
      !Array.isArray(payload.preference) &&
      Object.entries(payload.preference).every(
        ([group, ref]) =>
          Number.isSafeInteger(Number(group)) &&
          Number(group) >= 0 &&
          ref !== null &&
          typeof ref === 'object' &&
          !Array.isArray(ref) &&
          Object.keys(ref).length === 2 &&
          (('kind' in ref &&
            ref.kind === 'item' &&
            'item' in ref &&
            typeof ref.item === 'string' &&
            ref.item.length > 0) ||
            ('kind' in ref &&
              ref.kind === 'liquid' &&
              'liquid' in ref &&
              typeof ref.liquid === 'string' &&
              ref.liquid.length > 0)),
      ))) &&
  (payload.sources === undefined ||
    (payload.sources !== null &&
      typeof payload.sources === 'object' &&
      !Array.isArray(payload.sources) &&
      Object.entries(payload.sources).every(
        ([group, uids]) =>
          Number.isSafeInteger(Number(group)) &&
          Number(group) >= 0 &&
          Array.isArray(uids) &&
          uids.every(isUid) &&
          new Set(uids).size === uids.length,
      )));

const isWorldDestination = (destination: unknown): boolean => {
  if (destination === null || typeof destination !== 'object' || !('kind' in destination)) {
    return false;
  }
  const fields = Object.keys(destination).length;
  switch (destination.kind) {
    case 'cell':
      return 'pos' in destination && isTriple(destination.pos, Number.isSafeInteger) && fields === 2;
    case 'entity':
      return (
        'pos' in destination &&
        isTriple(destination.pos, Number.isFinite) &&
        'facing' in destination &&
        ['n', 's', 'e', 'w'].includes(destination.facing as string) &&
        fields === 3
      );
    case 'door':
      return (
        'uid' in destination &&
        isUid(destination.uid) &&
        'side' in destination &&
        (destination.side === 'front' || destination.side === 'back') &&
        fields === 3
      );
    default:
      return false;
  }
};

const isCraftCommandPayload = (payload: Record<string, unknown>): boolean => {
  switch (payload.kind) {
    case 'craft.start':
      return isCraftStartPayload(payload);
    case 'craft.place':
      return (
        isCraftStartPayload(payload) &&
        isWorldDestination(payload.destination) &&
        Object.keys(payload).every((key) => ['kind', 'recipeId', 'destination', 'preference', 'sources'].includes(key))
      );
    case 'craft.repair-entity':
      return (
        isUid(payload.entityUid) &&
        payload.preference !== undefined &&
        isCraftStartPayload(payload) &&
        Object.keys(payload).every((key) => ['kind', 'recipeId', 'entityUid', 'preference', 'sources'].includes(key))
      );
    case 'craft.repair-cell':
      return (
        isCellExpected(payload.expected, false) &&
        isTriple(payload.cell, Number.isSafeInteger) &&
        payload.preference !== undefined &&
        isCraftStartPayload(payload) &&
        Object.keys(payload).every((key) =>
          ['kind', 'recipeId', 'cell', 'expected', 'preference', 'sources'].includes(key),
        )
      );
    case 'craft.take-apart-entity':
      return isUid(payload.entityUid) && Object.keys(payload).length === 2;
    case 'craft.take-apart-cell':
      return (
        isTriple(payload.cell, Number.isSafeInteger) &&
        isCellExpected(payload.expected, true) &&
        Object.keys(payload).length === 3
      );
    case 'craft.service-part':
      return isServicePartPayload(payload);
    default:
      return false;
  }
};

const isServicePartPayload = (payload: Record<string, unknown>): boolean =>
  isUid(payload.entityUid) &&
  typeof payload.slot === 'string' &&
  payload.slot !== '' &&
  ((payload.operation === 'remove' && Object.keys(payload).length === 4) ||
    (payload.operation === 'fit' && isUid(payload.itemUid) && Object.keys(payload).length === 5));

const point = ([x, y, z]: [number, number, number]) => ({ x, y, z });

/** The attempt a recorded commit replays; the player is the only caster a recording holds. */
export const castAttemptOf = (payload: Extract<ReplayActionPayload, { kind: 'cast.commit' }>): CastAttempt => ({
  casterId: PLAYER_CASTER_ID,
  abilityId: payload.abilityId,
  sourceItemUid: payload.itemUid,
  hand: payload.hand,
  origin: point(payload.origin),
  aim: point(payload.aim),
  heldSimSeconds: payload.heldSimSeconds,
});

/** What a live release records for its commit. */
export const castCommitPayload = ({
  abilityId,
  sourceItemUid,
  hand,
  origin,
  aim,
  heldSimSeconds,
}: CastAttempt): Extract<ReplayActionPayload, { kind: 'cast.commit' }> => ({
  kind: 'cast.commit',
  abilityId,
  itemUid: sourceItemUid,
  hand,
  origin: [origin.x, origin.y, origin.z],
  aim: [aim.x, aim.y, aim.z],
  heldSimSeconds,
});

const isCastCommitPayload = (payload: Record<string, unknown>): boolean =>
  Object.keys(payload).length === 7 &&
  typeof payload.abilityId === 'string' &&
  payload.abilityId.length > 0 &&
  isUid(payload.itemUid) &&
  (payload.hand === 'left' || payload.hand === 'right') &&
  isTriple(payload.origin) &&
  isTriple(payload.aim) &&
  isCastRay(point(payload.origin as [number, number, number]), point(payload.aim as [number, number, number])) &&
  Number.isFinite(payload.heldSimSeconds) &&
  (payload.heldSimSeconds as number) >= 0;

export const isReplayActionPayload = (value: unknown): value is ReplayActionPayload => {
  if (!(value && typeof value === 'object' && !Array.isArray(value))) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  switch (payload.kind) {
    case 'liquid.pour':
      return isPourPayload(payload);
    case 'inventory.move':
      return (
        isUid(payload.itemUid) &&
        isTargetState(payload.target) &&
        Number.isSafeInteger(payload.count) &&
        (payload.count as number) > 0
      );
    case 'inventory.to-hands':
    case 'inventory.wield-or-pocket':
      return isUid(payload.itemUid) && isTriple(payload.feet);
    case 'inventory.activate':
    case 'inventory.inspect':
      return isUid(payload.itemUid);
    case 'hand.action':
      return isUid(payload.itemUid) && typeof payload.actionId === 'string' && payload.actionId.length > 0;
    case 'power.set':
      return isPowerPayload(payload);
    case 'charger.start':
    case 'charger.stop':
    case 'inventory.search':
    case 'furniture.use':
      return isUid(payload.entityUid);
    case 'furniture.interact':
      return isInteractPayload(payload);
    case 'furniture.lift':
      return isLiftPayload(payload);
    case 'furniture.slide':
      return isSlidePayload(payload);
    case 'furniture.place':
      return isTriple(payload.pos, Number.isSafeInteger);
    case 'actor.downed':
      return isUid(payload.actorId) && isDownedBodyWay(payload.way);
    case 'item.pickup':
      return (
        isUid(payload.itemUid) && (payload.mode === 'pocket' || payload.mode === 'wield') && isTriple(payload.feet)
      );
    case 'inventory.work':
      return (
        isUid(payload.itemUid) &&
        ['continue', 'apart', 'disassemble'].includes(payload.operation as string) &&
        isRecoveryChoices(payload)
      );
    case 'inventory.assign':
      return (
        Number.isSafeInteger(payload.slot) &&
        (payload.slot as number) >= 0 &&
        (payload.slot as number) < QUICKBAR_SLOTS &&
        isUid(payload.itemUid)
      );
    case 'firearm.attachment.fit':
    case 'firearm.attachment.remove':
      return isAttachmentPayload(payload);
    case 'vehicle.work':
      return isVehicleWorkPayload(payload);
    case 'vehicle.part':
      return isVehiclePartPayload(payload);
    case 'light.battery.load':
      return isUid(payload.lightUid) && isUid(payload.batteryUid);
    case 'light.battery.unload':
      return isUid(payload.lightUid) && isTargetState(payload.target);
    case 'inventory.cancel-handling':
    case 'furniture.turn':
    case 'furniture.tip':
    case 'craft.continue':
    case 'craft.stop':
    case 'action.wait':
    case 'item.throw.cancel':
    case 'cast.cancel':
      return Object.keys(payload).length === 1;
    case 'action.wake-hour':
      return isWakeGameHour(payload.gameHour);
    case 'item.throw':
      return (
        isUid(payload.itemUid) &&
        (payload.hand === 'left' || payload.hand === 'right') &&
        Number.isFinite(payload.distance) &&
        (payload.distance as number) >= 0 &&
        (payload.distance as number) <= 10_000
      );
    case 'cast.commit':
      return isCastCommitPayload(payload);
    case 'craft.start':
    case 'craft.place':
    case 'craft.repair-entity':
    case 'craft.repair-cell':
    case 'craft.take-apart-entity':
    case 'craft.take-apart-cell':
    case 'craft.service-part':
      return isCraftCommandPayload(payload);
    default:
      return false;
  }
};

export interface ReplayCommandOwners {
  inventory: Pick<Inventory, 'itemByUid' | 'carriedByUid' | 'resolveTarget' | 'registry'>;
  queue: Pick<HandlingQueue, 'enqueue' | 'cancel'>;
  quickbar: Pick<Quickbar, 'assign'>;
  search: (entityUid: number) => string | undefined;
  inspect?: (itemUid: number) => void;
  activate?: (itemUid: number) => string | undefined;
  /** Runs the held item's action `actionId` once, as the action menu or a tap chose it. */
  handAction?: (itemUid: number, actionId: string) => string | undefined;
  wieldOrPocket?: (itemUid: number, feet: [number, number, number]) => string | undefined;
  charger?: (entityUid: number, operation: 'start' | 'stop') => string | undefined;
  power?: (entityUid: number, enabled: boolean) => string | undefined;
  work: (itemUid: number, operation: WorkOperation, choices?: RecoveryChoices) => string | undefined;
  pour?: (sourceUid: number, receiverUid: number) => string | undefined;
  fitAttachment?: (firearmUid: number, slotId: string, attachmentUid: number) => string | undefined;
  removeAttachment?: (firearmUid: number, slotId: string) => string | undefined;
  vehicleWork: (
    work: 'install' | 'remove',
    vehicleId: number,
    target: VehicleWorkTarget,
    itemUid: number,
  ) => string | undefined;
  /** Opens a shut vehicle part or shuts an open one, as handling. */
  operateVehiclePart: (vehicleId: number, fittingId: string) => string | undefined;
  /** Puts a battery into a light from the light's battery slot on its item card. */
  loadBattery: (lightUid: number, batteryUid: number) => string | undefined;
  /** Takes a light's battery out of its item-card slot to the chosen place. */
  unloadBattery: (lightUid: number, target: TargetState) => string | undefined;
  toHands: (itemUid: number, feet: [number, number, number]) => string | undefined;
  pickup: (itemUid: number, mode: 'pocket' | 'wield', feet: [number, number, number]) => string | undefined;
  interact: (entityUid: number, alternatives?: true) => string | undefined;
  lift: (entityUid: number, floorLocked?: boolean) => string | undefined;
  useFurniture: (entityUid: number) => string | undefined;
  slide: (entityUid: number, way: 'push') => string | undefined;
  /** Sets the carried piece down at the aimed cell. */
  place: (pos: [number, number, number]) => string | undefined;
  /** Turns the carried piece a quarter, seen from above. */
  turn: () => string | undefined;
  /** Tips the carried piece onto its next face. */
  tip: () => string | undefined;
  clearDownedBody: (actorId: number, way: DownedBodyWay) => string | undefined;
  craftStart: (recipeId: string, preference?: CraftPreference, sources?: CraftSources) => string | undefined;
  craftPlace?: (
    recipeId: string,
    destination: WorldDestination,
    preference?: CraftPreference,
    sources?: CraftSources,
  ) => string | undefined;
  craftRepairEntity: (
    recipeId: string,
    entityUid: number,
    preference: CraftPreference,
    sources?: CraftSources,
  ) => string | undefined;
  /** Starts mending one damaged terrain cell, as work held in the dominant hand; the command revalidates the cell. */
  craftRepairCell: (
    recipeId: string,
    cell: [number, number, number],
    expected: Readonly<{ epoch: number }>,
    options: { prefer: CraftPreference; sources: CraftSources | undefined },
  ) => string | undefined;
  /** Starts taking a world piece apart where it stands, as work hosted on the piece. */
  craftTakeApartEntity: (entityUid: number) => string | undefined;
  /** Starts clearing the rubble cell aimed at, as work held in the dominant hand; the command revalidates the cell. */
  craftTakeApartCell: (
    cell: [number, number, number],
    expected: Readonly<{ block: string; epoch: number }>,
  ) => string | undefined;
  /** Starts removing or fitting one housing slot's part, as work hosted on the piece; the command revalidates. */
  craftServicePart: (entityUid: number, request: PartServiceRequest) => string | undefined;
  craftContinue: () => string | undefined;
  craftStop: () => string | undefined;
  wait: () => string | undefined;
  /** The hour of day a sleep wakes at with an alarm carried; undefined sleeps until rested. */
  setWakeGameHour: (gameHour: number | undefined) => void;
  cancelItemThrow: () => void;
  throwItem: (itemUid: number, hand: 'left' | 'right', distance: number) => void;
  cancelCast: () => void;
  /**
   * The same commit a live release runs at the player tick, so a replayed cast pays once as the live one did;
   * returns what the caster says when it is refused.
   */
  commitCast: (attempt: CastAttempt) => string | undefined;
}

const applyInventoryItemAction = (
  payload: Extract<ReplayActionPayload, { kind: 'inventory.activate' | 'inventory.wield-or-pocket' }>,
  owners: ReplayCommandOwners,
): string | undefined => {
  if (payload.kind === 'inventory.activate') {
    return owners.activate ? owners.activate(payload.itemUid) : 'Item activation is unavailable';
  }
  return owners.wieldOrPocket ? owners.wieldOrPocket(payload.itemUid, payload.feet) : 'Item handling is unavailable';
};

const applyPlacementCommand = (
  payload: Extract<ReplayActionPayload, { kind: 'craft.place' }>,
  owners: ReplayCommandOwners,
): string | undefined =>
  owners.craftPlace
    ? owners.craftPlace(payload.recipeId, payload.destination, payload.preference, payload.sources)
    : 'Missing world placement command';

const servicePartRequest = (
  payload: Extract<ReplayActionPayload, { kind: 'craft.service-part' }>,
): PartServiceRequest =>
  payload.operation === 'fit'
    ? { slot: payload.slot, operation: 'fit', itemUid: payload.itemUid }
    : { slot: payload.slot, operation: 'remove' };

export const applyReplayActionPayload = (
  payload: ReplayActionPayload,
  owners: ReplayCommandOwners,
): string | undefined => {
  switch (payload.kind) {
    case 'liquid.pour':
      return owners.pour?.(payload.sourceUid, payload.receiverUid);
    case 'inventory.move': {
      const item = owners.inventory.itemByUid(payload.itemUid);
      const target = owners.inventory.resolveTarget(payload.target);
      if (!(item && target)) {
        return actionText(owners.inventory.registry).common.gone;
      }
      const result = owners.queue.enqueue(item, target, payload.count);
      return result.ok ? undefined : result.reason;
    }
    case 'inventory.to-hands':
      return owners.toHands(payload.itemUid, payload.feet);
    case 'inventory.activate':
    case 'inventory.wield-or-pocket':
      return applyInventoryItemAction(payload, owners);
    case 'hand.action':
      return owners.handAction?.(payload.itemUid, payload.actionId);
    case 'inventory.inspect':
      owners.inspect?.(payload.itemUid);
      return undefined;
    case 'item.pickup':
      return owners.pickup(payload.itemUid, payload.mode, payload.feet);
    case 'furniture.interact':
      return owners.interact(payload.entityUid, payload.alternatives);
    case 'furniture.lift':
      return owners.lift(payload.entityUid, payload.floorLocked);
    case 'furniture.use':
      return owners.useFurniture(payload.entityUid);
    case 'furniture.slide':
      return owners.slide(payload.entityUid, payload.way);
    case 'furniture.place':
      return owners.place(payload.pos);
    case 'furniture.turn':
      return owners.turn();
    case 'furniture.tip':
      return owners.tip();
    case 'actor.downed':
      return owners.clearDownedBody(payload.actorId, payload.way);
    case 'power.set':
      return owners.power?.(payload.entityUid, payload.enabled);
    case 'charger.start':
    case 'charger.stop':
      return owners.charger?.(payload.entityUid, payload.kind === 'charger.start' ? 'start' : 'stop');
    case 'inventory.search':
      return owners.search(payload.entityUid);
    case 'inventory.work':
      return owners.work(payload.itemUid, payload.operation, payload);
    case 'inventory.assign': {
      const item = owners.inventory.carriedByUid(payload.itemUid);
      if (!item) {
        return actionText(owners.inventory.registry).common.notCarried;
      }
      owners.quickbar.assign(payload.slot, item);
      return undefined;
    }
    case 'firearm.attachment.fit':
      return owners.fitAttachment
        ? owners.fitAttachment(payload.firearmUid, payload.slotId, payload.attachmentUid)
        : 'Attachment handling is unavailable';
    case 'firearm.attachment.remove':
      return owners.removeAttachment
        ? owners.removeAttachment(payload.firearmUid, payload.slotId)
        : 'Attachment handling is unavailable';
    case 'vehicle.work':
      return owners.vehicleWork(
        payload.work,
        payload.vehicleId,
        { id: payload.fittingId, ...copyVehicleWorkPlacement(payload) },
        payload.itemUid,
      );
    case 'vehicle.part':
      return owners.operateVehiclePart(payload.vehicleId, payload.fittingId);
    case 'light.battery.load':
      return owners.loadBattery(payload.lightUid, payload.batteryUid);
    case 'light.battery.unload':
      return owners.unloadBattery(payload.lightUid, payload.target);
    case 'inventory.cancel-handling':
      owners.queue.cancel();
      return undefined;
    case 'craft.start':
      return owners.craftStart(payload.recipeId, payload.preference, payload.sources);
    case 'craft.place':
      return applyPlacementCommand(payload, owners);
    case 'craft.repair-entity':
      return owners.craftRepairEntity(payload.recipeId, payload.entityUid, payload.preference, payload.sources);
    case 'craft.repair-cell':
      return owners.craftRepairCell(payload.recipeId, payload.cell, payload.expected, {
        prefer: payload.preference,
        sources: payload.sources,
      });
    case 'craft.take-apart-entity':
      return owners.craftTakeApartEntity(payload.entityUid);
    case 'craft.take-apart-cell':
      return owners.craftTakeApartCell(payload.cell, payload.expected);
    case 'craft.service-part':
      return owners.craftServicePart(payload.entityUid, servicePartRequest(payload));
    case 'craft.continue':
      return owners.craftContinue();
    case 'craft.stop':
      return owners.craftStop();
    case 'action.wait':
      return owners.wait();
    case 'action.wake-hour':
      owners.setWakeGameHour(payload.gameHour ?? undefined);
      return undefined;
    case 'item.throw.cancel':
      owners.cancelItemThrow();
      return undefined;
    case 'item.throw':
      owners.throwItem(payload.itemUid, payload.hand, payload.distance);
      return undefined;
    case 'cast.cancel':
      owners.cancelCast();
      return undefined;
    case 'cast.commit':
      return owners.commitCast(castAttemptOf(payload));
    default: {
      const exhaustive: never = payload;
      return exhaustive;
    }
  }
};
