import type { Registry } from './content.ts';
import type { Item } from './items.ts';
import type { LiquidContents } from './schema.ts';

export interface LiquidAmount {
  liquid: string;
  volumeMicrolitres: number;
}
export interface LiquidRecoveryChoices {
  receivers?: { liquid: string; uid: number }[];
  spillApproval?: LiquidAmount[];
}

export const validLiquidRecoveryChoices = (
  liquids: readonly LiquidAmount[],
  { receivers = [], spillApproval = [] }: LiquidRecoveryChoices,
): boolean => {
  const kinds = new Set(liquids.map(({ liquid }) => liquid));
  return (
    kinds.size === liquids.length &&
    liquids.every(({ volumeMicrolitres }) => Number.isSafeInteger(volumeMicrolitres) && volumeMicrolitres > 0) &&
    new Set(receivers.map(({ liquid }) => liquid)).size === receivers.length &&
    new Set(receivers.map(({ uid }) => uid)).size === receivers.length &&
    receivers.every(({ liquid, uid }) => kinds.has(liquid) && Number.isSafeInteger(uid) && uid > 0) &&
    new Set(spillApproval.map(({ liquid }) => liquid)).size === spillApproval.length &&
    spillApproval.every(
      ({ liquid, volumeMicrolitres }) =>
        kinds.has(liquid) && Number.isSafeInteger(volumeMicrolitres) && volumeMicrolitres >= 0,
    )
  );
};

export type LiquidTransferRefusal =
  | 'missing-endpoint'
  | 'same-endpoint'
  | 'not-vessel'
  | 'unserviceable'
  | 'invalid-contents'
  | 'invalid-limit'
  | 'empty-source'
  | 'incompatible-liquid'
  | 'full-receiver'
  | 'unreachable'
  | 'inaccessible'
  | 'short';

export type LiquidTransferPlan =
  | { ok: false; reason: LiquidTransferRefusal }
  | {
      ok: true;
      volumeMicrolitres: number;
      sourceContents: LiquidContents;
      receiverContents: LiquidContents;
    };

const validContents = (registry: Registry, item: Item): boolean => {
  const vessel = registry.items.get(item.type)?.vessel;
  const contents = item.liquidContents;
  return Boolean(
    vessel &&
      contents &&
      (contents.kind === 'empty' ||
        (registry.liquids.has(contents.liquid) &&
          vessel.accepts.includes(contents.liquid) &&
          Number.isSafeInteger(contents.volumeMicrolitres) &&
          contents.volumeMicrolitres > 0 &&
          contents.volumeMicrolitres <= vessel.capacityMicrolitres)),
  );
};

const serviceable = (item: Item): boolean => !item.on && item.condition > 0;
const validLimit = (limit: number | undefined): boolean =>
  limit === undefined || (Number.isSafeInteger(limit) && limit > 0);
const sameKind = (contents: LiquidContents, liquid: string): boolean =>
  contents.kind === 'empty' || contents.liquid === liquid;
const volumeOf = (contents: LiquidContents): number => (contents.kind === 'empty' ? 0 : contents.volumeMicrolitres);
export const vesselFillShare = (item: Item, vessel: { readonly capacityMicrolitres: number }): number =>
  (item.liquidContents ? volumeOf(item.liquidContents) : 0) / vessel.capacityMicrolitres;

const afterDebit = (contents: Extract<LiquidContents, { kind: 'filled' }>, remaining: number): LiquidContents =>
  remaining === 0 ? { kind: 'empty' } : { ...contents, volumeMicrolitres: remaining };

export type LiquidDrawPlan =
  | { ok: false; reason: LiquidTransferRefusal }
  | { ok: true; sourceContents: LiquidContents };

