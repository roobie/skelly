import { claimed } from '../core/capabilities.ts';
import type { Registry } from '../core/content.ts';

/** Installs the base mod's UI tuning once, before game startup. */
export const applyUiTokens = (registry: Pick<Registry, 'ui'>, root: HTMLElement): void => {
  const tuning = claimed(registry.ui, 'interface');
  if (!tuning) {
    throw new Error('missing required capability "interface"');
  }
  root.style.setProperty('--ui-spacing', String(tuning.spacing));
  root.style.setProperty('--ui-scale', String(tuning.hudScale));
};
