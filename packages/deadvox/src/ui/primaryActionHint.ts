// User-facing unsupported-item copy is presentation, not simulation/save identity.

import type { Registry } from '@skelly/engine/content';
import { claimed, defOf, type Item } from '@skelly/engine/inventory';
import { fillText } from '@skelly/engine/text';

export const primaryActionHint = (registry: Registry, item: Item): string =>
  fillText(claimed(registry.ui, 'interface')!.screenText.primaryAction.nothingToDo, {
    item: defOf(registry, item.type).name.toLowerCase(),
  });
