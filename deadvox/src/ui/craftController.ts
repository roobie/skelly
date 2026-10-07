// UI preferences/control adapter; completed readouts and Lit views live on the F7 side.

import type { ReplayActionPayload } from '../game/replayCommands.ts';
import type { Session } from '../game/session.ts';
import { renderCrafting, renderCraftStatus } from './crafting.ts';
import { craftRows, craftStatus } from './craftReadout.ts';

export const mountCraftPanel = (
  panel: HTMLElement,
  statusRoot: HTMLElement,
  session: Session,
  controls: {
    notice: (text: string) => void;
    dispatch: (payload: ReplayActionPayload) => string | undefined;
  },
) => {
  const preferences: Record<string, Readonly<Record<number, string>>> = {};
  const dispatch = (payload: ReplayActionPayload): void => {
    const reason = controls.dispatch(payload);
    if (reason) {
      controls.notice(reason);
    }
  };
  const actions = {
    start: (id: string) => {
      const preference = preferences[id];
      dispatch({ kind: 'craft.start', recipeId: id, ...(preference ? { preference } : {}) });
    },
    prefer: (id: string, group: number, item: string) => {
      const next = { ...preferences[id] };
      if (item) {
        next[group] = item;
      } else {
        Reflect.deleteProperty(next, group);
      }
      preferences[id] = next;
    },
  };
  const statusActions = {
    continue: () => dispatch({ kind: 'craft.continue' }),
    stop: () => dispatch({ kind: 'craft.stop' }),
  };
  return {
    update: (open: boolean, messagesVisible: boolean) => {
      panel.hidden = !open;
      if (open) {
        renderCrafting(
          panel,
          craftRows({
            registry: session.inventory.registry,
            character: session.character,
            reach: session.reach(),
            preferences,
            startReason: session.crafting.startReason(),
          }),
          actions,
        );
      }
      // The inventory has its own Continue action; keep this fixed status box off its controls.
      renderCraftStatus(
        statusRoot,
        open
          ? undefined
          : craftStatus(session.inventory, session.crafting.currentUid, session.sim.actions.job, {
              reason: session.sim.compression.interruption,
              messagesVisible,
            }),
        statusActions,
      );
    },
  };
};
