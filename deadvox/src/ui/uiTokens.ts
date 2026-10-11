import type { Registry } from '../core/content.ts';

const CORE_UI_ID = 'core';

/** Installs the base mod's UI tuning once, before game startup. */
export const applyUiTokens = (registry: Pick<Registry, 'ui'>, root: HTMLElement): void => {
  const tuning = registry.ui.get(CORE_UI_ID);
  if (!tuning) {
    throw new Error(`content does not define UI tuning "${CORE_UI_ID}"`);
  }
  root.style.setProperty('--ui-unit', `${tuning.spacingUnit}px`);
  root.style.setProperty('--ui-scale', String(tuning.hudScale));
};
