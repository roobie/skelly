import { describe, expect, it } from 'vitest';
import { coreLabel, coreMessage } from '../src/core/coreText.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { pickInteractionTarget } from '../src/core/interactionPick.ts';
import { Inventory } from '../src/core/inventory.ts';
import { useOption } from '../src/core/options.ts';
import { bindReach } from '../src/core/reach.ts';
import { READABLE_TEXT_LIMIT, READABLE_TITLE_LIMIT, type Readable, type ReadRequest } from '../src/core/readable.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { startupContent } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';

const BUNDLED_CONTENT = startupContent();

import { createSession, IDLE } from '../src/game/session.ts';
import { Survival } from '../src/game/survival.ts';
import { computeMenuState } from '../src/ui/menuState.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';
import { playerInventorySource } from './fixtures/playerInventory.ts';
import { PLAYER } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { BODY_TUNING_FIXTURE, COMPRESSION_CAPS_FIXTURE, Simulation } from './simulationFixture.ts';

const readable = { title: 'Placeholder', text: 'PLAIN\tPLACEHOLDER\r\n\nSecond paragraph.' };
const admit = (value: Readable) =>
  buildRegistry([
    playerInventorySource(),
    {
      source: 'fixture.json',
      data: {
        items: [{ id: 'note', name: 'Note', category: 'book', weight: 5, size: [1, 1], readable: value }],
        furniture: [
          {
            id: 'sign',
            name: 'Sign',
            size: [1, 1, 1],
            color: '#99794c',
            readable: value,
            mount: 'wall',
            solid: false,
            shape: [{ position: [0, 0, 0.875], size: [1, 1, 0.125] }],
          },
        ],
        body: [{ ...BODY_TUNING_FIXTURE, id: 'player' }],
        sounds: Object.values(BODY_TUNING_FIXTURE.heartbeat.sounds).map(
          (id) => BUNDLED_CONTENT.registry.sounds.get(id)!,
        ),
        compression: [{ id: 'player', caps: COMPRESSION_CAPS_FIXTURE }],
        senses: [TEST_SENSE_TUNING],
        player: [PLAYER],
        skills: [structuredClone(BUNDLED_CONTENT.registry.skills.get('firearms_combat')!)],
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
    const reach = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5, clock: BASE_CLOCK });
    const sim = new Simulation({ seed: 1 });
    const queue = new HandlingQueue(inventory);
    const shown: ReadRequest[] = [];
    const owner = new Survival(sim, inventory, queue, {
      reach,
      feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
      notice: () => undefined,
      readingLight: () => undefined,
      read: (value) => shown.push(value),
    });
    const note = inventory.create('note');
    inventory.add(note, { kind: 'pile', pos: [0, 0, 0] });
    const notHeld = coreMessage(registry, 'notInHands', { item: 'note' });
    expect(useOption(note, reach()).plan.ok).toBe(false);
    expect(owner.use(note)).toBe(notHeld);
    expect(shown).toEqual([]);
    expect(inventory.move(note, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(useOption(note, reach())).toMatchObject({
      label: coreLabel(registry, 'read'),
      operation: 'read',
      plan: { ok: true, time: 0 },
    });
    const before = { time: sim.time, count: note.count, version: inventory.version };
    expect(owner.use(note)).toBeUndefined();
    expect(shown).toEqual([{ kind: 'text', readable, itemType: 'note' }]);
    expect({ time: sim.time, count: note.count, version: inventory.version }).toEqual(before);
    expect(queue.jobs).toHaveLength(0);
    inventory.move(note, { kind: 'pile', pos: [0, 0, 0] });
    expect(owner.use(note)).toBe(notHeld);
    expect(shown).toHaveLength(1);
  });
  it('requests a held regional map by its instance owner and coverage', () => {
    const inventory = new Inventory(BUNDLED_CONTENT.registry);
    const reach = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5, clock: BASE_CLOCK });
    const shown: ReadRequest[] = [];
    const map = inventory.createRolled({ type: 'regional_map', count: 1, condition: 1, paperMap: { x: -1, z: 2 } });
    expect(inventory.add(map, { kind: 'hand', side: 'right' })).toBe(true);
    const owner = new Survival(new Simulation({ seed: 1 }), inventory, new HandlingQueue(inventory), {
      reach,
      feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
      notice: () => undefined,
      readingLight: () => undefined,
      read: (request) => shown.push(request),
    });

    expect(owner.use(map)).toBeUndefined();
    expect(shown).toEqual([
      {
        kind: 'paperMap',
        ownerUid: map.uid,
        coverage: { x: -1, z: 2 },
        title: BUNDLED_CONTENT.registry.items.get('regional_map')!.name,
        itemType: 'regional_map',
      },
    ]);
  });

  it('refuses a held note with the reading-light reason and shows nothing', () => {
    const { registry } = admit(readable);
    const inventory = new Inventory(registry);
    const shown: ReadRequest[] = [];
    const owner = new Survival(new Simulation({ seed: 1 }), inventory, new HandlingQueue(inventory), {
      reach: bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5, clock: BASE_CLOCK }),
      feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
      notice: () => undefined,
      readingLight: () => 'fixture darkness',
      read: (value) => shown.push(value),
    });
    const note = inventory.create('note');
    expect(inventory.add(note, { kind: 'hand', side: 'right' })).toBe(true);
    expect(owner.use(note)).toBe('fixture darkness');
    expect(shown).toEqual([]);
  });

  const signSession = (hour: number) => {
    const { registry, issues } = admit(readable);
    expect(issues).toEqual([]);
    const shown: ReadRequest[] = [];
    const session = createSession({
      registry: {
        ...registry,
        zombies: BUNDLED_CONTENT.registry.zombies,
        siteGeneration: BUNDLED_CONTENT.registry.siteGeneration,
        dayCycle: BUNDLED_CONTENT.registry.dayCycle,
        ui: BUNDLED_CONTENT.registry.ui,
      },
      world: new World(),
      isSolid: () => false,
      isOpaque: () => false,
      scale: makeScale(0.5),
      seed: 1,
      start: hour * 3600,
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
    const sign = session.inventory.furnish({ type: 'sign', pos: [2, 0, 0], size: [1, 1, 1], facing: 'w' })!;
    return { registry, session, sign, shown };
  };

  it('refuses a sign in darkness and measures the light within the sign it admits', () => {
    const dark = signSession(0);
    expect(dark.session.readFurniture(dark.sign)).toBe(coreMessage(dark.registry, 'tooDarkToRead'));
    expect(dark.shown).toEqual([]);
    const lit = signSession(12);
    expect(lit.session.readFurniture(lit.sign)).toBeUndefined();
    const [request] = lit.shown;
    expect(request?.kind === 'text' && request.lightAt?.map(Math.floor)).toEqual(lit.sign.pos);
  });

  it('picks a wall-face plaque for reading and admits only its live in-reach owner', () => {
    const { session, sign, shown } = signSession(12);
    const target = pickInteractionTarget({
      inventory: session.inventory,
      entities: session.inventory.entities,
      origin: [0.5, 0.5, 0.5],
      direction: [1, 0, 0],
      maxDistance: 4,
      blockSize: 0.5,
      worldSeed: 1,
      isSolid: (x) => x === 3,
      isOpaque: () => false,
      hasModel: () => false,
    });
    expect(target).toMatchObject({ kind: 'furniture', entity: sign });
    if (target?.kind !== 'furniture') {
      throw new Error('The wall-face plaque must own the interaction');
    }
    const before = {
      time: session.sim.time,
      version: session.inventory.version,
      entities: session.inventory.entities.version,
    };
    const goneReason = session.readFurniture({ ...sign });
    expect(goneReason).toBeTruthy();
    expect(session.readFurniture(target.entity)).toBeUndefined();
    expect(shown).toMatchObject([{ kind: 'text', readable }]);
    expect({
      time: session.sim.time,
      version: session.inventory.version,
      entities: session.inventory.entities.version,
    }).toEqual(before);
    session.body.pos = [30, 1, 0];
    const farReason = session.readFurniture(sign);
    expect(farReason).toBeTruthy();
    expect(farReason).not.toBe(goneReason);
    expect(shown).toHaveLength(1);
    expect(session.queue.jobs).toHaveLength(0);
  });
  it('uses inventory-style live time and menu-pointer admission for the reading surface', () => {
    const goLabels = { play: 'fixture play', continue: 'fixture continue' };
    const menu = computeMenuState({
      started: true,
      mainMenuOpen: false,
      inventoryOpen: false,
      readingOpen: true,
      debugMenuOpen: false,
      pointerLocked: true,
      dead: false,
      goLabels,
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
      goLabels,
    });
    expect(escaped).toMatchObject({ paused: true, closeOtherMenus: true });
  });
});
