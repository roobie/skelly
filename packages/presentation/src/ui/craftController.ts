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
import { Group, type Matrix4, type Object3D, Vector3 } from 'three';
import { type ItemPictures, type ReferencePose, surfaceRect, viewCamera } from '../render/itemPictures.ts';
import type { Depiction } from '../render/plantInstruments.ts';
import { siteMarks, socketBoxes } from '../render/slotSockets.ts';
import { cataloguePage, categoryPath, craftCatalogue, initialCraftCatalogue } from './craftCatalogue.ts';
import { type CraftCatalogueView, type CraftPanelActions, type CraftPartsView, renderCrafting } from './crafting.ts';
import { type CraftRow, craftingText, craftRows, pieceWorkRow, takeApartRow } from './craftReadout.ts';
import type { WorldOperation } from './inventoryTabs.ts';
import type { WorkSite, WorkSiteProducer } from './workSite.ts';

const RADIANS_PER_DEGREE = Math.PI / 180;
/** A piece's front in its own frame (`packages/engine/src/core/orientation.ts`, `Tip`). */
const OWN_FRONT = new Vector3(0, 0, -1);

/** The view yaw that looks straight at the target's front, as `frame` stands it in its depiction's frame. */
const frontYaw = (frame: Matrix4): number => {
  const front = OWN_FRONT.clone().transformDirection(frame);
  return Math.atan2(front.x, front.z);
};

/** Draws the pinned piece with the item pictures' renderer and reference lighting. */
interface TargetView {
  pictures: Pick<ItemPictures, 'view'>;
  /** A fresh depiction per draw, disposed once drawn. */
  depiction: (entity: BlockEntity) => Depiction;
  /**
   * Where the target's own frame, in which its sites' anchors stand, lies in the frame its depiction stands in. The
   * view opens on the front that frame turns.
   */
  frame: (entity: BlockEntity) => Matrix4;
}

