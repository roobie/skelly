import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { decodeSave } from '../src/core/saveFormat.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { baseRegistry } from './baseRegistry.ts';
import { buildFixtureRegistry, FIXTURE_MATERIAL } from './economyFixtures.ts';
import { capture, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const methodId = 'fixture_method';
const qualityId = 'fixture_quality';
const fixture = (admitted: string[]) => ({
  furnitureMaterials: [{ id: FIXTURE_MATERIAL, methods: admitted }],
  furniture: [
    {
      id: 'fixture_door',
      name: 'Fixture door',
      size: [2, 4, 1],
      color: '#777777',
      door: {
        handlingSimSeconds: 0.5,
        methods: {
          [methodId]: {
            quality: 'fixture_quality',
            level: 2,
            skill: 'mechanics',
            timeSimSeconds: 10,
            fastestTimeSimSeconds: 5,
            strikeIntervalSimSeconds: 1,
            strikeSound: 'fixture_strike',
          },
        },
      },
    },
  ],
  sounds: [{ ...baseSounds(), id: 'fixture_strike' }],
  items: [
    {
      id: 'fixture_wrong_tool',
      name: 'Wrong tool',
      category: 'tool',
      size: [1, 1],
      weight: 1,
      tool: { qualities: { prying: 5, cutting: 5 } },
    },
    {
      id: 'fixture_tool',
      name: 'Fixture tool',
      category: 'tool',
      size: [1, 1],
      weight: 1,
      tool: { qualities: { [qualityId]: 2 } },
    },
  ],
});
const base = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({
    source: file,
    data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown,
  }));
const baseSounds = () => [...baseRegistry().sounds.values()].find((sound) => sound.noise.enabled)!;
const source = (methods: string[]) => ({ source: 'forcing-fixture', data: fixture(methods) });

it('rejects a door method outside its material admission even when the method itself is valid', () => {
  const minimal = (methods: string[]) => [
    { source: 'forcing-skills', data: { skills: [{ id: 'mechanics', name: 'Mechanics' }] } },
    source(methods),
  ];
  expect(buildFixtureRegistry(minimal(['fixture_method'])).issues).toEqual([]);
  const rejected = buildFixtureRegistry(minimal([])).issues;
  expect(rejected).toEqual([
    expect.objectContaining({
      path: 'furniture[0].door.methods.fixture_method',
      message: expect.stringContaining('does not admit'),
    }),
  ]);
});

it('starts only with the data-named quality and preserves the interrupted method and its strike sound through save', async () => {
  const { registry, issues } = buildFixtureRegistry([...base, source(['fixture_method'])]);
  expect(issues).toEqual([]);
  const runtime = createRuntime(undefined, false, undefined, { registry, spawn: [0, 1, 0] });
  const floor = registry.blocks.find((block) => block.solid)!;
  const placeFloor = (target: typeof runtime) => {
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 3; z++) {
        target.world.setBlock(x, 0, z, registry.blockIds.get(floor.id)!);
      }
    }
  };
  placeFloor(runtime);
  const door = runtime.inventory.furnish({
    type: 'fixture_door',
    pos: [0, 1, 1],
    size: [2, 4, 1],
    facing: 'n',
    lock: { id: 'fixture_lock', locked: true },
  })!;
  const hand = runtime.inventory.hands.left!;
  expect(runtime.inventory.consume(hand)).toBe(true);
  const wrong = runtime.inventory.create('fixture_wrong_tool');
  expect(runtime.inventory.add(wrong, { kind: 'hand', side: 'left' })).toBe(true);
  expect(runtime.session.forceDoor(door, wrong.uid)).toBeTypeOf('string');
  expect(runtime.sim.actions.job).toBeUndefined();
  expect(runtime.inventory.consume(wrong)).toBe(true);
  const tool = runtime.inventory.create('fixture_tool');
  expect(runtime.inventory.add(tool, { kind: 'hand', side: 'left' })).toBe(true);
  expect(runtime.session.forceDoor(door, tool.uid)).toBeUndefined();
  runtime.sim.scheduler.advance(2);
  expect(runtime.heardSounds.some(({ event }) => event === 'fixture_strike')).toBe(true);
  runtime.sim.emit({ kind: 'interrupt', reason: 'Fixture interruption' });
  runtime.sim.frame(0.1);
  const saved = runtime.sim.actions.job;
  expect(saved).toMatchObject({ jobType: 'forceDoor', method: 'fixture_method', stopped: true });
  const bytes = await encodeFixture(capture(runtime));
  const decoded = await decodeSave(bytes, {
    version: formatVersion,
    contentLookup: (kind, id) => contentLookup(registry, kind, id),
  });
  const loaded = createRuntime(decoded.snapshot, false, undefined, { registry });
  placeFloor(loaded);
  expect(loaded.sim.actions.job).toEqual(saved);
  expect(loaded.sim.actions.resume()).toBeUndefined();
  loaded.sim.scheduler.advance(12);
  expect(loaded.entities.byUid(door.uid)!.lock).toBeUndefined();
});
