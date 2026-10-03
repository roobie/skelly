// UI preferences/control adapter; completed readouts and Lit views live on the F7 side.
import type { CraftPreference } from '../core/crafting.ts';
import type { Session } from '../game/session.ts';
import { renderCrafting, renderCraftStatus } from './crafting.ts';
import { craftRows, craftStatus } from './craftReadout.ts';

export const mountCraftPanel = (
  panel: HTMLElement,
  statusRoot: HTMLElement,
  session: Session,
  controls: { notice: (text: string) => void; started: () => void; continue: () => void; stop: () => void },
) => {
  const preferences: Record<string, CraftPreference> = {};
  const actions = {
    start: (id: string) => {
      const reason = session.crafting.start(id, preferences[id]);
      if (reason) {
        controls.notice(reason);
      } else {
        controls.started();
      }
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
  return {
    update: (open: boolean) => {
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
      renderCraftStatus(
        statusRoot,
        craftStatus(session.inventory, session.sim.actions.job, session.sim.compression.interruption),
        controls,
      );
    },
  };
};
