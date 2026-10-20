import { PerspectiveCamera, Scene } from 'three';
import { expect, it } from 'vitest';
import { createBenchLightFixture } from '../src/bench/lightFixture.ts';
import type { RenderedEngine } from '../src/game/engine.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();

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
