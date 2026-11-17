// Innate attribute values, which characters and creature bodies both hold and save.

import type { Registry } from './content.ts';
import { ATTRIBUTE_AVERAGE } from './modifiers.ts';

/** Innate values for every attribute the content defines, average unless given. */
export const innateAttributes = (
  registry: Registry,
  values: Readonly<Record<string, number>> = {},
): Record<string, number> =>
  Object.fromEntries([...registry.attributes.keys()].map((id) => [id, values[id] ?? ATTRIBUTE_AVERAGE]));

const validAttribute = (value: number | undefined): boolean =>
  value !== undefined && Number.isFinite(value) && value > 0;

/** Whether values name an attribute the content defines, each on the scale. */
export const knownAttributes = (registry: Registry, values: Readonly<Record<string, number>>): boolean =>
  Object.entries(values).every(([id, value]) => registry.attributes.has(id) && validAttribute(value));

/** Whether saved values cover exactly the attributes the content defines, each on the scale. */
export const savedAttributesMatch = (registry: Registry, values: Readonly<Record<string, number>>): boolean =>
  Object.keys(values).length === registry.attributes.size && knownAttributes(registry, values);
