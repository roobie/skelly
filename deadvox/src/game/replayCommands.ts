import type { WorkOperation } from '../core/craftCommands.ts';
import type { CraftPreference } from '../core/crafting.ts';
import type { HandlingQueue } from '../core/handling.ts';
import type { Inventory, TargetState } from '../core/inventory.ts';
import { QUICKBAR_SLOTS, type Quickbar } from './quickbar.ts';

export type ReplayActionPayload =
  | { kind: 'inventory.move'; itemUid: number; target: TargetState; count: number }
  | { kind: 'inventory.to-hands'; itemUid: number; feet: [number, number, number] }
  | { kind: 'inventory.search'; entityUid: number }
  | { kind: 'inventory.work'; itemUid: number; operation: WorkOperation }
  | { kind: 'inventory.assign'; slot: number; itemUid: number }
  | { kind: 'inventory.cancel-handling' }
  | { kind: 'firearm.attachment.fit'; firearmUid: number; slotId: string; attachmentUid: number }
  | { kind: 'firearm.attachment.remove'; firearmUid: number; slotId: string }
  | { kind: 'craft.start'; recipeId: string; preference?: CraftPreference }
  | { kind: 'craft.continue' }
  | { kind: 'craft.stop' }
  | { kind: 'glowstick.cancel' };

const isUid = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
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
      return (
        isUid(payload.itemUid) &&
        Array.isArray(payload.feet) &&
        payload.feet.length === 3 &&
        payload.feet.every(Number.isFinite)
      );
    case 'inventory.search':
      return isUid(payload.entityUid);
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
      return isUid(payload.firearmUid) && isUid(payload.attachmentUid) && typeof payload.slotId === 'string';
    case 'firearm.attachment.remove':
      return isUid(payload.firearmUid) && typeof payload.slotId === 'string';
    case 'inventory.cancel-handling':
    case 'craft.continue':
    case 'craft.stop':
    case 'glowstick.cancel':
      return Object.keys(payload).length === 1;
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
  inventory: Pick<Inventory, 'itemByUid' | 'resolveTarget'>;
  queue: Pick<HandlingQueue, 'enqueue' | 'cancel'>;
  quickbar: Pick<Quickbar, 'assign'>;
  search: (entityUid: number) => string | undefined;
  work: (itemUid: number, operation: WorkOperation) => string | undefined;
  fitAttachment?: (firearmUid: number, slotId: string, attachmentUid: number) => string | undefined;
  removeAttachment?: (firearmUid: number, slotId: string) => string | undefined;
  toHands: (itemUid: number, feet: [number, number, number]) => string | undefined;
  craftStart: (recipeId: string, preference?: CraftPreference) => string | undefined;
  craftContinue: () => string | undefined;
  craftStop: () => string | undefined;
  cancelGlowstick: () => void;
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
    case 'inventory.search':
      return owners.search(payload.entityUid);
    case 'inventory.work':
      return owners.work(payload.itemUid, payload.operation);
    case 'inventory.assign': {
      const item = owners.inventory.itemByUid(payload.itemUid);
      if (!item) {
        return 'The item is no longer available';
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
    case 'inventory.cancel-handling':
      owners.queue.cancel();
      return undefined;
    case 'craft.start':
      return owners.craftStart(payload.recipeId, payload.preference);
    case 'craft.continue':
      return owners.craftContinue();
    case 'craft.stop':
      return owners.craftStop();
    case 'glowstick.cancel':
      owners.cancelGlowstick();
      return undefined;
    default: {
      const exhaustive: never = payload;
      return exhaustive;
    }
  }
};
