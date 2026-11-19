import type { Registry } from '@skelly/engine/content';
import { claimed, housingBlueprint } from '@skelly/engine/inventory';
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

/** The slots keeping a housing from working, named by its blueprint whether or not it has an instruments look. */
export const housingFaults = (
  registry: Registry,
  entity: BlockEntity,
  power: SitePower | undefined,
): HousingFault[] => {
  const requires = registry.furniture.get(entity.type)?.power?.requires;
  const slots = housingBlueprint(registry, entity.type)?.slots;
  const text = claimed(registry.ui, 'interface')!.screenText.housingFault;
  return (power?.instruments(entity)?.failures ?? []).map(({ slot, cause }) => {
    const { minimum } = requires!.find((requirement) => requirement.slot === slot)!;
    return {
      slot,
      name: slots!.find(({ id }) => id === slot)!.name,
      label: text[cause],
      detail: cause === 'insufficient' ? minimumWorkingText(registry, minimum) : undefined,
    };
  });
};
