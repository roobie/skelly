// User-facing unsupported-item copy is presentation, not simulation/save identity.

import type { Registry } from '../core/content.ts';
import { defOf, type Item } from '../core/items.ts';

export const primaryActionHint = (registry: Registry, item: Item): string =>
  `Nothing to do with ${defOf(registry, item.type).name.toLowerCase()}`;
