import { readdirSync, readFileSync } from 'node:fs';
import { PerspectiveCamera, Scene } from 'three';
import { expect, it } from 'vitest';
import { createBenchLightFixture } from '../src/bench/lightFixture.ts';
import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import type { RenderedEngine } from '../src/game/engine.ts';

const read = (source: string): ContentSource => ({ source, data: JSON.parse(readFileSync(source, 'utf8')) });
const { registry } = buildRegistry(
  readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => read(`src/content/base/${file}`)),
);

it('uses the game sprint rule to reduce active sources in the benchmark fixture', () => {
  const engine = {
    config: { seed: 1, scale: { blockSize: 1 } },
    registry,
    scene: new Scene(),
    spawn: { pos: [0, 0, 0] },
    groundAt: () => 0,
  } as unknown as RenderedEngine;
  const fixture = createBenchLightFixture(engine, 0);
  try {
    const before = [...fixture.inventory.items()].filter(({ item }) => item.on);
    const sprintDouses = before.filter(({ item }) => registry.items.get(item.type)?.light?.burning?.sprint === 'douse');
    expect(sprintDouses.length).toBeGreaterThan(0);
    fixture.update(new PerspectiveCamera(), 1);
    fixture.setSprinting(true);
    expect(fixture.activeCount()).toBe(before.length - sprintDouses.length);
  } finally {
    fixture.dispose();
  }
});