export const planLiquidDraw = (
  registry: Registry,
  source: Item | undefined,
  liquid: string,
  volumeMicrolitres: number,
): LiquidDrawPlan => {
  if (!source) {
    return { ok: false, reason: 'missing-endpoint' };
  }
  if (!registry.items.get(source.type)?.vessel) {
    return { ok: false, reason: 'not-vessel' };
  }
  if (!serviceable(source)) {
    return { ok: false, reason: 'unserviceable' };
  }
  if (!validContents(registry, source)) {
    return { ok: false, reason: 'invalid-contents' };
  }
  if (!Number.isSafeInteger(volumeMicrolitres) || volumeMicrolitres <= 0) {
    return { ok: false, reason: 'invalid-limit' };
  }
  const contents = source.liquidContents!;
  if (contents.kind === 'empty') {
    return { ok: false, reason: 'empty-source' };
  }
  if (contents.liquid !== liquid) {
    return { ok: false, reason: 'incompatible-liquid' };
  }
  if (contents.volumeMicrolitres < volumeMicrolitres) {
    return { ok: false, reason: 'short' };
  }
  return { ok: true, sourceContents: afterDebit(contents, contents.volumeMicrolitres - volumeMicrolitres) };
};

export type LiquidReceivePlan =
  | { ok: false; reason: LiquidTransferRefusal }
  | { ok: true; accepted: number; receiverContents: LiquidContents };

export const planLiquidReceive = (
  registry: Registry,
  receiver: Item | undefined,
  liquid: string,
  volumeMicrolitres: number,
): LiquidReceivePlan => {
  if (!receiver) {
    return { ok: false, reason: 'missing-endpoint' };
  }
  const vessel = registry.items.get(receiver.type)?.vessel;
  if (!vessel) {
    return { ok: false, reason: 'not-vessel' };
  }
  if (!serviceable(receiver)) {
    return { ok: false, reason: 'unserviceable' };
  }
  if (!validContents(registry, receiver)) {
    return { ok: false, reason: 'invalid-contents' };
  }
  if (!Number.isSafeInteger(volumeMicrolitres) || volumeMicrolitres <= 0) {
    return { ok: false, reason: 'invalid-limit' };
  }
  const contents = receiver.liquidContents!;
  if (!(registry.liquids.has(liquid) && vessel.accepts.includes(liquid) && sameKind(contents, liquid))) {
    return { ok: false, reason: 'incompatible-liquid' };
  }
  const volume = volumeOf(contents);
  const accepted = Math.min(volumeMicrolitres, vessel.capacityMicrolitres - volume);
  return {
    ok: true,
    accepted,
    receiverContents:
      accepted === 0 ? { ...contents } : { kind: 'filled', liquid, volumeMicrolitres: volume + accepted },
  };
};

export const planLiquidTransfer = (
  registry: Registry,
  source: Item | undefined,
  receiver: Item | undefined,
  limitMicrolitres?: number,
): LiquidTransferPlan => {
  if (!(source && receiver)) {
    return { ok: false, reason: 'missing-endpoint' };
  }
  if (source.uid === receiver.uid) {
    return { ok: false, reason: 'same-endpoint' };
  }
  const sourceVessel = registry.items.get(source.type)?.vessel;
  const receiverVessel = registry.items.get(receiver.type)?.vessel;
  if (!(sourceVessel && receiverVessel)) {
    return { ok: false, reason: 'not-vessel' };
  }
  if (!(serviceable(source) && serviceable(receiver))) {
    return { ok: false, reason: 'unserviceable' };
  }
  if (!(validContents(registry, source) && validContents(registry, receiver))) {
    return { ok: false, reason: 'invalid-contents' };
  }
  if (!validLimit(limitMicrolitres)) {
    return { ok: false, reason: 'invalid-limit' };
  }
  const contents = source.liquidContents!;
  const destination = receiver.liquidContents!;
  if (contents.kind === 'empty') {
    return { ok: false, reason: 'empty-source' };
  }
  if (!(receiverVessel.accepts.includes(contents.liquid) && sameKind(destination, contents.liquid))) {
    return { ok: false, reason: 'incompatible-liquid' };
  }
  const receiverVolume = volumeOf(destination);
  const room = receiverVessel.capacityMicrolitres - receiverVolume;
  if (room === 0) {
    return { ok: false, reason: 'full-receiver' };
  }
  const volumeMicrolitres = Math.min(contents.volumeMicrolitres, room, limitMicrolitres ?? contents.volumeMicrolitres);
  const remaining = contents.volumeMicrolitres - volumeMicrolitres;
  return {
    ok: true,
    volumeMicrolitres,
    sourceContents: afterDebit(contents, remaining),
    receiverContents: {
      kind: 'filled',
      liquid: contents.liquid,
      volumeMicrolitres: receiverVolume + volumeMicrolitres,
    },
  };
};
