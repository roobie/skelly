import type { WorkOperation } from '../core/craftCommands.ts';
import type { CraftPreference } from '../core/crafting.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory, TargetState } from '../core/inventory.ts';
import { type DownedBodyWay, isDownedBodyWay } from './downedBody.ts';
import { QUICKBAR_SLOTS, type Quickbar } from './quickbar.ts';

export type ReplayActionPayload =
  | { kind: 'inventory.move'; itemUid: number; target: TargetState; count: number }
  | { kind: 'inventory.to-hands'; itemUid: number; feet: [number, number, number] }
  | { kind: 'item.pickup'; itemUid: number; mode: 'pocket' | 'wield'; feet: [number, number, number] }
  | { kind: 'furniture.interact'; entityUid: number }
  | { kind: 'furniture.lift'; entityUid: number }
  | { kind: 'furniture.use'; entityUid: number }
  | { kind: 'furniture.slide'; entityUid: number; way: 'push' | 'drag' }
  | { kind: 'furniture.place'; pos: [number, number, number] }
  | { kind: 'charger.start'; entityUid: number }
  | { kind: 'charger.stop'; entityUid: number }
  | { kind: 'furniture.turn' }
  | { kind: 'furniture.tip' }
  | { kind: 'zombie.downed'; zombieId: number; way: DownedBodyWay }
  | { kind: 'inventory.search'; entityUid: number }
  | { kind: 'inventory.work'; itemUid: number; operation: WorkOperation }
  | { kind: 'inventory.assign'; slot: number; itemUid: number }
  | { kind: 'inventory.cancel-handling' }
  | { kind: 'firearm.attachment.fit'; firearmUid: number; slotId: string; attachmentUid: number }
  | { kind: 'firearm.attachment.remove'; firearmUid: number; slotId: string }
  | { kind: 'vehicle.work'; work: 'install' | 'remove'; vehicleId: number; fittingId: string; itemUid: number }
  | { kind: 'craft.start'; recipeId: string; preference?: CraftPreference }
  | { kind: 'craft.continue' }
  | { kind: 'craft.stop' }
  | { kind: 'action.wait' }
  | { kind: 'action.wake-hour'; gameHour: number | null }
  | { kind: 'item.throw.cancel' }
  | { kind: 'item.throw'; itemUid: number; hand: 'left' | 'right'; distance: number };

const isUid = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const isTriple = (value: unknown, isPart: (part: unknown) => boolean = Number.isFinite): boolean =>
  Array.isArray(value) && value.length === 3 && value.every(isPart);
const isSpot = (value: unknown): boolean =>
  Boolean(value) &&
  typeof value === 'object' &&
  Number.isSafeInteger((value as { x?: unknown }).x) &&
  Number.isSafeInteger((value as { y?: unknown }).y) &&
  typeof (value as { rotated?: unknown }).rotated === 'boolean';
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
        (target.at === undefined || isSpot(target.at))
      );
    case 'pile':
      return (
        Array.isArray(target.pos) &&
        target.pos.length === 3 &&
        target.pos.every(Number.isFinite) &&
        (target.at === undefined || isSpot(target.at))
      );
    case 'furniture':
      return (
        isUid(target.entityUid) &&
        Number.isSafeInteger(target.pocket) &&
        (target.pocket as number) >= 0 &&
        (target.at === undefined || isSpot(target.at))
      );
    default:
      return false;
  }
};

const isAttachmentPayload = (payload: Record<string, unknown>): boolean =>
  isUid(payload.firearmUid) &&
  typeof payload.slotId === 'string' &&
  (payload.kind !== 'firearm.attachment.fit' || isUid(payload.attachmentUid));

const isSlidePayload = (payload: Record<string, unknown>): boolean =>
  isUid(payload.entityUid) && (payload.way === 'push' || payload.way === 'drag');

const isVehicleWorkPayload = (payload: Record<string, unknown>): boolean =>
  (payload.work === 'install' || payload.work === 'remove') &&
  isUid(payload.vehicleId) &&
  typeof payload.fittingId === 'string' &&
  payload.fittingId !== '' &&
  isUid(payload.itemUid);

/** An hour of the day, or null to sleep until rested. */
const isWakeGameHour = (value: unknown): boolean =>
  value === null || (Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < 24);