export const mountCraftPanel = (
  panel: HTMLElement,
  session: Pick<Session, 'inventory' | 'character' | 'reach'> & {
    crafting: Pick<
      Session['crafting'],
      | 'startReason'
      | 'previewEntityRepair'
      | 'previewTakeApartEntity'
      | 'previewPieceWork'
      | 'previewCellRepair'
      | 'previewTakeApartCell'
    >;
  },
  controls: {
    notice: (text: string) => void;
    dispatch: (payload: ReplayActionPayload) => string | undefined;
    sites: WorkSiteProducer;
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
  const { itemViewer: viewTuning, siteMark } = claimed(registry.graphics, 'graphics')!;
  let world: { target: BlockEntity; operation: WorldOperation } | undefined;
  let cellWorld: import('./cellWork.ts').CellWorldWork | undefined;
  const targetName = () => {
    if (cellWorld) {
      return registry.blocks[registry.blockIds.get(cellWorld.block)!]!.name;
    }
    return world ? session.inventory.entities.defOf(world.target).name : text.heading;
  };
  /** Turn steps applied to the pinned target's view; a new target starts at the opening pose. */
  let turns = 0;
  let openGroup: number | undefined;
  /** The site the parts review shows; a first open sets it, then only the player's pick moves it. */
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
  const startPayload = (id: string): ReplayActionPayload | undefined => {
    if (cellWorld?.operation === 'take_apart') {
      return {
        kind: 'craft.take-apart-cell',
        cell: cellWorld.cell,
        expected: { block: cellWorld.block, epoch: cellWorld.epoch },
      };
    }
    if (cellWorld) {
      return {
        kind: 'craft.repair-cell',
        recipeId: id,
        cell: cellWorld.cell,
        expected: { epoch: cellWorld.epoch },
        preference: preferences[id] ?? {},
        ...(sources[id] ? { sources: sources[id] } : {}),
      };
    }
    if (world) {
      return worldStart(world, id);
    }
    return {
      kind: 'craft.start',
      recipeId: id,
      ...(preferences[id] ? { preference: preferences[id] } : {}),
      ...(sources[id] ? { sources: sources[id] } : {}),
    };
  };
  const actions: CraftPanelActions = {
    start: (id) => dispatch(startPayload(id)),
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
    target?.operation === 'take_apart' && controls.sites.serves(target.target);
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
    const frame = controls.targetView.frame(world.target);
    const pose = {
      yaw: frontYaw(frame) + (viewTuning.startYawDegrees + turns * viewTuning.turnStepDegrees) * RADIANS_PER_DEGREE,
      pitch: viewTuning.startPitchDegrees * RADIANS_PER_DEGREE,
      framing: viewTuning.framing,
    };
    const sites = shownParts?.slots ?? [];
    const depiction = controls.targetView.depiction(world.target);
    const marks = siteMarks(sites, frame, siteMark);
    const model = new Group().add(depiction.model, marks.model);
    const image = controls.targetView.pictures.view(model, pose, width, height);
    const context = canvas.getContext('2d');
    if (image && context) {
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
    }
    placeSockets(sites, frame, { model, pose, canvas });
    depiction.dispose();
    marks.dispose();
  };
  /** Centres each anchored site's socket pick on its pick box, as the view just drawn shows it. */
  const placeSockets = (
    sites: readonly WorkSite[],
    frame: Matrix4,
    { model, pose, canvas }: { model: Object3D; pose: ReferencePose; canvas: HTMLCanvasElement },
  ): void => {
    const picks = panel.querySelectorAll<HTMLElement>('[data-craft-socket]');
    if (picks.length === 0) {
      return;
    }
    const camera = viewCamera(model, pose, canvas.width, canvas.height);
    const boxes = socketBoxes(sites, frame);
    for (const pick of picks) {
      const { corners } = boxes.find(({ site }) => site === pick.dataset.craftSocket)!;
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
  const reviewHeading = () => {
    if (cellWorld) {
      return fillText(cellWorld.operation === 'repair' ? text.repairName : text.takeApartName, { item: targetName() });
    }
    return fillText(headingOperation(world!), { item: targetName() });
  };
  const rowContext = () => {
    if (cellWorld) {
      return { cellRepair: { target: cellWorld, crafting: session.crafting } };
    }
    return world
      ? { entityRepair: { target: world.target, crafting: session.crafting } }
      : { recipeIds: state.selected ? [state.selected] : [], allKnown: state.allKnown };
  };
  const reviewOptions = () => ({
    text,
    ...(world || cellWorld
      ? {
          world: {
            heading: reviewHeading(),
            depicted: world !== undefined && controls.targetView !== undefined,
          },
        }
      : { catalogue: catalogue! }),
    ...(openGroup === undefined ? {} : { openGroup }),
  });
  const rows = (reach: ReturnType<Session['reach']>): CraftRow[] => {
    requests = new Map();
    if (cellWorld?.operation === 'take_apart') {
      return [takeApartRow(registry, cellWorld, session.crafting)];
    }
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
      ...rowContext(),
    });
  };
  /**
   * The service the shown slot commits: the pick, refreshed from its live service; a picked spare gone while the slot
   * still takes a fit, kept as last drawn but refused and no longer saying where it lay; otherwise the slot's first
   * service, as a finished service leaves nothing picked.
   */
  const shownService = (slot: WorkSite): { row: CraftRow; gone?: true } => {
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
   * A pinned model's review by its sites, with the command each service's Start sends. A first open shows the first
   * site needing attention, a faulted or an empty one, else the first site. A gone pick joins its site's services with
   * no command, so it reads refused where the player left it.
   */
  const partsView = (target: BlockEntity): CraftPartsView => {
    const slots = controls.sites.sites(target);
    requests = new Map(
      slots.flatMap(({ services }) =>
        services.flatMap(({ row, start }): [string, ReplayActionPayload][] => (start ? [[row.id, start]] : [])),
      ),
    );
    shownSlot ??= (slots.find((entry) => entry.fault !== undefined || entry.part === undefined) ?? slots[0]!).id;
    const listed = slots.find(({ id }) => id === shownSlot)!;
    const service = shownService(listed);
    const slot = service.gone
      ? { ...listed, services: [...listed.services, { row: service.row, start: undefined }] }
      : listed;
    return {
      slots: slots.map((entry) => (entry === listed ? slot : entry)),
      slot,
      service: service.row,
    };
  };
  /** The drawn surface, since the picture's backing size and the socket picks' pixel positions follow it. */
  const surface = () => {
    const canvas = panel.querySelector<HTMLCanvasElement>('.craft-target-canvas');
    return canvas && [canvas.clientWidth, canvas.clientHeight, globalThis.devicePixelRatio];
  };
  const drawKey = (knowledge: string, skills: string) =>
    JSON.stringify([
      state,
      knowledge,
      skills,
      revision,
      world?.target.uid,
      cellWorld,
      cellWorld &&
        (cellWorld.operation === 'repair'
          ? session.inventory.cellRepair?.state(cellWorld.cell)
          : session.crafting.previewTakeApartCell(cellWorld.cell)),
      world?.operation,
      world?.target.work?.work?.elapsed,
      session.crafting.startReason(),
      world && controls.sites.drawState(world.target),
      surface(),
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
    if (!(world || cellWorld)) {
      updateCatalogue(reach, knowledge, skills);
    }
    panel.setAttribute('aria-label', targetName());
    render(reach);
    drawTarget();
    if (focusStart && (world || cellWorld)) {
      focusStart = false;
      panel.querySelector<HTMLElement>('.craft-start')?.focus();
    }
    lastReach = reach;
    drawn = drawKey(knowledge, skills);
  };
  const updateWorldData = () => {
    if (world || cellWorld) {
      panel.dataset.worldTarget = cellWorld ? cellWorld.cell.join(',') : String(world!.target.uid);
      panel.dataset.worldOperation = cellWorld?.operation ?? world!.operation;
    } else {
      Reflect.deleteProperty(panel.dataset, 'worldTarget');
      Reflect.deleteProperty(panel.dataset, 'worldOperation');
    }
  };
  return {
    update: (
      isOpen: boolean,
      work?: { target: BlockEntity; operation: WorldOperation },
      cellWork?: import('./cellWork.ts').CellWorldWork,
    ) => {
      open = isOpen;
      if (cellWork !== cellWorld || work?.target.uid !== world?.target.uid || work?.operation !== world?.operation) {
        openGroup = undefined;
        shownSlot = undefined;
        pickedService = undefined;
        turns = 0;
        drawn = '';
        focusStart = open && (cellWork !== undefined || (work !== undefined && work.operation !== 'repair'));
      }
      world = open ? work : undefined;
      cellWorld = open ? cellWork : undefined;
      panel.hidden = !open;
      updateWorldData();
      if (!open) {
        drawn = '';
      }
      refresh();
    },
  };
};
