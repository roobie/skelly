import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import type { Inventory } from '../core/inventory.ts';
import { conditionWord, type Item } from '../core/items.ts';
import type { ReachSnapshot } from '../core/reach.ts';
import { fillText } from '../core/textTemplate.ts';
import { vehicleSiteName } from '../core/vehicleInstances.ts';
import type { ReplayActionPayload } from '../game/replayCommands.ts';

export type VehicleWorkPayload = Extract<ReplayActionPayload, { kind: 'vehicle.work' }>;
type VehicleWorkKind = VehicleWorkPayload['work'];

export interface VehicleServiceAction {
  readonly label: string;
  readonly durationSimSeconds: number;
  /** Names the exact vehicle, site and part instances the player selected. */
  readonly payload: VehicleWorkPayload;
  /** Why the core refuses the work now; a refused action stays listed so its reason can be read. */
  readonly refusal: string | undefined;
}

interface VehicleInspectionSiteViewModel {
  readonly id: string;
  /** The fitted part: an ordinary item, so the screen shows its usual details. */
  readonly item: Item | undefined;
  readonly label: string;
  /** A serviceable site's content name, which tells paired parts apart while they are fitted. */
  readonly site: string | undefined;
  readonly condition: string | undefined;
  readonly actions: readonly VehicleServiceAction[];
  /** An empty service site with nothing in reach to fit says so instead of listing no actions. */
  readonly noPart: string | undefined;
}

export interface VehicleInspectionViewModel {
  readonly vehicleId: number;
  readonly name: string;
  readonly sites: readonly VehicleInspectionSiteViewModel[];
}

export interface VehicleInspectionSource {
  readonly inventory: Pick<Inventory, 'vehicles' | 'registry' | 'name'>;
  readonly reach: Pick<ReachSnapshot, 'entries'>;
  /** The core admission for one selected operation; see `src/game/session.ts`, `vehicleWorkRefusal`. */
  readonly refusal: (
    kind: VehicleWorkKind,
    vehicleId: number,
    fittingId: string,
    itemUid: number,
  ) => string | undefined;
}

/**
 * The opened vehicle's parts and service sites, read from the live build, including vacant sites.
 * Install candidates are the loose parts in reach whose content mount matches the site.
 */
export const vehicleInspectionViewModel = (
  { inventory, reach, refusal }: VehicleInspectionSource,
  vehicleId: number,
): VehicleInspectionViewModel | undefined => {
  const vehicle = inventory.vehicles.get(vehicleId);
  const blueprint = vehicle && inventory.registry.vehicleBlueprints.get(vehicle.blueprint);
  if (!(vehicle && blueprint)) {
    return undefined;
  }
  const text = inventory.registry.ui.get(CORE_CONTENT_IDS.coreUi)!.screenText.vehicle;
  const action = (
    work: VehicleWorkKind,
    label: string,
    { fittingId, item, durationSimSeconds }: { fittingId: string; item: Item; durationSimSeconds: number },
  ): VehicleServiceAction => ({
    label,
    durationSimSeconds,
    payload: { kind: 'vehicle.work', work, vehicleId, fittingId, itemUid: item.uid },
    refusal: refusal(work, vehicleId, fittingId, item.uid),
  });
  const sites: VehicleInspectionSiteViewModel[] = [];
  for (const site of vehicle.sites) {
    const fitted = vehicle.fittings.find(({ id }) => id === site.id)?.item;
    const { service } = site;
    const name = service && vehicleSiteName(inventory.registry, vehicle.blueprint, site.id);
    if (fitted) {
      sites.push({
        id: site.id,
        item: fitted,
        label: inventory.name(fitted),
        site: name,
        condition: conditionWord(inventory.registry, fitted.condition),
        actions: service
          ? [
              action('remove', text.remove, {
                fittingId: site.id,
                item: fitted,
                durationSimSeconds: service.durationSimSeconds,
              }),
            ]
          : [],
        noPart: undefined,
      });
      continue;
    }
    // A factory-absent site without service rules can't be worked on, so it isn't listed.
    if (!(service && name)) {
      continue;
    }
    const candidates = reach.entries
      .map(({ item }) => item)
      .filter((item) => inventory.registry.items.get(item.type)?.vehicle?.mount === service.mount);
    sites.push({
      id: site.id,
      item: undefined,
      label: fillText(text.empty, { site: name }),
      site: undefined,
      condition: undefined,
      actions: candidates.map((item) =>
        action('install', fillText(text.install, { part: inventory.name(item) }), {
          fittingId: site.id,
          item,
          durationSimSeconds: service.durationSimSeconds,
        }),
      ),
      noPart: candidates.length === 0 ? text.noPart : undefined,
    });
  }
  // Sites the player can work on lead; the stable sort keeps the build's order within each group.
  const serviceable = new Set(vehicle.sites.filter(({ service }) => service).map(({ id }) => id));
  sites.sort((a, b) => Number(serviceable.has(b.id)) - Number(serviceable.has(a.id)));
  return { vehicleId, name: blueprint.name, sites };
};
