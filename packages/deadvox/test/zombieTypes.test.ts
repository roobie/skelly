import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { actorFigure } from '../src/core/actorFigureFiles.ts';
import { bodyPlanModel, figureVariantOf } from '../src/core/actorModels.ts';
import { posedActor } from '../src/core/actorPose.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';

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
}>('mods/skelly.deadvox.actors/enemies.json');
const soundDefs = readJson<{ sounds: { id: string }[] }>('mods/skelly.deadvox.actors/actors-sounds.json').sounds;
const soundById = new Map(soundDefs.map((sound) => [sound.id, sound]));

const FIGURES = stackActorFigureFiles(baseRegistry());

/** The model a pose was built from: the built body's model when the posed skeleton is that body's. */
const posedModel = (type: { readonly id: string }, model: string, bodyScale?: number): string | undefined => {
  const figure = actorFigure(FIGURES, type, 1);
  const posed = posedActor({
    figure,
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
  });
  const ids = (bones: readonly { readonly id: string }[]): string => bones.map(({ id }) => id).join();
  return ids(posed.bones) === ids(figure.body.bones) ? figure.body.model : undefined;
};

describe('zombie type content', () => {
  it('poses every zombie with the model selected by its type data', () => {
    expect(actors.length).toBeGreaterThan(0);
    for (const actor of actors) {
      expect(posedModel(actor, figureVariantOf(actor), actor.bodyScale)).toBe(bodyPlanModel(figureVariantOf(actor)));
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
