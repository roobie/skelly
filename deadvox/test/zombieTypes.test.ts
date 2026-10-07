import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { posedShambler } from '../src/core/zombiePose.ts';

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const { zombies } = readJson<{
  zombies: { id: string; model: string; spawnWeight: number; sounds: Record<string, string> }[];
}>('src/content/base/zombies.json');
const soundDefs = readJson<{ sounds: { id: string }[] }>('src/content/base/sounds.json').sounds;
const soundById = new Map(soundDefs.map((sound) => [sound.id, sound]));

const figureForModel = (model: string) =>
  posedShambler({
    seed: 1,
    model,
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

describe('runner and crawler type content', () => {
  it('poses every zombie with the model selected by its type data', () => {
    for (const zombie of zombies) {
      expect(figureForModel(zombie.model).genome.template).toBe(zombie.model);
    }
  });

  it('authors the runner as rarer than the shambler', () => {
    const weight = (id: string) => zombies.find((zombie) => zombie.id === id)!.spawnWeight;
    expect(weight('runner')).toBeLessThan(weight('shambler'));
  });

  it('registers distinct vocal sound events for every zombie type', () => {
    const events = zombies.flatMap(({ sounds }) => Object.values(sounds));
    expect(new Set(events).size).toBe(events.length);
    for (const event of events) {
      expect(soundById.has(event)).toBe(true);
    }
  });
});
