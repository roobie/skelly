import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Body } from '../src/core/body.ts';
import { Character, practiceForNextLevel, SKILL_LEVEL_LEGENDARY } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { WorkOperation, WorkOption } from '../src/core/craftCommands.ts';
import { planCraft } from '../src/core/crafting.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import { FirearmAttachmentHandling } from '../src/game/firearmAttachmentHandling.ts';
import {
  BindingRegistry,
  INPUT_BINDINGS,
  inputBindings,
  inventoryTabForAction,
  KeyboardInput,
  keyboardInput,
} from '../src/game/inputBindings.ts';
import { routeModalCommand } from '../src/game/modalCommand.ts';
import { applyReplayActionPayload, type ReplayActionPayload } from '../src/game/replayCommands.ts';
import { mountMenuPointer } from '../src/ui/menuPointer.ts';
import { withDefaultMountedLight } from './firearmAttachmentFixture.ts';
import { BODY_TUNING_FIXTURE } from './simulationFixture.ts';

const contentDir = join(import.meta.dirname, '../src/content/base');
const { registry } = buildRegistry(
  readdirSync(contentDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(contentDir, file), 'utf8')) as unknown })),
);

const dom = new Window();
for (const key of [
  'document',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'PointerEvent',
  'KeyboardEvent',
  'Document',
  'DocumentFragment',
] as const) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom[key] });
}
Object.defineProperty(globalThis, 'window', { configurable: true, value: dom });
Object.defineProperty(globalThis, 'addEventListener', {
  configurable: true,
  value: dom.addEventListener.bind(dom),
});
Object.defineProperty(globalThis, 'removeEventListener', {
  configurable: true,
  value: dom.removeEventListener.bind(dom),
});
// Happy DOM has no layout and omits this API; a moved cursor in these controls hits no drop zone.
Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [] });
const { InventoryScreen, targetForPackedFloorDrop } = await import('../src/ui/inventoryScreen.ts');

afterAll(() => dom.happyDOM.abort());

function setup(contentRegistry = registry) {
  document.body.innerHTML = '<div id="inventory" hidden></div><div id="inventory-drag-root"></div>';
  const inv = new Inventory(contentRegistry);
  const queue = new HandlingQueue(inv);
  const jeans = inv.create('jeans');
  const hoodie = inv.create('hoodie');
  const beans = inv.create('canned_beans');
  if (
    !(
      inv.add(jeans, { kind: 'worn' }) &&
      inv.add(hoodie, { kind: 'worn' }) &&
      inv.add(beans, { kind: 'hand', side: 'right' })
    )
  ) {
    throw new Error('Inventory UI fixture cannot place its worn and held items');
  }
  const furnitureDef = [...registry.furniture.values()].find((def) => def.container);
  if (!furnitureDef) {
    throw new Error('expected shipped searchable furniture');
  }
  const entity = inv.entities.add({ type: furnitureDef.id, pos: [1, 0, 0], size: [1, 1, 1], facing: 'n' });
  if (!entity) {
    throw new Error('expected the shipped container to be added');
  }
  const searching = new Set<typeof entity>();
  const body = new Body(BODY_TUNING_FIXTURE);
  const character = new Character(registry);
  queue.registerAction('furniture.search', () => {
    searching.delete(entity);
    inv.entities.markSearched(entity);
  });
  const notices: string[] = [];
  const refusals: string[] = [];
  let needs = 'health 100% · stamina 100% · food 100% · water 100% · fatigue 0%';
  let lastPayload: ReplayActionPayload | undefined;
  let workHandler = (_uid: number, _operation: WorkOperation): string | undefined => undefined;
  const hooks = {
    reach: bindReach({ inventory: inv, position: [0, 0, 0], blockSize: 1 }),
    feet: () => [0, 0, 0] as [number, number, number],
    nearby: () => [...inv.piles.values()],
    distance: () => 0,
    containers: () => [entity],
    entityDistance: () => 1,
    dispatch: (payload: ReplayActionPayload) => {
      lastPayload = payload;
      return applyReplayActionPayload(payload, {
        inventory: inv,
        queue,
        quickbar: { assign: () => undefined },
        search: (uid) => {
          if (uid !== entity.uid || entity.searched || searching.has(entity)) {
            return;
          }
          searching.add(entity);
          queue.enqueueAction('furniture.search', 'Search furniture', 5);
        },
        work: (uid, operation) => workHandler(uid, operation),
        toHands: () => undefined,
        pickup: () => undefined,
        interact: () => undefined,
        clearDownedBody: () => undefined,
        craftStart: () => undefined,
        craftContinue: () => undefined,
        craftStop: () => undefined,
        wait: () => undefined,
        cancelItemThrow: () => undefined,
        throwItem: () => undefined,
      });
    },
    searching: (target: typeof entity) => searching.has(target),
    notice: (text: string) => notices.push(text),
    refusal: (text: string) => refusals.push(text),
    describe: (_item: typeof beans) => ['test description'],
    workOptions: (_uid: number): WorkOption[] => [],
    character: () => character,
    body: () => body.snapshotState(),
    needs: () => needs,
    actionRefusal: () => body.actionRefusal,
    attachmentCandidates: (_firearmUid: number, _slotId: string) => [beans],
  };
  const root = document.querySelector<HTMLElement>('#inventory')!;
  const screen = new InventoryScreen(root, inv, queue, hooks);
  screen.open();
  return {
    root,
    screen,
    inv,
    queue,
    entity,
    searching,
    beans,
    notices,
    refusals,
    hooks,
    body,
    character,
    lastPayload: () => lastPayload,
    setWorkHandler: (handler: typeof workHandler) => {
      workHandler = handler;
    },
    setNeeds: (value: string) => {
      needs = value;
    },
  };
}

