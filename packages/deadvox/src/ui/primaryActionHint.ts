// User-facing unsupported-item copy is presentation, not simulation/save identity.

import type { Registry } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import { defOf, type Item } from '../core/items.ts';
import { fillText } from '../core/textTemplate.ts';

export const primaryActionHint = (registry: Registry, item: Item): string =>
  fillText(registry.ui.get(CORE_CONTENT_IDS.coreUi)!.screenText.primaryAction.nothingToDo, {
    item: defOf(registry, item.type).name.toLowerCase(),
  });
