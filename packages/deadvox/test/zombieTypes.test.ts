import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bodyPlanModel, figureVariantOf } from '../src/core/actorModels.ts';
import { posedActor } from '../src/core/actorPose.ts';

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const { actors } = readJson<{
  actors: {
    id: string;
    model: string;
    figure?: string;
    bodyScale?: number;
    spawnWeight: number;
    sounds: Record<string, string>;
  }[];
}>('src/content/base/enemies.json');
const soundDefs = readJson<{ sounds: { id: string }[] }>('src/content/base/sounds.json').sounds;
const soundById = new Map(soundDefs.map((sound) => [sound.id, sound]));

const figureForModel = (model: string, bodyScale?: number) =>
  posedActor({
    seed: 1,
    model,
    ...(bodyScale === undefined ? {} : { bodyScale }),
    position: [0, 0, 0],
    facing: [0, 0, -1],
    headYaw: 0,
    gaitPhase: 0,
    speed: 0,
    chasing: false,
    attackWindup: 0,
    attackWindupSeconds: 1,
    severed: [],
    blockSize: 1,
  }).figure;

describe('zombie type content', () => {
  it('poses every zombie with the model selected by its type data', () => {
    expect(actors.length).toBeGreaterThan(0);
    for (const actor of actors) {
      expect(figureForModel(figureVariantOf(actor), actor.bodyScale).genome.template).toBe(
        bodyPlanModel(figureVariantOf(actor)),
      );
    }
  });

  it('references registered vocal sounds for every zombie type', () => {
    const events = actors.flatMap(({ sounds }) => Object.values(sounds));
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(soundById.has(event)).toBe(true);
    }
  });
});
