import { parse, safeParse } from 'valibot';
import { expect, it } from 'vitest';
import { actorPoseInputFor } from '../src/core/actorPose.ts';
import { posedHumanoidRegionBoxes } from '../src/core/actorRegions.ts';
import type { Registry } from '../src/core/content.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { ContentFileSchema } from '../src/core/schema.ts';
import { siteGenerationOf } from '../src/core/sitePalette.ts';
import { contentLookup as registryContentLookup } from '../src/ui/saveController.ts';
import { stackActorFigureFiles, withFixtureFigures } from './baseContentFiles.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { capture, createRuntime, encodeFixture, formatVersion, registry, scale } from './snapshotTestSupport.ts';

const driven = [...registry.actors.values()].find((row) => row.agent && row.model === 'humanoid')!;
const { agent: _agent, attack: _attack, chaseMotion: _chaseMotion, ...bodyRow } = driven;
const body = parse(ContentFileSchema, { actors: [{ ...bodyRow, id: 'fixture_undriven' }] }).actors![0]!;
const content = { ...registry, actors: new Map(registry.actors).set(body.id, body) };
const fixtureFigures = { [body.id]: driven.id };
const figures = withFixtureFigures(stackActorFigureFiles(content), fixtureFigures);
const runtime = (snapshot: Parameters<typeof createRuntime>[0], rows: Registry) =>
  createRuntime(snapshot, false, undefined, { registry: rows, fixtureFigures });

it.each(['attack', 'chaseMotion'] as const)('refuses an agent content row without %s', (trait) => {
  const row = { ...driven, [trait]: undefined };
  expect(safeParse(ContentFileSchema, { actors: [row] }).success).toBe(false);
});

it('an agentless content body ticks, takes a hit and saves without decision state; restore enforces content presence', async () => {
  const source = runtime(undefined, content);
  const { pos } = source.player.body;
  const id = source.zombies.add(body, [pos[0] + 4, pos[1] + 4, pos[2]], [0, 0, 1]);
  const actor = source.zombies.store.get(id)!;
  expect(actor).not.toHaveProperty('agent');
  const [, height] = actor.body.pos;
  source.zombies.tickActive(1 / 60);
  expect(actor.body.pos[1]).toBeLessThan(height);
  const farId = source.zombies.add(body, [
    pos[0] + (siteGenerationOf(content).activeActorRadiusMetres + 1) / scale.blockSize,
    pos[1] + 4,
    pos[2],
  ]);
  const farActor = source.zombies.store.get(farId)!;
  const [, farHeight] = farActor.body.pos;
  source.zombies.tickActive(1 / 60);
  expect(farActor.tier).toBe('background');
  expect(farActor.body.pos[1]).toBe(farHeight);
  source.zombies.tickBackground(1 / 60, 1 / 60);
  expect(farActor.body.pos[1]).toBeLessThan(farHeight);
  const posed = posedHumanoidRegionBoxes(
    actorPoseInputFor(actor, id, { blockSize: scale.blockSize, actorFigureFiles: figures }),
  );
  const { center } = posed.leftArm[0]!;
  const health = () => Object.values(actor.regions).reduce((sum, value) => sum + value, 0);
  const before = health();
  expect(source.zombies.swing([center[0] - 1, center[1], center[2]], [1, 0, 0], FISTS_MELEE)).toBe(id);
  expect(health()).toBeLessThan(before);
  const saved = capture(source);
  expect(saved.world.actors.actors.find((entry) => entry.id === id)!.actor).not.toHaveProperty('agent');
  const decoded = await decodeSave(await encodeFixture(saved), {
    version: formatVersion,
    contentLookup: (kind, key, item) => registryContentLookup(content, kind, key, item),
  });
  const restored = runtime(decoded.snapshot, content);
  expect(restored.zombies.snapshotState()).toEqual(source.zombies.snapshotState());
  expect(restored.zombies.store.get(id)).not.toHaveProperty('agent');

  const withAgent = {
    ...content,
    actors: new Map(content.actors).set(body.id, {
      ...body,
      agent: driven.agent,
      attack: driven.attack,
      chaseMotion: driven.chaseMotion,
    }),
  };
  expect(() => runtime(decoded.snapshot, withAgent)).toThrow('agent presence');
  const drivenSource = runtime(undefined, withAgent);
  drivenSource.zombies.add(withAgent.actors.get(body.id)!, [pos[0] + 4, pos[1], pos[2]]);
  expect(() => runtime(capture(drivenSource), content)).toThrow('agent presence');

  for (const state of [{ attackWindup: 1 }, { attackWait: 1 }, { chaseStance: true }]) {
    const invalid = structuredClone(decoded.snapshot);
    Object.assign(invalid.world.actors.actors.find((entry) => entry.id === id)!.actor, state);
    expect.soft(() => runtime(invalid, content), JSON.stringify(state)).toThrow('Invalid zombie state');
  }

  const corrupt = structuredClone(decoded.snapshot);
  corrupt.world.actors.actors.find((entry) => entry.id === id)!.actor.footstepClock.distanceUntilStep = 0;
  expect(() => runtime(corrupt, content)).toThrow('Invalid zombie state');
});