const holdQuickGate = () => {
  const previous = { context: keyboardInput.context, command: keyboardInput.command };
  keyboardInput.cancel();
  keyboardInput.context = () => ({ context: 'inventory', debug: false });
  keyboardInput.command = () => undefined;
  const issue = inputBindings.rebind('inventory.quick-action-gate', [{ code: 'KeyJ' }]);
  if (issue) {
    throw new Error(issue);
  }
  const event = new KeyboardEvent('keydown', inputBindings.chords('inventory.quick-action-gate')[0]);
  if (!keyboardInput.press(event)) {
    throw new Error('Quick-action fixture gate was not admitted');
  }
  return () => {
    keyboardInput.release(event);
    inputBindings.reset();
    keyboardInput.context = previous.context;
    keyboardInput.command = previous.command;
  };
};

describe('inventory screen Lit rendering', () => {
  it('drops a packed floor stack onto the visible stack at its stored spot', () => {
    const items = new Map(registry.items);
    items.set('fixture_floor_stack', {
      id: 'fixture_floor_stack',
      name: 'Fixture floor stack',
      category: 'material',
      weight: 1,
      size: [1, 1],
      stack: 4,
    });
    const inventory = new Inventory({ ...registry, items });
    const pos: [number, number, number] = [0, 0, 0];
    const hiddenFirst = inventory.create('fixture_floor_stack');
    const visibleStack = inventory.create('fixture_floor_stack', 2);
    if (
      !(
        inventory.add(hiddenFirst, { kind: 'pile', pos, at: { x: 0, y: 0, rotated: false } }) &&
        inventory.add(visibleStack, { kind: 'pile', pos, at: { x: 1, y: 0, rotated: false } })
      )
    ) {
      throw new Error('Could not create packed floor drop fixture');
    }
    inventory.consume(hiddenFirst);
    const dragged = inventory.create('fixture_floor_stack');
    if (!inventory.add(dragged, { kind: 'hand', side: 'left' })) {
      throw new Error('Could not hold packed floor drop fixture');
    }

    const target = targetForPackedFloorDrop(inventory, dragged, pos, visibleStack);
    expect(target).toEqual({ kind: 'pile', pos, at: { x: 1, y: 0, rotated: false } });
    const plan = inventory.plan(dragged, target);
    if (!plan.ok) {
      throw new Error(`Visible floor stack refused its matching drop: ${plan.reason}`);
    }
    expect(plan.merge).toBe(visibleStack);
  });

  it('opens directly on a requested tab and remembers it across toggles', () => {
    const { screen, root } = setup();
    screen.close();
    screen.openOnTab('skills');
    expect(screen.isOpen).toBe(true);
    screen.close();
    screen.open();

    expect(screen.activeTab).toBe('skills');
    expect(root.querySelector<HTMLElement>('[data-tab-panel="skills"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-tab-panel="items"]')?.hidden).toBe(true);
  });

  it('shows Wait on the Actions tab and dispatches it through the screen owner', () => {
    const { screen, root, lastPayload } = setup();
    screen.selectTab('actions');
    expect(root.querySelector<HTMLElement>('[data-tab-panel="actions"]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-tab-panel="items"]')?.hidden).toBe(true);
    const panel = root.querySelector<HTMLElement>('[data-tab-panel="actions"]')!;
    const button = panel.querySelector<HTMLButtonElement>('button[data-action="wait"]');
    expect(button).not.toBeNull();
    expect(panel.querySelectorAll('button')).toHaveLength(1);
    button!.click();
    expect(lastPayload()).toEqual({ kind: 'action.wait' });
  });
  it('routes a hotkey to an open screen before its generic action handler', () => {
    const { screen } = setup();
    const handled = routeModalCommand('ui.inventory-tab-skills', {
      toggleMainMenu: () => undefined,
      readingOpen: false,
      readingAction: () => undefined,
      toggleInventory: () => undefined,
      inventoryTabAction: (action) => {
        const tab = inventoryTabForAction(action);
        if (!tab) {
          return false;
        }
        screen.openOnTab(tab);
        return true;
      },
      screenOpen: screen.isOpen,
      screenAction: (action) => {
        screen.onAction(action);
      },
      mainMenuOpen: false,
      interruptionCommand: () => false,
    });

    expect(handled).toBe(true);
    expect(screen.activeTab).toBe('skills');
  });

  it('lets movement leave a book page after its close callback stops reading', () => {
    let pageClosed = false;
    const handled = routeModalCommand('movement.forward', {
      toggleMainMenu: () => undefined,
      readingOpen: true,
      readingAction: () => {
        throw new Error('Movement should leave the book page');
      },
      readingMovementAction: () => {
        pageClosed = true;
        return true;
      },
      toggleInventory: () => undefined,
      inventoryTabAction: () => false,
      screenOpen: false,
      screenAction: () => undefined,
      mainMenuOpen: false,
      interruptionCommand: () => false,
    });

    expect(pageClosed).toBe(true);
    expect(handled).toBe(false);
  });

  it('keeps live needs in the character-screen header on every tab', () => {
    const { screen, root, setNeeds } = setup();
    const needs = () => root.querySelector<HTMLElement>('.inv-needs')?.textContent;
    expect(needs()).toContain('stamina 100%');

    screen.selectTab('skills');
    expect(needs()).toContain('water 100%');
    screen.selectTab('crafting');
    expect(needs()).toContain('food 100%');

    setNeeds('health 80% · stamina 60% · food 40% · water 20% · fatigue 90%');
    screen.update();
    expect(needs()).toContain('fatigue 90%');
  });

  it('renders a skill level from the live character progression', () => {
    const { screen, root, character } = setup();
    const [skill] = registry.skills.values();
    if (!skill) {
      throw new Error('The skill screen needs a registry skill fixture');
    }
    screen.selectTab('skills');
    const initialLevel = character.skills[skill.id]!;
    const row = () => root.querySelector<HTMLElement>(`[data-skill="${skill.id}"]`);
    expect(row()?.dataset.level).toBe(String(initialLevel));

    character.awardPractice(skill.id, practiceForNextLevel(initialLevel), SKILL_LEVEL_LEGENDARY);
    screen.update();

    expect(character.skills[skill.id]).toBeGreaterThan(initialLevel);
    expect(row()?.dataset.level).toBe(String(character.skills[skill.id]));
  });
  it('shows the nested battery slot of a mounted light in firearm details', () => {
    const mounted = withDefaultMountedLight(registry, 'rifle_assault', 'flashlight');
    const { screen, inv, root } = setup(mounted.registry);
    const firearm = inv.create('rifle_assault');
    if (!inv.add(firearm, { kind: 'pile', pos: [0, 0, 0] })) {
      throw new Error('Fixture firearm could not be placed on the ground');
    }

    screen.selected = firearm;
    screen.update();

    const battery = root.querySelector<HTMLElement>(`[data-attachment-slot="${mounted.fitted.mountedAt}.battery"]`);
    expect(battery?.dataset.occupied).toBe('true');
  });

  it('fits a foregrip from an inventory pocket onto the held AR through the inventory control', () => {
    const test = setup();
    const firearm = test.inv.create('rifle_assault');
    const foregrip = test.inv.create('foregrip');
    const pocketOwner = test.inv.worn.legs;
    const model = registry.models.get('rifle_assault')!;
    const slot = model.attachmentSlots!.find(
      (candidate) => candidate.mount === 'rail-bottom' && model.compatibility?.[candidate.id]?.includes('foregrip'),
    );
    if (!(pocketOwner && slot && test.inv.consume(test.beans))) {
      throw new Error('Fixture could not prepare the foregrip and held-firearm path');
    }
    if (
      !(
        test.inv.add(firearm, { kind: 'hand', side: 'right' }) &&
        test.inv.add(foregrip, { kind: 'pocket', owner: pocketOwner, pocket: 0 })
      )
    ) {
      throw new Error('Fixture could not place the AR in hand and foregrip in an inventory pocket');
    }
    const handling = new FirearmAttachmentHandling(test.inv, test.queue, () => [0, 0, 0]);
    test.hooks.attachmentCandidates = (firearmUid, slotId) => handling.candidates(firearmUid, slotId);
    test.hooks.dispatch = (payload) =>
      applyReplayActionPayload(payload, {
        inventory: test.inv,
        queue: test.queue,
        quickbar: { assign: () => undefined },
        search: () => undefined,
        work: () => undefined,
        fitAttachment: (uid, targetSlot, attachmentUid) => handling.fit(uid, targetSlot, attachmentUid),
        removeAttachment: (uid, targetSlot) => handling.remove(uid, targetSlot),
        toHands: () => undefined,
        pickup: () => undefined,
        interact: () => undefined,
        clearDownedBody: () => undefined,
        craftStart: () => undefined,
        craftContinue: () => undefined,
        craftStop: () => undefined,
        wait: () => undefined,
        cancelItemThrow: () => undefined,
        throwItem: () => undefined,
      });
    test.screen.selected = firearm;
    test.screen.update();

    expect(test.inv.hands.right).toBe(firearm);
    expect(test.inv.locate(foregrip)?.kind).toBe('pocket');
    const fit = test.root.querySelector<HTMLButtonElement>(`[data-attachment-slot="${slot.id}"] button.inv-option`);
    expect(fit).not.toBeNull();
    fit!.click();

    expect(test.queue.jobs).toHaveLength(1);
    expect(firearm.slots?.[slot.id]).toBeUndefined();
    test.queue.tick(test.queue.remaining);
    expect(firearm.slots?.[slot.id]).toBe(foregrip);
  });

  it('shows exported slots and dispatches fitting and removal for held and ground firearms', () => {
    const { screen, inv, root, lastPayload, beans } = setup();
    const groundFirearm = inv.create('rifle_assault');
    inv.consume(beans);
    const heldFirearm = inv.create('rifle_assault');
    if (
      !(
        inv.add(groundFirearm, { kind: 'pile', pos: [0, 0, 0] }) &&
        inv.add(heldFirearm, { kind: 'hand', side: 'right' })
      )
    ) {
      throw new Error('Fixture firearms could not be placed');
    }

    const slotIds = registry.models.get('rifle_assault')!.attachmentSlots!.map((slot) => slot.id);
    for (const firearm of [groundFirearm, heldFirearm]) {
      screen.selected = firearm;
      screen.update();
      const rows = slotIds.map((id) => root.querySelector<HTMLElement>(`[data-attachment-slot="${id}"]`));
      expect(rows.every(Boolean)).toBe(true);
      const openRow = rows.find((row) => row!.dataset.occupied === 'false')!;
      openRow.querySelector('button')!.click();
      expect(lastPayload()).toMatchObject({ kind: 'firearm.attachment.fit', firearmUid: firearm.uid });
      const occupiedRow = rows.find((row) => row!.dataset.occupied === 'true')!;
      occupiedRow.querySelector('button')!.click();
      expect(lastPayload()).toMatchObject({ kind: 'firearm.attachment.remove', firearmUid: firearm.uid });
    }
  });

  it('shows the reason when a firearm fit is refused', () => {
    const test = setup();
    const firearm = test.inv.create('rifle_assault');
    if (!test.inv.add(firearm, { kind: 'pile', pos: [0, 0, 0] })) {
      throw new Error('Fixture firearm could not be placed');
    }
    const reason = 'Fit refused: the attachment no longer has a rail certificate';
    test.hooks.dispatch = (payload) => (payload.kind === 'firearm.attachment.fit' ? reason : undefined);
    test.screen.selected = firearm;
    test.screen.update();

    const fit = test.root.querySelector<HTMLButtonElement>('.inv-details [data-attachment-slot] button.inv-option');
    if (!fit) {
      throw new Error('Fixture firearm did not render a fit action');
    }
    fit.click();

    expect(test.refusals).toEqual([reason]);
    expect(test.notices).toEqual([]);
    expect(test.queue.jobs).toHaveLength(0);
  });

  it('refuses inventory actions while unconscious and permits them after waking', () => {
    const { screen, queue, body, beans, refusals } = setup();
    screen.selected = beans;
    body.impact(1, 'torso', { shockDamage: 100 });

    expect(screen.onAction('inventory.drop')).toBe(true);
    expect(screen.onAction('inventory.search')).toBe(true);
    expect(queue.jobs).toHaveLength(0);
    expect(refusals).toHaveLength(2);

    body.advance(body.tuning.knockoutSimSeconds);
    expect(screen.onAction('inventory.drop')).toBe(true);
    expect(queue.jobs.length).toBeGreaterThan(0);
  });
  it('keeps unselected-item commands owned by inventory rather than debug', () => {
    const bindings = new BindingRegistry(INPUT_BINDINGS, undefined);
    const keyboard = new KeyboardInput(bindings);
    keyboard.context = () => ({ context: 'inventory', debug: true });
    const commands = INPUT_BINDINGS.filter(
      (binding) =>
        !binding.debug &&
        binding.commands.every(({ kind }) => kind === 'press') &&
        (binding.id.startsWith('inventory.') || binding.id.startsWith('quickbar.assign.')),
    );
    expect(commands.length).toBeGreaterThan(0);
    const received: string[] = [];
    for (const binding of commands) {
      const { screen } = setup();
      expect(screen.selected).toBeUndefined();
      keyboard.command = ({ action, phase }) => {
        if (phase === 'down') {
          expect(screen.onAction(action)).toBe(true);
          received.push(action);
        }
      };
      const event = new KeyboardEvent('keydown', bindings.chords(binding.id)[0]);
      expect(keyboard.press(event)).toBe(true);
      expect(received.at(-1)).toBe(binding.id);
      keyboard.release(event);
      screen.close();
    }
  });
  it('shows the derived occupied hand without a second item UID and routes work options by UID', () => {
    const { root, screen, inv, hooks, setWorkHandler } = setup();
    expect(inv.move(inv.hands.right!, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    for (const [type, count] of [
      ['stick', 1],
      ['rag', 2],
      ['wax', 1],
      ['kitchen_knife', 1],
    ] as const) {
      inv.add(inv.create(type, count), { kind: 'pile', pos: [0, 0, 0] });
    }
    const result = planCraft(registry.recipes.get('torch')!, hooks.reach(), new Character(registry));
    if (!('plan' in result)) {
      throw new Error(result.missing.reason);
    }
    const item = inv.beginWork(result.plan)!;
    const calls: [number, WorkOperation][] = [];
    hooks.workOptions = () => [
      { operation: 'continue', label: 'Continue: torch', plan: { ok: true, time: 0 } },
      { operation: 'apart', label: 'Take apart', plan: { ok: true, time: 0 } },
    ];
    setWorkHandler((uid, operation) => {
      calls.push([uid, operation]);
    });
    screen.selected = item;
    screen.update();
    expect(root.querySelectorAll(`.inv-hands [data-uid="${item.uid}"]`)).toHaveLength(1);
    expect(root.querySelector('[data-target="hand:left"] .inv-occupied-hand')).not.toBeNull();
    expect(inv.hands.left).toBeUndefined();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.inv-details button')];
    buttons.find((button) => button.textContent!.includes('Take apart'))!.click();
    expect(calls).toEqual([[item.uid, 'apart']]);
  });
  it('redraws the body when a furniture search is queued without a version bump', () => {
    const test = setup();
    const versions = [test.inv.version, test.inv.entities.version];
    const search = [...test.root.querySelectorAll<HTMLButtonElement>('.inv-pane button')].find((button) =>
      button.textContent?.includes('Search it'),
    );
    expect(search).toBeDefined();

    search!.click();
    test.screen.update();

    expect([test.inv.version, test.inv.entities.version]).toEqual(versions);
    expect(test.queue.jobs).toHaveLength(1);
    expect(test.searching.has(test.entity)).toBe(true);
    expect(test.root.querySelectorAll('.inv-pane')[1]?.querySelector('button.inv-option')).toBeNull();
  });

  it.each([
    {
      name: 'browser modifiers are not forwarded into inventory actions',
      ctrlKey: true,
      metaKey: true,
      shiftKey: true,
      altKey: true,
      quick: false,
    },
    { name: 'held quick gate auto-moves', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, quick: true },
  ])('$name through the locked-menu adapter', (binding) => {
    const t = setup();
    const node = t.root.querySelector<HTMLElement>(`[data-uid="${t.beans.uid}"]`)!;
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const input = { locked: true, menuPointer: true, cursorX: 100, cursorY: 100, moveMenuCursor: () => undefined };
    const adapter = mountMenuPointer({ input, canvas, cursor: document.createElement('div') });
    const hit = vi.spyOn(document, 'elementFromPoint').mockReturnValue(node);
    const releaseGate = binding.quick ? holdQuickGate() : () => undefined;
    const modifiers = {
      ctrlKey: binding.ctrlKey,
      metaKey: binding.metaKey,
      shiftKey: binding.shiftKey,
      altKey: binding.altKey,
    };
    let received: typeof modifiers | undefined;
    node.addEventListener('pointerdown', (event) => {
      received = { ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey };
    });
    try {
      // The locked canvas receives the original event; only the production adapter can deliver it to the item.
      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, ...modifiers }));
      expect(received).toEqual({
        ctrlKey: false,
        metaKey: false,
        shiftKey: modifiers.shiftKey,
        altKey: modifiers.altKey,
      });
      expect(t.screen.selected).toBe(t.beans);
      expect(t.inv.hands.right).toBe(t.beans);
      expect(t.queue.jobs).toHaveLength(binding.quick ? 1 : 0);
      input.cursorX += 10;
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1 }));
      expect(document.querySelector('.inv-ghost') !== null).toBe(!binding.quick);
      canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      if (binding.quick) {
        t.queue.tick(t.queue.remaining);
        expect(t.inv.locate(t.beans)?.kind).toBe('pocket');
      }
      expect(document.querySelector('#inventory-drag-root')?.textContent).toBe('');
    } finally {
      releaseGate();
      input.locked = false;
      adapter.releaseCaptures();
      t.screen.close();
      hit.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('repeated quick-clicks keep one owned move and emit refusal feedback for every duplicate', () => {
    const t = setup();
    const releaseGate = holdQuickGate();
    try {
      expect(t.inv.move(t.beans, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
      t.screen.update();
      const attempts = 3;
      for (let click = 0; click < attempts; click++) {
        const node = t.root.querySelector<HTMLElement>(`[data-uid="${t.beans.uid}"]`)!;
        expect(node).not.toBeNull();
        node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
      }
      expect.soft(t.queue.jobs).toHaveLength(1);
      expect(t.refusals).toHaveLength(attempts - 1);
      expect(t.refusals.every((refusal) => refusal.length > 0)).toBe(true);
    } finally {
      releaseGate();
      t.screen.close();
      vi.unstubAllGlobals();
    }
  });

  it('keeps each worn container’s pockets inside its own wrapping slot', () => {
    const { root, inv } = setup();
    const containers = Object.entries(inv.worn).filter(([, item]) => item?.pockets?.length);
    expect(containers.length).toBeGreaterThan(0);
    for (const [slot, item] of containers) {
      const wrapper = root.querySelector(`[data-target="worn:${slot}"]`)?.closest('.inv-worn');
      expect(wrapper).not.toBeNull();
      expect(wrapper!.querySelectorAll(':scope > .inv-pockets > .inv-pocket')).toHaveLength(item!.pockets!.length);
    }
  });

  it('preserves focus across a real body redraw while the selected option remains valid', () => {
    const test = setup();
    test.screen.selected = test.beans;
    test.screen.update();
    const button = test.root.querySelector<HTMLButtonElement>('.inv-details button');
    expect(button).toBeDefined();
    button!.focus();
    expect(document.activeElement).toBe(button);

    let redraws = 0;
    const screenWithRender = test.screen as unknown as { render: () => void };
    const render = screenWithRender.render.bind(test.screen);
    screenWithRender.render = () => {
      redraws += 1;
      render();
    };
    expect(test.inv.add(test.inv.create(test.beans.type), { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    test.screen.update();

    expect(redraws).toBe(1);
    expect(test.root.querySelector('.inv-details button')).toBe(button);
    expect(document.activeElement).toBe(button);
  });
});
