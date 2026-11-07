// User-facing unsupported-item copy is presentation, not simulation/save identity.

import { claimed } from '../core/capabilities.ts';
import type { Registry } from '../core/content.ts';
import { defOf, type Item } from '../core/items.ts';
import { fillText } from '../core/textTemplate.ts';

export const primaryActionHint = (registry: Registry, item: Item): string =>
  fillText(claimed(registry.ui, 'interface')!.screenText.primaryAction.nothingToDo, {
    item: defOf(registry, item.type).name.toLowerCase(),
  });
