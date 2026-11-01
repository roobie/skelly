// UI preferences/control adapter; completed readouts and Lit views live on the F7 side.

import type { BlockEntity } from '../core/blockEntities.ts';
import type { AlternativeRef, CraftPreference, CraftSources } from '../core/crafting.ts';
import type { ReplayActionPayload } from '../game/replayCommands.ts';
import type { Session } from '../game/session.ts';
import { renderCrafting } from './crafting.ts';
import { craftingText, craftRows } from './craftReadout.ts';

export const mountCraftPanel = (
  panel: HTMLElement,
  session: Session,
  controls: {
    notice: (text: string) => void;
    dispatch: (payload: ReplayActionPayload) => string | undefined;
  },
) => {
  const preferences: Record<string, CraftPreference> = {};
  const sources: Record<string, CraftSources> = {};
  let repairTarget: BlockEntity | undefined;
  const dispatch = (payload: ReplayActionPayload): void => {
    const reason = controls.dispatch(payload);
    if (reason) {
      controls.notice(reason);
    }
  };
  const actions = {
    start: (id: string) => {
      const preference = preferences[id];
      dispatch(
        repairTarget
          ? {
              kind: 'craft.repair-entity',
              recipeId: id,
              entityUid: repairTarget.uid,
              preference: preference ?? {},
              ...(sources[id] ? { sources: sources[id] } : {}),
            }
          : {
              kind: 'craft.start',
              recipeId: id,
              ...(preference ? { preference } : {}),
              ...(sources[id] ? { sources: sources[id] } : {}),
            },
      );
    },
    prefer: (id: string, group: number, item: string) => {
      const next = { ...preferences[id] };
      if (item) {
        next[group] = JSON.parse(item) as AlternativeRef;
      } else {
        Reflect.deleteProperty(next, group);
      }
      preferences[id] = next;
    },
    source: (id: string, group: number, uid: number | undefined) => {
      const next = { ...sources[id] };
      if (uid === undefined) {
        if (next[group] === undefined) {
          next[group] = [];
        } else {
          Reflect.deleteProperty(next, group);
        }
      } else {
        const selected = next[group] ?? [];
        next[group] = selected.includes(uid) ? selected.filter((value) => value !== uid) : [...selected, uid];
      }
      sources[id] = next;
    },
  };
  return {
    update: (open: boolean, target?: BlockEntity) => {
      repairTarget = open ? target : undefined;
      panel.hidden = !open;
      if (target && open) {
        panel.dataset.repairTarget = String(target.uid);
      } else {
        Reflect.deleteProperty(panel.dataset, 'repairTarget');
      }
      if (open) {
        const text = craftingText(session.inventory.registry);
        panel.setAttribute('aria-label', target ? session.inventory.entities.defOf(target).name : text.heading);
        renderCrafting(
          panel,
          craftRows({
            registry: session.inventory.registry,
            character: session.character,
            reach: session.reach(),
            preferences,
            sources,
            startReason: session.crafting.startReason(),
            ...(target ? { entityRepair: { target, crafting: session.crafting } } : {}),
          }),
          actions,
          { text, ...(target ? { targetName: session.inventory.entities.defOf(target).name } : {}) },
        );
      }
    },
  };
};
