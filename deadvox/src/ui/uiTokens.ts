import { CORE_UI_ID, type Registry } from '../core/content.ts';

/** Installs the base mod's UI tuning once, before game startup. */
export const applyUiTokens = (registry: Pick<Registry, 'ui'>, root: HTMLElement): void => {
  const tuning = registry.ui.get(CORE_UI_ID);
  if (!tuning) {
    throw new Error(`content does not define UI tuning "${CORE_UI_ID}"`);
  }
  root.style.setProperty('--ui-spacing', String(tuning.spacing));
  root.style.setProperty('--ui-scale', String(tuning.hudScale));
};
