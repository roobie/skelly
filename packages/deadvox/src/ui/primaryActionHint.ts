// User-facing unsupported-item copy is presentation, not simulation/save identity.

import type { Registry } from '../../../engine/src/content.ts';
import { claimed, defOf, type Item } from '../../../engine/src/inventory.ts';
import { fillText } from '../../../engine/src/text.ts';

export const primaryActionHint = (registry: Registry, item: Item): string =>
  fillText(claimed(registry.ui, 'interface')!.screenText.primaryAction.nothingToDo, {
    item: defOf(registry, item.type).name.toLowerCase(),
  });
