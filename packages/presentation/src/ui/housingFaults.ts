import type { Registry } from '@skelly/engine/content';
import { claimed } from '@skelly/engine/inventory';
import { fillText, percentText } from '@skelly/engine/text';
import type { BlockEntity, SitePower } from '@skelly/engine/world';

export interface HousingFault {
  readonly slot: string;
  readonly name: string;
  readonly label: string;
  readonly detail: string | undefined;
}

/** @internal */
export const minimumWorkingText = (registry: Registry, minimum: number | undefined): string | undefined =>
  minimum === undefined
    ? undefined
    : fillText(claimed(registry.ui, 'interface')!.screenText.housingFault.minimum, {
        minimum: percentText(minimum * 100),
      });

export const housingFaults = (
  registry: Registry,
  entity: BlockEntity,
  power: SitePower | undefined,
): HousingFault[] => {
  const definition = registry.furniture.get(entity.type)?.power;
  if (!definition?.instruments) {
    return [];
  }
  const text = claimed(registry.ui, 'interface')!.screenText.housingFault;
  return (power?.instruments(entity)?.failures ?? []).map(({ slot, cause }) => {
    const { minimum } = definition.requires!.find((requirement) => requirement.slot === slot)!;
    return {
      slot,
      name: definition!.instruments!.flags.find((flag) => flag.slot === slot)!.name,
      label: text[cause],
      detail: cause === 'insufficient' ? minimumWorkingText(registry, minimum) : undefined,
    };
  });
};
