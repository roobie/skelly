import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { useOption } from '../src/core/options.ts';
import { bindReach } from '../src/core/reach.ts';
import { READABLE_TEXT_LIMIT, READABLE_TITLE_LIMIT, type Readable } from '../src/core/readable.ts';
import { makeScale } from '../src/core/scale.ts';
import { Simulation } from '../src/core/sim.ts';
import { World } from '../src/core/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { Survival } from '../src/game/survival.ts';
import { computeMenuState } from '../src/ui/menuState.ts';

const readable = { title: 'Placeholder', text: 'PLAIN\tPLACEHOLDER\r\n\nSecond paragraph.' };
const admit = (value: Readable) =>
  buildRegistry([
    {
      source: 'fixture.json',
      data: {
        items: [{ id: 'note', name: 'Note', category: 'book', weight: 5, size: [1, 1], readable: value }],
        furniture: [{ id: 'sign', name: 'Sign', size: [2, 2, 1], color: '#99794c', readable: value }],
      },
    },
  ]);
describe('authored readable text', () => {
  it('rejects whitespace-only title and text on both items and furniture', () => {
    for (const key of ['title', 'text'] as const) {
      const result = admit({ ...readable, [key]: ' \n\t ' });
      expect(result.issues.filter((issue) => issue.path.endsWith(`readable.${key}`))).toHaveLength(2);
      expect(result.registry.items.size).toBe(0);
      expect(result.registry.furniture.size).toBe(0);
    }
  });
  it('rejects markup or non-text controls in either readable field on both owners', () => {
    for (const key of ['title', 'text'] as const) {
      for (const value of ['<b>stray markup</b>', 'a > b', 'a\u007fb', `control${String.fromCharCode(0)}text`]) {
        expect(
          admit({ ...readable, [key]: value }).issues.filter((issue) => issue.path.endsWith(`readable.${key}`)),
        ).toHaveLength(2);
      }
    }
  });
  it('rejects text beyond the separate title and body view caps', () => {
    for (const [key, limit] of [
      ['title', READABLE_TITLE_LIMIT],
      ['text', READABLE_TEXT_LIMIT],
    ] as const) {
      expect(admit({ ...readable, [key]: 'x'.repeat(limit) }).issues).toEqual([]);
      expect(
        admit({ ...readable, [key]: 'x'.repeat(limit + 1) }).issues.filter((issue) =>
          issue.path.endsWith(`readable.${key}`),
        ),
      ).toHaveLength(2);
    }
  });
  it('revalidates hand ownership at the domain command and neither consumes nor charges reading', () => {
    const { registry, issues } = admit(readable);
    expect(issues).toEqual([]);
    const inventory = new Inventory(registry);
    const reach = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5 });
    const sim = new Simulation({ seed: 1 });
    const queue = new HandlingQueue(inventory);
    const shown: Readonly<Readable>[] = [];
    const owner = new Survival(sim, inventory, queue, {
      reach,
      feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
      notice: () => undefined,
      read: (value) => shown.push(value),
    });
    const note = inventory.create('note');
    inventory.add(note, { kind: 'pile', pos: [0, 0, 0] });
    expect(useOption(note, reach()).plan.ok).toBe(false);
    expect(owner.use(note)).toContain('hands');
    expect(shown).toEqual([]);
    expect(inventory.move(note, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(useOption(note, reach())).toMatchObject({ label: 'Read', operation: 'read', plan: { ok: true, time: 0 } });
    const before = { time: sim.time, count: note.count, version: inventory.version };
    expect(owner.use(note)).toBeUndefined();
    expect(shown).toEqual([readable]);
    expect({ time: sim.time, count: note.count, version: inventory.version }).toEqual(before);
    expect(queue.jobs).toHaveLength(0);
    inventory.move(note, { kind: 'pile', pos: [0, 0, 0] });
    expect(owner.use(note)).toContain('hands');
    expect(shown).toHaveLength(1);
  });
  it('admits only a live in-reach sign at the furniture command boundary', () => {
    const { registry, issues } = admit(readable);
    expect(issues).toEqual([]);
    const shown: Readonly<Readable>[] = [];
    const session = createSession({
      registry,
      world: new World(),
      isSolid: () => false,
      isOpaque: () => false,
      scale: makeScale(0.5),
      seed: 1,
      start: 0,
      spawn: [0, 1, 0],
      ready: () => false,
      controls: {
        active: () => false,
        intent: () => IDLE,
        yaw: () => 0,
        pitch: () => 0,
        walking: () => false,
        descending: () => false,
      },
      audio: { play: () => undefined },
      notice: () => undefined,
      onRead: (value) => shown.push(value),
    });
    const sign = session.inventory.furnish({ type: 'sign', pos: [2, 0, 0], size: [2, 2, 1], facing: 'n' })!;
    const before = {
      time: session.sim.time,
      version: session.inventory.version,
      entities: session.inventory.entities.version,
    };
    expect(session.readFurniture({ ...sign })).toBe('It is no longer there');
    expect(session.readFurniture(sign)).toBeUndefined();
    expect(shown).toEqual([readable]);
    expect({
      time: session.sim.time,
      version: session.inventory.version,
      entities: session.inventory.entities.version,
    }).toEqual(before);
    session.body.pos = [30, 1, 0];
    expect(session.readFurniture(sign)).toBe('Too far away');
    expect(shown).toHaveLength(1);
    expect(session.queue.jobs).toHaveLength(0);
  });
  it('uses inventory-style live time and menu-pointer admission for the reading surface', () => {
    const menu = computeMenuState({
      started: true,
      mainMenuOpen: false,
      inventoryOpen: false,
      readingOpen: true,
      debugMenuOpen: false,
      pointerLocked: true,
      dead: false,
    });
    expect(menu).toMatchObject({ paused: false, overlayHidden: true, menuPointer: true });
    const escaped = computeMenuState({
      started: true,
      mainMenuOpen: false,
      inventoryOpen: false,
      readingOpen: true,
      debugMenuOpen: false,
      pointerLocked: false,
      pointerLockChanged: true,
      dead: false,
    });
    expect(escaped).toMatchObject({ paused: true, closeOtherMenus: true });
  });
});
