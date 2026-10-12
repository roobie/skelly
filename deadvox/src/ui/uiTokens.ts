import type { Registry } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';

/** Installs the base mod's UI tuning once, before game startup. */
export const applyUiTokens = (registry: Pick<Registry, 'ui'>, root: HTMLElement): void => {
  const tuning = registry.ui.get(CORE_CONTENT_IDS.coreUi);
  if (!tuning) {
    throw new Error(`content does not define UI tuning "${CORE_CONTENT_IDS.coreUi}"`);
  }
  root.style.setProperty('--ui-spacing', String(tuning.spacing));
  root.style.setProperty('--ui-scale', String(tuning.hudScale));
};
