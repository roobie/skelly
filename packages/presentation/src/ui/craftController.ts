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
import type { Object3D, Vector3 } from 'three';
import { type ItemPictures, type ReferencePose, surfaceRect, viewCamera } from '../render/itemPictures.ts';
import { cataloguePage, categoryPath, craftCatalogue, initialCraftCatalogue } from './craftCatalogue.ts';
import { type CraftCatalogueView, type CraftPanelActions, type CraftPartsView, renderCrafting } from './crafting.ts';
import {
  type CraftRow,
  craftingText,
  craftRows,
  type PartSlot,
  partSlots,
  pieceWorkRow,
  takeApartRow,
} from './craftReadout.ts';
import { housingFaults } from './housingFaults.ts';
import type { WorldOperation } from './inventoryTabs.ts';

const RADIANS_PER_DEGREE = Math.PI / 180;

/** Draws the pinned piece with the item pictures' renderer and reference lighting. */
interface TargetView {
  pictures: Pick<ItemPictures, 'view'>;
  model: (entity: BlockEntity) => Object3D;
  /** Each slot anchor's pick box as world corners, in the frame `model` stands in; none for an anchorless housing. */
  sockets: (entity: BlockEntity) => readonly { readonly slot: string; readonly corners: readonly Vector3[] }[];
}

export const mountCraftPanel = (
  panel: HTMLElement,
  session: Pick<Session, 'inventory' | 'character' | 'reach' | 'power'> & {
    crafting: Pick<
      Session['crafting'],
      'startReason' | 'previewEntityRepair' | 'previewTakeApartEntity' | 'partServiceOptions' | 'previewPieceWork'
    >;
  },
  controls: {
    notice: (text: string) => void;
    dispatch: (payload: ReplayActionPayload) => string | undefined;
    /** Absent in render-free play. */
    targetView?: TargetView | undefined;
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
  /** The housing slot the parts review shows; a first open sets it, then only the player's pick moves it. */
  let shownSlot: string | undefined;
  /**
   * The shown slot's service the player picked, as last drawn; until a pick the commitment strip commits the slot's
   * first. A picked spare that leaves reach stays picked and refused, so Start never silently commits another spare.
   */
  let pickedService: CraftRow | undefined;
  /** The parts review the panel last drew, so a pick remembers the service the player chose. */
  let shownParts: CraftPartsView | undefined;
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
    selectSlot: (slot) => {
      if (slot !== shownSlot) {
        shownSlot = slot;
        pickedService = undefined;
      }
      revision += 1;
      refresh();
    },
    select: (id) => {
      pickedService = shownParts?.slot.services.find(({ row }) => row.id === id)?.row;
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
    const model = controls.targetView.model(world.target);
    const image = controls.targetView.pictures.view(model, pose, width, height);
    const context = canvas.getContext('2d');
    if (image && context) {
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
    }
    placeSockets(world.target, controls.targetView, { model, pose, canvas });
  };
  /** Centres each slot's socket pick on its anchor's pick box, as the view just drawn shows it. */
  const placeSockets = (
    target: BlockEntity,
    targetView: TargetView,
    { model, pose, canvas }: { model: Object3D; pose: ReferencePose; canvas: HTMLCanvasElement },
  ): void => {
    const picks = panel.querySelectorAll<HTMLElement>('[data-craft-socket]');
    if (picks.length === 0) {
      return;
    }
    const camera = viewCamera(model, pose, canvas.width, canvas.height);
    const boxes = targetView.sockets(target);
    for (const pick of picks) {
      const { corners } = boxes.find(({ slot }) => slot === pick.dataset.craftSocket)!;
      const rect = surfaceRect(camera, corners, canvas.clientWidth, canvas.clientHeight);
      pick.style.left = `${rect.left + rect.width / 2}px`;
      pick.style.top = `${rect.top + rect.height / 2}px`;
      pick.style.width = `${rect.width}px`;
      pick.style.height = `${rect.height}px`;
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
   * The service the shown slot commits: the pick, refreshed from its live service; a picked spare gone while the slot
   * still takes a fit, kept as last drawn but refused and no longer saying where it lay; otherwise the slot's first
   * service, as a finished service leaves nothing picked.
   */
  const shownService = (slot: PartSlot): { row: CraftRow; gone?: true } => {
    const picked = pickedService;
    const live = picked && slot.services.find(({ row }) => row.id === picked.id)?.row;
    if (live) {
      pickedService = live;
      return { row: live };
    }
    if (picked?.kind === 'fit_part' && slot.services.some(({ row }) => row.kind === 'fit_part')) {
      const { where: _gone, ...lastDrawn } = picked;
      return { row: { ...lastDrawn, reason: text.pickedSpareGone }, gone: true };
    }
    pickedService = undefined;
    return { row: slot.services[0]!.row };
  };
  /**
   * A pinned housing's review by its slots, with the command each service's Start sends. A first open shows the first
   * slot needing attention, a faulted or an empty one, else the first slot. A gone pick joins its slot's services with
   * no request, so it reads refused where the player left it.
   */
  const partsView = (target: BlockEntity): CraftPartsView => {
    const slots = partSlots(registry, target, {
      crafting: session.crafting,
      entities: session.inventory.entities,
      faults: housingFaults(registry, target, session.power),
    });
    const entityUid = target.uid;
    requests = new Map(
      slots.flatMap(({ services }) =>
        services.flatMap(({ row, request }) =>
          request
            ? [[row.id, { kind: 'craft.service-part', entityUid, ...request } satisfies ReplayActionPayload]]
            : [],
        ),
      ),
    );
    shownSlot ??= (slots.find((entry) => entry.fault !== undefined || entry.part === undefined) ?? slots[0]!).id;
    const listed = slots.find(({ id }) => id === shownSlot)!;
    const service = shownService(listed);
    const slot = service.gone
      ? { ...listed, services: [...listed.services, { row: service.row, request: undefined }] }
      : listed;
    return {
      slots: slots.map((entry) => (entry === listed ? slot : entry)),
      slot,
      service: service.row,
      sockets: controls.targetView !== undefined && registry.furniture.get(target.type)!.slotAnchors !== undefined,
    };
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
  const render = (reach: ReturnType<Session['reach']>): void => {
    shownParts = world && servicesParts(world) ? partsView(world.target) : undefined;
    renderCrafting(panel, shownParts ? [] : rows(reach), actions, {
      ...reviewOptions(),
      ...(shownParts ? { parts: shownParts } : {}),
    });
  };
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
    render(reach);
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
        shownSlot = undefined;
        pickedService = undefined;
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
