// A holder admits solid contents by form, not by item id (`packages/deadvox/DESIGN.md`, "The item model").

import type { ItemDef, Registry } from './content.ts';
import { coreLabel } from './coreText.ts';
import { defOf, type Item } from './items.ts';
import { countText } from './numberText.ts';
import { fillText } from './textTemplate.ts';

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

/** A holder's contents while they are all one kind, which then names it, labels it and is what using it draws on. */
export const heldKind = (registry: Registry, item: Item): Item[] | undefined => {
  if (!defOf(registry, item.type).container?.holds) {
    return undefined;
  }
  const held = (item.pockets?.[0] ?? []).map(({ item: placed }) => placed);
  return held.length > 0 && held.every(({ type }) => type === held[0]!.type) ? held : undefined;
};

/** What using `item` draws on: one unit of a holder's one kind of contents, else the item itself. */
export const usedItem = (registry: Registry, item: Item): Item => heldKind(registry, item)?.[0] ?? item;

/** The name every line uses for an item; a holder of one kind names its contents, an emptied one its type. */
export const instanceName = (registry: Registry, item: Item): string => {
  const { name } = defOf(registry, item.type);
  const held = heldKind(registry, item);
  return held
    ? coreLabel(registry, 'holderOf', { container: name, contents: defOf(registry, held[0]!.type).name.toLowerCase() })
    : name;
};

/** How much a holder of one kind holds, in its contents' form. */
export const contentsLine = (registry: Registry, item: Item): string | undefined => {
  const held = heldKind(registry, item);
  if (!held) {
    return undefined;
  }
  const { countLine } = registry.forms.get(defOf(registry, held[0]!.type).form!)!;
  return fillText(countLine, { count: countText(held.reduce((total, { count }) => total + count, 0)) });
};