export const isReplayActionPayload = (value: unknown): value is ReplayActionPayload => {
  if (!(value && typeof value === 'object' && !Array.isArray(value))) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  switch (payload.kind) {
    case 'inventory.move':
      return (
        isUid(payload.itemUid) &&
        isTargetState(payload.target) &&
        Number.isSafeInteger(payload.count) &&
        (payload.count as number) > 0
      );
    case 'inventory.to-hands':
      return isUid(payload.itemUid) && isTriple(payload.feet);
    case 'charger.start':
    case 'charger.stop':
    case 'inventory.search':
    case 'furniture.interact':
    case 'furniture.lift':
    case 'furniture.use':
      return isUid(payload.entityUid);
    case 'furniture.slide':
      return isSlidePayload(payload);
    case 'furniture.place':
      return isTriple(payload.pos, Number.isSafeInteger);
    case 'zombie.downed':
      return isUid(payload.zombieId) && isDownedBodyWay(payload.way);
    case 'item.pickup':
      return (
        isUid(payload.itemUid) && (payload.mode === 'pocket' || payload.mode === 'wield') && isTriple(payload.feet)
      );
    case 'inventory.work':
      return isUid(payload.itemUid) && ['continue', 'apart', 'disassemble'].includes(payload.operation as string);
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
    case 'inventory.cancel-handling':
    case 'furniture.turn':
    case 'furniture.tip':
    case 'craft.continue':
    case 'craft.stop':
    case 'action.wait':
    case 'item.throw.cancel':
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
    case 'craft.start':
      return (
        typeof payload.recipeId === 'string' &&
        (payload.preference === undefined ||
          (payload.preference !== null &&
            typeof payload.preference === 'object' &&
            !Array.isArray(payload.preference) &&
            Object.entries(payload.preference).every(
              ([group, item]) => Number.isSafeInteger(Number(group)) && Number(group) >= 0 && typeof item === 'string',
            )))
      );
    default:
      return false;
  }
};

export interface ReplayCommandOwners {
  inventory: Pick<Inventory, 'itemByUid' | 'carriedByUid' | 'resolveTarget'>;
  queue: Pick<HandlingQueue, 'enqueue' | 'cancel'>;
  quickbar: Pick<Quickbar, 'assign'>;
  search: (entityUid: number) => string | undefined;
  charger?: (entityUid: number, operation: 'start' | 'stop') => string | undefined;
  work: (itemUid: number, operation: WorkOperation) => string | undefined;
  fitAttachment?: (firearmUid: number, slotId: string, attachmentUid: number) => string | undefined;
  removeAttachment?: (firearmUid: number, slotId: string) => string | undefined;
  vehicleWork: (
    work: 'install' | 'remove',
    vehicleId: number,
    fittingId: string,
    itemUid: number,
  ) => string | undefined;
  toHands: (itemUid: number, feet: [number, number, number]) => string | undefined;
  pickup: (itemUid: number, mode: 'pocket' | 'wield', feet: [number, number, number]) => string | undefined;
  interact: (entityUid: number) => string | undefined;
  lift: (entityUid: number) => string | undefined;
  useFurniture: (entityUid: number) => string | undefined;
  slide: (entityUid: number, way: 'push' | 'drag') => string | undefined;
  /** Sets the carried piece down at the aimed cell. */
  place: (pos: [number, number, number]) => string | undefined;
  /** Turns the carried piece a quarter, seen from above. */
  turn: () => string | undefined;
  /** Tips the carried piece onto its next face. */
  tip: () => string | undefined;
  clearDownedBody: (zombieId: number, way: DownedBodyWay) => string | undefined;
  craftStart: (recipeId: string, preference?: CraftPreference) => string | undefined;
  craftContinue: () => string | undefined;
  craftStop: () => string | undefined;
  wait: () => string | undefined;
  /** The hour of day a sleep wakes at with an alarm carried; undefined sleeps until rested. */
  setWakeGameHour: (gameHour: number | undefined) => void;
  cancelItemThrow: () => void;
  throwItem: (itemUid: number, hand: 'left' | 'right', distance: number) => void;
}

export const applyReplayActionPayload = (
  payload: ReplayActionPayload,
  owners: ReplayCommandOwners,
): string | undefined => {
  switch (payload.kind) {
    case 'inventory.move': {
      const item = owners.inventory.itemByUid(payload.itemUid);
      const target = owners.inventory.resolveTarget(payload.target);
      if (!(item && target)) {
        return 'The item or destination is no longer available';
      }
      const result = owners.queue.enqueue(item, target, payload.count);
      return result.ok ? undefined : result.reason;
    }
    case 'inventory.to-hands':
      return owners.toHands(payload.itemUid, payload.feet);
    case 'item.pickup':
      return owners.pickup(payload.itemUid, payload.mode, payload.feet);
    case 'furniture.interact':
      return owners.interact(payload.entityUid);
    case 'furniture.lift':
      return owners.lift(payload.entityUid);
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
    case 'zombie.downed':
      return owners.clearDownedBody(payload.zombieId, payload.way);
    case 'charger.start':
    case 'charger.stop':
      return owners.charger?.(payload.entityUid, payload.kind === 'charger.start' ? 'start' : 'stop');
    case 'inventory.search':
      return owners.search(payload.entityUid);
    case 'inventory.work':
      return owners.work(payload.itemUid, payload.operation);
    case 'inventory.assign': {
      const item = owners.inventory.carriedByUid(payload.itemUid);
      if (!item) {
        return "I'm not carrying that";
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
      return owners.vehicleWork(payload.work, payload.vehicleId, payload.fittingId, payload.itemUid);
    case 'inventory.cancel-handling':
      owners.queue.cancel();
      return undefined;
    case 'craft.start':
      return owners.craftStart(payload.recipeId, payload.preference);
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
    default: {
      const exhaustive: never = payload;
      return exhaustive;
    }
  }
};
