import { batteryCapacityMicrojoules, batteryEnergy } from '../core/battery.ts';
import type { BlockEntity } from '../core/blockEntities.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { ReachSnapshot } from '../core/reach.ts';
import type { FurnitureDef, ScreenText } from '../core/schema.ts';
import type { SitePower } from '../core/sitePower.ts';
import { fillText } from '../core/textTemplate.ts';
import type { ReplayActionPayload } from '../game/replayCommands.ts';

export interface ChargerPanel {
  /** Meta: an opened surface makes service and remaining powered work inspectable without a permanent HUD. */
  readonly kind: 'meta';
  readonly status: string;
  readonly remaining?: string;
  readonly actions: readonly { label: string; payload: ReplayActionPayload }[];
}

const loadActions = (
  entity: BlockEntity,
  spec: NonNullable<FurnitureDef['charger']>,
  reach: ReachSnapshot,
  text: ScreenText['charger'],
): ChargerPanel['actions'] => {
  const { inventory } = reach.player;
  return reach.entries
    .filter(({ item }) => spec.batteries.includes(item.type))
    .map(({ item }) => ({
      label: fillText(text.load, { name: inventory.name(item) }),
      payload: {
        kind: 'inventory.move',
        itemUid: item.uid,
        count: 1,
        target: { kind: 'furniture', entityUid: entity.uid, pocket: spec.pocket },
      },
    }));
};

export const chargerPanel = (
  entity: BlockEntity,
  power: SitePower | undefined,
  reach: ReachSnapshot,
): ChargerPanel | undefined => {
  const id = power?.chargerId(entity);
  const { inventory } = reach.player;
  const spec = inventory.entities.defOf(entity).charger;
  if (!(id && power?.chargers && spec && entity.searched)) {
    return undefined;
  }
  const text = inventory.registry.ui.get(CORE_CONTENT_IDS.coreUi)!.screenText.charger;
  const battery = entity.pockets?.[spec.pocket]?.[0]?.item;
  const active = entity.charging !== undefined;
  const full =
    battery &&
    batteryEnergy(inventory.registry, battery) === batteryCapacityMicrojoules(inventory.registry, battery.type);
  const remaining = power.chargers.remainingGameMilliseconds(id);
  const actions: { label: string; payload: ReplayActionPayload }[] = [];
  if (active) {
    actions.push({ label: text.stop, payload: { kind: 'charger.stop', entityUid: entity.uid } });
  } else if (battery) {
    if (!full) {
      actions.push({ label: text.start, payload: { kind: 'charger.start', entityUid: entity.uid } });
    }
    actions.push({
      label: text.collect,
      payload: { kind: 'inventory.to-hands', itemUid: battery.uid, feet: reach.feet },
    });
  } else {
    actions.push(...loadActions(entity, spec, reach, text));
  }
  const workingStatus = power.network.isPowered(id) ? text.running : text.noPower;
  const idleStatus = full ? text.ready : text.idle;
  return {
    kind: 'meta',
    status: active ? workingStatus : idleStatus,
    ...(active && remaining !== undefined
      ? { remaining: fillText(text.remaining, { seconds: (remaining / 1000).toFixed(1) }) }
      : {}),
    actions,
  };
};
