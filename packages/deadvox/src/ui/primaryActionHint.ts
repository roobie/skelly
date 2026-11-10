// User-facing unsupported-item copy is presentation, not simulation/save identity.

import type { Registry } from '../engine/content.ts';
import { claimed, defOf, type Item } from '../engine/inventory.ts';
import { fillText } from '../engine/text.ts';

export const primaryActionHint = (registry: Registry, item: Item): string =>
  fillText(claimed(registry.ui, 'interface')!.screenText.primaryAction.nothingToDo, {
    item: defOf(registry, item.type).name.toLowerCase(),
  });
