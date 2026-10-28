// @vitest-environment happy-dom
import { render } from 'lit-html';
import { describe, expect, it } from 'vitest';
import { Character, SKILL_LEVEL_MAX } from '../src/core/character.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { decimalText } from '../src/core/numberText.ts';
import { fillText } from '../src/core/textTemplate.ts';
import { labelForAction } from '../src/game/inputBindings.ts';
import { Quickbar } from '../src/game/quickbar.ts';
import {
  handlingViewModel,
  quickbarKey,
  quickbarViewModel,
  type TimedActionPresentation,
  timedActionHandlingPresentation,
} from '../src/ui/hud.ts';
import { baseRegistry, baseScreenText } from './baseRegistry.ts';

const registry = baseRegistry();
const handlingText = baseScreenText().handling;

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
    expect(vm.slots).toHaveLength(new Quickbar().slots.length);
    expect(vm.slots[0]).toMatchObject({ key: labelForAction('quickbar.use.1'), filled: false, where: '' });
    expect(vm.slots[0]?.name).not.toBe('');
  });

  it('shows an item in a hand', () => {
    const inv = new Inventory(registry);
    const flashlight = inv.create('flashlight');
    expect(inv.add(flashlight, { kind: 'hand', side: 'right' })).toBe(true);
    const bar = new Quickbar();
    bar.assign(0, flashlight);
    const vm = quickbarViewModel(bar, inv);
    expect(vm.slots[0]).toMatchObject({
      key: labelForAction('quickbar.use.1'),
      filled: true,
      name: inv.name(flashlight),
    });
    expect(vm.slots[0]?.where).not.toBe('');
  });

  it('shows a worn item as worn', () => {
    const inv = new Inventory(registry);
    const hoodie = inv.create('hoodie');
    inv.worn.torso = hoodie;
    const bar = new Quickbar();
    bar.assign(1, hoodie);
    const vm = quickbarViewModel(bar, inv);
    expect(vm.slots[1]).toMatchObject({ key: labelForAction('quickbar.use.2') });
    expect(vm.slots[1]?.where).not.toBe('');
  });

  it('shows an item in a pocket, with the owner and the handling time', () => {
    const bar = new Quickbar();
    const character = new Character(registry);
    const skilled = new Inventory(registry, undefined, undefined, character);
    const owner = skilled.create('hoodie');
    expect(skilled.add(owner, { kind: 'worn' })).toBe(true);
    const item = skilled.create('matches');
    expect(skilled.add(item, { kind: 'pocket', owner, pocket: 0 })).toBe(true);
    bar.assign(2, item);
    const before = quickbarKey(bar, skilled);
    character.awardPractice('inventory_management', Number.MAX_SAFE_INTEGER);
    expect(character.skills.inventory_management).toBe(SKILL_LEVEL_MAX);
    expect(skilled.scaleHandlingTime(1)).not.toBe(1);
    const expected = skilled.handlingTime(item, skilled.locate(item)!, { kind: 'hand', side: 'left' });
    expect(quickbarViewModel(bar, skilled).slots[2]?.where).toBe(
      fillText(baseScreenText().quickbar.pocket, {
        container: skilled.name(owner).toLowerCase(),
        secs: decimalText(expected),
      }),
    );
    expect(quickbarKey(bar, skilled)).not.toBe(before);
  });

  it('renders an item left in furniture as an empty slot', () => {
    const { inv, hoodie, cupboard } = kitchen();
    const matches = inv.create('matches');
    inv.add(matches, { kind: 'pocket', owner: hoodie, pocket: 0 });
    const bar = new Quickbar();
    bar.assign(3, matches);
    inv.entities.markSearched(cupboard);
    expect(inv.move(matches, { kind: 'furniture', entity: cupboard, pocket: 0 }).ok).toBe(true);
    const vm = quickbarViewModel(bar, inv);
    expect(vm.slots[3]).toMatchObject({ filled: false, where: '' });
  });

  it('renders a consumed binding as an empty slot', () => {
    const inv = new Inventory(registry);
    const rag = inv.create('rag');
    inv.add(rag, { kind: 'hand', side: 'right' });
    const bar = new Quickbar();
    bar.assign(4, rag);
    inv.consume(rag);
    const vm = quickbarViewModel(bar, inv);
    expect(vm.slots[4]).toMatchObject({ filled: false, where: '' });
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

  it('changes when an inventory mutation changes its version', () => {
    const inv = new Inventory(registry);
    const bar = new Quickbar();
    const before = quickbarKey(bar, inv);
    expect(inv.add(inv.create('rag'), { kind: 'hand', side: 'right' })).toBe(true);
    expect(quickbarKey(bar, inv)).not.toBe(before);
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
    expect(handlingViewModel(queue, handlingText).visible).toBe(false);
  });

  it('shows throw charge and the minimum-release point on the handling meter', () => {
    const chargeSimSeconds = 2;
    const minimumHoldSimSeconds = 1;
    for (const elapsedSimSeconds of [0, chargeSimSeconds / 2, chargeSimSeconds * 2]) {
      const vm = handlingViewModel(
        { jobs: [], throwCharge: { elapsedSimSeconds, chargeSimSeconds, minimumHoldSimSeconds } },
        handlingText,
      );

      expect(vm.visible).toBe(true);
      expect(vm.label).toBe(handlingText.throwForce);
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
    const vm = handlingViewModel(queue, handlingText);
    const job = queue.jobs[0]!;
    expect(vm.visible).toBe(true);
    expect(vm.label).toBe(label);
    expect(vm.simSecondsLabel.match(/[\d.]+/g)?.map(Number)).toEqual([job.elapsed, job.duration]);
    expect(vm.percent).toBe(Math.round((job.elapsed / job.duration) * 100));
  });

  it('shows the next job when there is one queued after the current one', () => {
    const inv = new Inventory(registry);
    const queue = queueForTest(inv);
    queue.enqueueAction('test.noop', 'Search the cupboard', 4);
    queue.enqueueAction('test.noop', 'Search the drawer', 2);
    const { next } = handlingViewModel(queue, handlingText);
    expect(next).toContain('Search the drawer');
  });

  it('projects each timed long job through one progress view and hides stopped jobs', () => {
    const jobs: readonly TimedActionPresentation[] = [
      {
        kind: 'forceDoor',
        label: 'Fixture action',
        elapsed: 3,
        duration: 8,
        stopped: false,
      },
      {
        kind: 'reading',
        label: 'Fixture action',
        elapsed: 2,
        duration: 10,
        stopped: false,
      },
      {
        kind: 'treatment',
        label: 'Fixture action',
        elapsed: 1,
        duration: 5,
        stopped: false,
      },
    ];

    for (const job of jobs) {
      const vm = handlingViewModel(timedActionHandlingPresentation(job, handlingText), handlingText);
      expect(vm.visible).toBe(true);
      expect(vm.percent).toBe(Math.round((job.elapsed / job.duration) * 100));
      const root = document.createElement('div');
      render(vm.cancelLabel, root);
      expect(root.querySelector('.keycap')?.textContent).toBe(labelForAction('handling.stop'));
    }
    const stopped = { ...jobs[1]!, stopped: true };
    expect(handlingViewModel(timedActionHandlingPresentation(stopped, handlingText), handlingText).visible).toBe(false);
  });
  it('has no next-job text when nothing is queued after the current one', () => {
    const inv = new Inventory(registry);
    const queue = queueForTest(inv);
    queue.enqueueAction('test.noop', 'Search the cupboard', 4);
    expect(handlingViewModel(queue, handlingText).next).toBe('');
  });
});
