// A holder admits solid contents by form, not by item id (`packages/deadvox/DESIGN.md`, "The item model").

import type { ItemDef, Registry } from './content.ts';
import { defOf, type Item } from './items.ts';

export type Holder = NonNullable<NonNullable<ItemDef['container']>['holds']>;

/** Why a holder cannot take an item beside what it already holds; capacity stays the container's own limit. */
export type HolderRefusal = { kind: 'form' } | { kind: 'otherKind'; holding: string };

export const holderRefusal = (
  registry: Registry,
  holds: Holder,
  incoming: Pick<Item, 'type'>,
  inside: readonly Pick<Item, 'type'>[],
): HolderRefusal | undefined => {
  const { form } = defOf(registry, incoming.type);
  if (form === undefined || !holds.forms.includes(form)) {
    return { kind: 'form' };
  }
  const other = holds.oneKind ? inside.find((held) => held.type !== incoming.type) : undefined;
  return other ? { kind: 'otherKind', holding: other.type } : undefined;
};

/** Whether a container's content could ever take this item type, for checks made before any instance exists. */
export const admitsType = (container: NonNullable<ItemDef['container']>, item: ItemDef): boolean => {
  if (container.holds) {
    return item.form !== undefined && container.holds.forms.includes(item.form);
  }
  return !container.accepts || container.accepts.includes(item.id);
};
