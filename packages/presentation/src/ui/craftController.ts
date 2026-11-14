// One screen owner retains browsing and review choices; the planner owns feasibility.
import type { ReplayActionPayload } from '@skelly/engine/input';
import {
  type AlternativeRef,
  type CraftPreference,
  type CraftSources,
  claimed,
  planCraft,
} from '@skelly/engine/inventory';
import type { Session } from '@skelly/engine/session';
import type { BlockEntity } from '@skelly/engine/world';
import { cataloguePage, categoryPath, craftCatalogue, initialCraftCatalogue } from './craftCatalogue.ts';
import { type CraftCatalogueView, type CraftPanelActions, renderCrafting } from './crafting.ts';
import { craftingText, craftRows } from './craftReadout.ts';

export const mountCraftPanel = (
  panel: HTMLElement,
  session: Pick<Session, 'inventory' | 'character' | 'reach'> & {
    crafting: Pick<Session['crafting'], 'startReason' | 'previewEntityRepair'>;
  },
  controls: {
    notice: (text: string) => void;
    dispatch: (payload: ReplayActionPayload) => string | undefined;
  },
) => {
  const preferences: Record<string, CraftPreference> = {};
  const sources: Record<string, CraftSources> = {};
  const state = initialCraftCatalogue();
  const { registry } = session.inventory;
  const text = craftingText(registry);
  const tuning = claimed(registry.ui, 'interface')!.crafting;
  let repairTarget: BlockEntity | undefined;
  let openGroup: number | undefined;
  let open = false;
  let revision = 0;
  let drawn = '';
  let lastReach: ReturnType<Session['reach']> | undefined;
  let catalogueKey = '';
  let catalogue: CraftCatalogueView | undefined;
  const dispatch = (payload: ReplayActionPayload): void => {
    const reason = controls.dispatch(payload);
    if (reason) {
      controls.notice(reason);
    }
  };
  const actions: CraftPanelActions = {
    start: (id) => {
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
    prefer: (id, group, item) => {
      const next = { ...preferences[id] };
      if (item) {
        next[group] = JSON.parse(item) as AlternativeRef;
      } else {
        Reflect.deleteProperty(next, group);
      }
      preferences[id] = next;
      revision += 1;
      refresh();
    },
    source: (id, group, uid) => {
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
      revision += 1;
      refresh();
    },
    browse: (change) => {
      if (change.selected !== undefined && change.selected !== state.selected) {
        openGroup = undefined;
      }
      Object.assign(state, change);
      refresh();
    },
    openGroup: (group) => {
      openGroup = group;
      revision += 1;
      refresh();
    },
    closeGroup: () => {
      const group = openGroup;
      openGroup = undefined;
      revision += 1;
      refresh();
      panel.querySelector<HTMLElement>(`[data-craft-group="${group}"]`)?.focus();
    },
  };
  const updateCatalogue = (reach: ReturnType<Session['reach']>, knowledge: string, skills: string): void => {
    const filterKey = JSON.stringify([state, knowledge, skills]);
    if (filterKey !== catalogueKey || (state.makeable && reach !== lastReach)) {
      const result = craftCatalogue(
        registry,
        session.character.knownRecipes,
        state,
        (recipe) => 'plan' in planCraft(recipe, reach, session.character),
      );
      if (state.selected === undefined || !session.character.knownRecipes.has(state.selected)) {
        state.selected = result.results[0]?.id;
      }
      const results = cataloguePage(result.results, state.page, tuning.pageSize);
      state.page = results.page;
      catalogue = {
        state,
        results,
        categories: cataloguePage(result.categories, state.categoryPage, tuning.facetPageSize),
        tags: cataloguePage(result.tags, state.tagPage, tuning.facetPageSize),
        categoryName: state.category
          ? categoryPath(registry, state.category)
              .map((id) => registry.recipeCategories.get(id)!.label)
              .join(' / ')
          : text.all,
        activeTags: state.tags.map((id) => ({ id, name: registry.recipeTags.get(id)!.label })),
      };
      catalogueKey = JSON.stringify([state, knowledge, skills]);
    }
  };
  const reviewOptions = () => ({
    text,
    ...(repairTarget ? { targetName: session.inventory.entities.defOf(repairTarget).name } : { catalogue: catalogue! }),
    ...(openGroup === undefined ? {} : { openGroup }),
  });
  const refresh = (): void => {
    if (!open) {
      return;
    }
    const reach = session.reach();
    const knowledge = [...session.character.knownRecipes].join('\0');
    const skills = JSON.stringify(session.character.skills);
    const key = JSON.stringify([state, knowledge, skills, revision, repairTarget?.uid, session.crafting.startReason()]);
    if (reach === lastReach && key === drawn) {
      return;
    }
    if (!repairTarget) {
      updateCatalogue(reach, knowledge, skills);
    }
    const recipeIds = state.selected ? [state.selected] : [];
    panel.setAttribute('aria-label', repairTarget ? session.inventory.entities.defOf(repairTarget).name : text.heading);
    renderCrafting(
      panel,
      craftRows({
        registry,
        character: session.character,
        reach,
        preferences,
        sources,
        startReason: session.crafting.startReason(),
        ...(repairTarget ? { entityRepair: { target: repairTarget, crafting: session.crafting } } : { recipeIds }),
      }),
      actions,
      reviewOptions(),
    );
    lastReach = reach;
    drawn = JSON.stringify([state, knowledge, skills, revision, repairTarget?.uid, session.crafting.startReason()]);
  };
  return {
    update: (isOpen: boolean, target?: BlockEntity) => {
      open = isOpen;
      if (target?.uid !== repairTarget?.uid) {
        openGroup = undefined;
        drawn = '';
      }
      repairTarget = open ? target : undefined;
      panel.hidden = !open;
      if (target && open) {
        panel.dataset.repairTarget = String(target.uid);
      } else {
        Reflect.deleteProperty(panel.dataset, 'repairTarget');
      }
      if (!open) {
        drawn = '';
      }
      refresh();
    },
  };
};
