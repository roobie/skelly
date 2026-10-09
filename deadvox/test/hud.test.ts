import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { cellCount, defOf } from '../src/core/items.ts';
import { Quickbar } from '../src/game/quickbar.ts';
import { handlingPresentationFor, handlingViewModel, quickbarKey, quickbarViewModel } from '../src/ui/hud.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ source: f, data: JSON.parse(readFileSync(join(BASE, f), 'utf8')) as unknown })),
);

/** A cupboard next to a player in a hoodie, for testing furniture and pocket locations. */
const kitchen = () => {
  const inv = new Inventory(registry);
  const hoodie = inv.create('hoodie');
  inv.worn.torso = hoodie;
  const cupboard = inv.furnish({ type: 'kitchen_cupboard', pos: [0, 0, 0], size: [2, 2, 1], facing: 'n' }, [
    { type: 'canned_beans', count: 1, condition: 1 },
  ])!;
  const [beans] = cupboard.pockets![0]!.map((p) => p.item);
  return { inv, hoodie, cupboard, beans: beans! };
};

describe('quickbarViewModel', () => {
  it('shows only the key and empty label in an empty slot', () => {
    const vm = quickbarViewModel(new Quickbar(), new Inventory(registry));
    expect(vm.slots).toHaveLength(5);
    expect(vm.slots[0]).toEqual({ key: '1', filled: false, name: 'empty', where: '' });
  });

  it('shows an item in a hand', () => {
    const inv = new Inventory(registry);
    const flashlight = inv.create('flashlight');
    expect(inv.add(flashlight, { kind: 'hand', side: 'right' })).toBe(true);
    const bar = new Quickbar();
    bar.assign(0, flashlight);
    const vm = quickbarViewModel(bar, inv);
    expect(vm.slots[0]).toMatchObject({ key: '1', filled: true, name: 'Flashlight', where: 'in right hand' });
  });

  it('shows a worn item as worn', () => {
    const inv = new Inventory(registry);
    const hoodie = inv.create('hoodie');
    inv.worn.torso = hoodie;
    const bar = new Quickbar();
    bar.assign(1, hoodie);
    const vm = quickbarViewModel(bar, inv);
    expect(vm.slots[1]).toMatchObject({ key: '2', where: 'worn' });
  });

  it('shows an item in a pocket, with the owner and the handling time', () => {
    const { inv, hoodie } = kitchen();
    const matches = inv.create('matches');
    inv.add(matches, { kind: 'pocket', owner: hoodie, pocket: 0 });
    const bar = new Quickbar();
    bar.assign(2, matches);
    const vm = quickbarViewModel(bar, inv);
    const cells = cellCount(defOf(registry, matches.type));
    const seconds = (inv.pocketHandling(hoodie, 0) + 0.05 * cells).toFixed(1);
    expect(vm.slots[2]).toMatchObject({ where: `hoodie · ${seconds} s` });
  });

  it('shows an item in furniture', () => {
    const { inv, cupboard, beans } = kitchen();
    inv.entities.markSearched(cupboard);
    const bar = new Quickbar();
    bar.assign(3, beans);
    const vm = quickbarViewModel(bar, inv);
    expect(vm.slots[3]).toMatchObject({ where: 'in the kitchen cupboard' });
  });

  it('renders a consumed binding as an empty slot', () => {
    const inv = new Inventory(registry);
    const rag = inv.create('rag');
    inv.add(rag, { kind: 'hand', side: 'right' });
    const bar = new Quickbar();
    bar.assign(4, rag);
    inv.consume(rag);
    const vm = quickbarViewModel(bar, inv);
    expect(vm.slots[4]).toMatchObject({ filled: false, name: 'empty', where: '' });
  });

  it('shows the count when there is more than one', () => {
    const inv = new Inventory(registry);
    const beans = inv.create('canned_beans', 3);
    expect(inv.add(beans, { kind: 'hand', side: 'right' })).toBe(true);
    const bar = new Quickbar();
    bar.assign(0, beans);
    const vm = quickbarViewModel(bar, inv);
    expect(vm.slots[0]?.name).toContain(String(beans.count));
  });
});

