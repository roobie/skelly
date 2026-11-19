// One screen owner retains browsing and review choices; the planner owns feasibility.
import type { ReplayActionPayload } from '@skelly/engine/input';
import {
  type AlternativeRef,
  type CraftPreference,
  type CraftSources,
  claimed,
  hasRepairTarget,
  planCraft,
} from '@skelly/engine/inventory';
import type { Session } from '@skelly/engine/session';
import { fillText } from '@skelly/engine/text';
import type { BlockEntity } from '@skelly/engine/world';
import type { Object3D } from 'three';
import type { ItemPictures } from '../render/itemPictures.ts';
import { cataloguePage, categoryPath, craftCatalogue, initialCraftCatalogue } from './craftCatalogue.ts';
import { type CraftCatalogueView, type CraftPanelActions, renderCrafting } from './crafting.ts';
import { type CraftRow, craftingText, craftRows, partServiceRows, pieceWorkRow, takeApartRow } from './craftReadout.ts';
import type { WorldOperation } from './inventoryTabs.ts';

const RADIANS_PER_DEGREE = Math.PI / 180;

export const mountCraftPanel = (
  panel: HTMLElement,
  session: Pick<Session, 'inventory' | 'character' | 'reach'> & {
    crafting: Pick<
      Session['crafting'],
      'startReason' | 'previewEntityRepair' | 'previewTakeApartEntity' | 'partServiceOptions' | 'previewPieceWork'
    >;
  },
  controls: {
    notice: (text: string) => void;
    dispatch: (payload: ReplayActionPayload) => string | undefined;
    /** Draws the pinned piece with the item pictures' renderer and reference lighting; absent in render-free play. */
    targetView?: { pictures: Pick<ItemPictures, 'view'>; model: (entity: BlockEntity) => Object3D } | undefined;
  },
) => {
  const preferences: Record<string, CraftPreference> = {};
  const sources: Record<string, CraftSources> = {};
  const state = initialCraftCatalogue();
  const { registry } = session.inventory;
  const text = craftingText(registry);
  const tuning = claimed(registry.ui, 'interface')!.crafting;
  const viewTuning = claimed(registry.graphics, 'graphics')!.itemViewer;
  let world: { target: BlockEntity; operation: WorldOperation } | undefined;
  /** Turn steps applied to the pinned target's view; a new target starts at the opening pose. */
  let turns = 0;
  let openGroup: number | undefined;
  /**
   * The part option the player picked, as last drawn; until a pick the commitment strip commits the first option. A
   * picked spare that leaves reach stays picked and refused, so Start never silently commits another spare.
   */
  let selectedOption: CraftRow | undefined;
  /** The rows the panel last drew, so a pick remembers the row the player chose. */
  let shownRows: readonly CraftRow[] = [];
  let open = false;
  let revision = 0;
  let drawn = '';
  /** A take-apart or Continue review just opened: its commitment is the one choice left, so focus lands on it. */
  let focusStart = false;
  let lastReach: ReturnType<Session['reach']> | undefined;
  let catalogueKey = '';
  let catalogue: CraftCatalogueView | undefined;
  /** The command behind each drawn row the engine projected, so Start sends what the player reviewed. */
  let requests = new Map<string, ReplayActionPayload>();
  /** The command behind a world review's Start; a parts service without a projected request sends nothing. */
  const worldStart = (
    work: { target: BlockEntity; operation: WorldOperation },
    id: string,
  ): ReplayActionPayload | undefined => {
    const request = requests.get(id);
    if (request || servicesParts(work)) {
      return request;
    }
    const { target, operation } = work;
    if (operation === 'take_apart') {
      return { kind: 'craft.take-apart-entity', entityUid: target.uid };
    }
    return {
      kind: 'craft.repair-entity',
      recipeId: id,
      entityUid: target.uid,
      preference: preferences[id] ?? {},
      ...(sources[id] ? { sources: sources[id] } : {}),
    };
  };
  const dispatch = (payload: ReplayActionPayload | undefined): void => {
    if (!payload) {
      return;
    }
    const reason = controls.dispatch(payload);
    if (reason) {
      controls.notice(reason);
    }
  };
  const actions: CraftPanelActions = {
    start: (id) => {
      const preference = preferences[id];
      dispatch(
        world
          ? worldStart(world, id)
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
    turn: (step) => {
      turns += step;
      drawTarget();
    },
    select: (id) => {
      selectedOption = shownRows.find((row) => row.id === id);
      revision += 1;
      refresh();
    },
  };
  /** Whether the pinned piece's take apart offers its parts as options of one review. */
  const servicesParts = (target: { target: BlockEntity; operation: WorldOperation } | undefined) =>
    target?.operation === 'take_apart' && registry.furniture.get(target.target.type)?.takeApart?.parts !== undefined;
  const drawTarget = (): void => {
    const canvas = panel.querySelector<HTMLCanvasElement>('.craft-target-canvas');
    if (!(world && controls.targetView && canvas)) {
      return;
    }
    const scale = globalThis.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * scale));
    const height = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const pose = {
      yaw: (viewTuning.startYawDegrees + turns * viewTuning.turnStepDegrees) * RADIANS_PER_DEGREE,
      pitch: viewTuning.startPitchDegrees * RADIANS_PER_DEGREE,
      framing: viewTuning.framing,
    };
    const image = controls.targetView.pictures.view(controls.targetView.model(world.target), pose, width, height);
    const context = canvas.getContext('2d');
    if (image && context) {
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
    }
  };
  const updateCatalogue = (reach: ReturnType<Session['reach']>, knowledge: string, skills: string): void => {
    const filterKey = JSON.stringify([state, knowledge, skills]);
    if (filterKey !== catalogueKey || reach !== lastReach) {
      const result = craftCatalogue(registry, session.character.knownRecipes, state, {
        makeable: (recipe) => 'plan' in planCraft(recipe, reach, session.character),
        hasTarget: (recipe) => hasRepairTarget(registry, reach, recipe),
      });
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
  /** The pinned operation as the heading names it; a continued job is the repair or take apart that began it. */
  const headingOperation = ({ target, operation }: { target: BlockEntity; operation: WorldOperation }) => {
    if (operation === 'continue') {
      return target.work?.work?.kind === 'craft' ? text.repairName : text.takeApartName;
    }
    return operation === 'take_apart' ? text.takeApartName : text.repairName;
  };
  const reviewOptions = () => ({
    text,
    ...(world
      ? {
          world: {
            heading: fillText(headingOperation(world), {
              item: session.inventory.entities.defOf(world.target).name,
            }),
            depicted: controls.targetView !== undefined,
          },
        }
      : { catalogue: catalogue! }),
    ...(openGroup === undefined ? {} : { openGroup }),
  });
  const rows = (reach: ReturnType<Session['reach']>): CraftRow[] => {
    requests = new Map();
    if (world?.operation === 'continue') {
      const owned = pieceWorkRow(registry, world.target, session.crafting);
      if (!owned) {
        return [];
      }
      requests.set(owned.row.id, { kind: 'inventory.work', itemUid: owned.workUid, operation: 'continue' });
      return [owned.row];
    }
    if (world && servicesParts(world)) {
      const entityUid = world.target.uid;
      const served = partServiceRows(registry, world.target, session.crafting);
      requests = new Map(
        served.flatMap(({ row, request }) =>
          request
            ? [[row.id, { kind: 'craft.service-part', entityUid, ...request } satisfies ReplayActionPayload]]
            : [],
        ),
      );
      return served.map(({ row }) => row);
    }
    if (world?.operation === 'take_apart') {
      return [takeApartRow(registry, world.target, session.crafting)];
    }
    return craftRows({
      registry,
      character: session.character,
      reach,
      preferences,
      sources,
      startReason: session.crafting.startReason(),
      ...(world
        ? { entityRepair: { target: world.target, crafting: session.crafting } }
        : { recipeIds: state.selected ? [state.selected] : [], allKnown: state.allKnown }),
    });
  };
  /**
   * The part options as drawn and the one selected: the pick, refreshed from its live row; a picked spare gone while its
   * slot still takes a fit, kept as last drawn but refused, with no request and no longer saying where it lay; otherwise
   * the first option, as a finished service leaves nothing picked.
   */
  const optionSelection = (drawnRows: CraftRow[]): { rows: CraftRow[]; selected?: string } => {
    if (!servicesParts(world)) {
      return { rows: drawnRows };
    }
    const picked = selectedOption;
    const stillFits =
      picked?.kind === 'fit_part' &&
      drawnRows.some((row) => row.kind === 'fit_part' && row.part?.slot === picked.part?.slot);
    if (picked && !stillFits && !drawnRows.some((row) => row.id === picked.id)) {
      selectedOption = undefined;
    }
    if (!selectedOption) {
      const [first] = drawnRows;
      return first ? { rows: drawnRows, selected: first.id } : { rows: drawnRows };
    }
    const { id } = selectedOption;
    const live = drawnRows.find((row) => row.id === id);
    if (live) {
      selectedOption = live;
      return { rows: drawnRows, selected: id };
    }
    const { where: _gone, ...lastDrawn } = selectedOption;
    return { rows: [...drawnRows, { ...lastDrawn, reason: text.pickedSpareGone }], selected: id };
  };
  const drawKey = (knowledge: string, skills: string) =>
    JSON.stringify([
      state,
      knowledge,
      skills,
      revision,
      world?.target.uid,
      world?.operation,
      world?.target.work?.work?.elapsed,
      session.crafting.startReason(),
    ]);
  const refresh = (): void => {
    if (!open) {
      return;
    }
    const reach = session.reach();
    const knowledge = [...session.character.knownRecipes].join('\0');
    const skills = JSON.stringify(session.character.skills);
    if (reach === lastReach && drawKey(knowledge, skills) === drawn) {
      return;
    }
    if (!world) {
      updateCatalogue(reach, knowledge, skills);
    }
    panel.setAttribute('aria-label', world ? session.inventory.entities.defOf(world.target).name : text.heading);
    const { rows: options, ...selection } = optionSelection(rows(reach));
    shownRows = options;
    renderCrafting(panel, options, actions, { ...reviewOptions(), ...selection });
    drawTarget();
    if (focusStart && world && world.operation !== 'repair') {
      focusStart = false;
      panel.querySelector<HTMLElement>('.craft-start')?.focus();
    }
    lastReach = reach;
    drawn = drawKey(knowledge, skills);
  };
  return {
    update: (isOpen: boolean, work?: { target: BlockEntity; operation: WorldOperation }) => {
      open = isOpen;
      if (work?.target.uid !== world?.target.uid || work?.operation !== world?.operation) {
        openGroup = undefined;
        selectedOption = undefined;
        turns = 0;
        drawn = '';
        focusStart = open && work !== undefined && work.operation !== 'repair';
      }
      world = open ? work : undefined;
      panel.hidden = !open;
      if (work && open) {
        panel.dataset.worldTarget = String(work.target.uid);
        panel.dataset.worldOperation = work.operation;
      } else {
        Reflect.deleteProperty(panel.dataset, 'worldTarget');
        Reflect.deleteProperty(panel.dataset, 'worldOperation');
      }
      if (!open) {
        drawn = '';
      }
      refresh();
    },
  };
};
