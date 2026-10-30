import type { Registry } from './content.ts';
import type { Item } from './items.ts';
import type { LiquidContents } from './schema.ts';

type LiquidTransferRefusal =
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
  | 'inaccessible';

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