describe('quickbarKey', () => {
  it('is unchanged when nothing about the inventory or the slots changed', () => {
    const inv = new Inventory(registry);
    const flashlight = inv.create('flashlight');
    expect(inv.add(flashlight, { kind: 'hand', side: 'right' })).toBe(true);
    const bar = new Quickbar();
    bar.assign(0, flashlight);
    expect(quickbarKey(bar, inv)).toBe(quickbarKey(bar, inv));
  });

  it('changes when a slot is assigned a different item', () => {
    const inv = new Inventory(registry);
    const flashlight = inv.create('flashlight');
    const rag = inv.create('rag');
    inv.add(flashlight, { kind: 'hand', side: 'right' });
    inv.add(rag, { kind: 'hand', side: 'left' });
    const bar = new Quickbar();
    bar.assign(0, flashlight);
    const before = quickbarKey(bar, inv);
    bar.assign(0, rag);
    expect(quickbarKey(bar, inv)).not.toBe(before);
  });

  it('changes when the inventory version changes', () => {
    const inv = new Inventory(registry);
    const before = quickbarKey(new Quickbar(), inv);
    inv.version += 1;
    expect(quickbarKey(new Quickbar(), inv)).not.toBe(before);
  });
});

describe('handlingViewModel', () => {
  const queueForTest = (inventory: Inventory) => {
    const queue = new HandlingQueue(inventory);
    queue.registerAction('test.noop', () => undefined);
    return queue;
  };
  it('is invisible when the queue is empty', () => {
    const inv = new Inventory(registry);
    const queue = new HandlingQueue(inv);
    expect(handlingViewModel(queue).visible).toBe(false);
  });

  it('shows throw charge and the minimum-release point on the handling meter', () => {
    const chargeSimSeconds = 2;
    const minimumHoldSimSeconds = 1;
    for (const elapsedSimSeconds of [0, chargeSimSeconds / 2, chargeSimSeconds * 2]) {
      const vm = handlingViewModel({
        jobs: [],
        throwCharge: { elapsedSimSeconds, chargeSimSeconds, minimumHoldSimSeconds },
      });

      expect(vm.visible).toBe(true);
      expect(vm.label.trim()).not.toBe('');
      expect(vm.percent).toBe(Math.round((Math.min(chargeSimSeconds, elapsedSimSeconds) / chargeSimSeconds) * 100));
      expect(vm.minimumPercent).toBe(Math.round((minimumHoldSimSeconds / chargeSimSeconds) * 100));
    }
  });

  it('shows the current job label, elapsed and total time, and the progress percent', () => {
    const inv = new Inventory(registry);
    const queue = queueForTest(inv);
    const label = 'Search the cupboard';
    queue.enqueueAction('test.noop', label, 4);
    queue.tick(1);
    const vm = handlingViewModel(queue);
    const job = queue.jobs[0]!;
    expect(vm.visible).toBe(true);
    expect(vm.label).toBe(label);
    expect(vm.simSecondsLabel.match(/[\d.]+/g)?.map(Number)).toEqual([job.elapsed, job.duration]);
    expect(vm.percent).toBe(Math.round((job.elapsed / job.duration) * 100));
  });

  it('presents reading progress and its cancel control without implying movement', () => {
    const inventory = new Inventory(registry);
    const bookType = [...registry.items.entries()].find(([, definition]) => definition.book)?.[0];
    if (!bookType) {
      throw new Error('Reading HUD fixture requires a book definition');
    }
    const book = inventory.create(bookType);
    expect(inventory.add(book, { kind: 'hand', side: 'right' })).toBe(true);
    const job = {
      jobType: 'reading',
      stopped: false,
      last: 0,
      bookUid: book.uid,
      elapsed: 15,
      duration: 60,
    } as const;
    const vm = handlingViewModel(handlingPresentationFor(job, { jobs: [] }, inventory));

    expect(vm).toMatchObject({
      visible: true,
      label: `Reading ${inventory.name(book)}`,
      simSecondsLabel: '15.0 / 60.0 s',
      percent: 25,
      cancelLabel: 'X cancels',
      movementLabel: '',
    });
  });

  it('shows the next job when there is one queued after the current one', () => {
    const inv = new Inventory(registry);
    const queue = queueForTest(inv);
    queue.enqueueAction('test.noop', 'Search the cupboard', 4);
    queue.enqueueAction('test.noop', 'Search the drawer', 2);
    const { next } = handlingViewModel(queue);
    expect(next).toContain('Search the drawer');
  });

  it('has no next-job text when nothing is queued after the current one', () => {
    const inv = new Inventory(registry);
    const queue = queueForTest(inv);
    queue.enqueueAction('test.noop', 'Search the cupboard', 4);
    expect(handlingViewModel(queue).next).toBe('');
  });
});
