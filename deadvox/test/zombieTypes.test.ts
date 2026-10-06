import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { zombieFigure } from '@mobgen/mob/shamblerFigure.ts';

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const zombies = readJson<{ zombies: { id: string; model: string; spawnWeight: number; sounds: Record<string, string> }[] }>(
  'src/content/base/zombies.json',
).zombies;
const soundDefs = readJson<{ sounds: { id: string; pitchJitter: readonly [number, number] }[] }>(
  'src/content/base/sounds.json',
).sounds;
const soundById = new Map(soundDefs.map((sound) => [sound.id, sound]));

const bodyHeight = (model: string) => {
  const bones = zombieFigure(model, 1).realized.body.bones;
  const heights = bones.flatMap(({ head, tail }) => [head[1], tail[1]]);
  return Math.max(...heights) - Math.min(...heights);
};

describe('runner and crawler type content', () => {
  it('runner selects the mobgen runner silhouette, taller than the shambler', () => {
    const runner = zombies.find(({ id }) => id === 'runner')!;
    const shambler = zombies.find(({ id }) => id === 'shambler')!;
    expect(zombieFigure(runner.model, 1).genome.template).toBe('runner');
    expect(bodyHeight(runner.model)).toBeGreaterThan(bodyHeight(shambler.model));
  });

  it('authored runner and crawler spawn weights are rarer than the shambler baseline', () => {
    const weight = (id: string) => zombies.find((zombie) => zombie.id === id)!.spawnWeight;
    expect(weight('runner')).toBeLessThan(weight('shambler'));
    expect(weight('crawler')).toBeLessThan(weight('shambler'));

  });

  it('each zombie type maps to separate, registered vocal sound events', () => {
    const types = zombies.filter(({ id }) => ['shambler', 'runner', 'crawler'].includes(id));
    const events = types.flatMap(({ sounds }) => Object.values(sounds));
    expect(events).toHaveLength(types.length * 4);
    expect(new Set(events).size).toBe(events.length);
    for (const event of events) {
      expect(soundById.has(event)).toBe(true);
    }

    const event = (typeId: string, key: string) => {
      const type = types.find(({ id }) => id === typeId)!;
      return soundById.get(type.sounds[key]!)!;
    };
    expect(event('runner', 'attack').pitchJitter[0]).toBeGreaterThan(event('shambler', 'attack').pitchJitter[1]);
    expect(event('crawler', 'attack').pitchJitter[1]).toBeLessThan(event('shambler', 'attack').pitchJitter[0]);
  });
});
