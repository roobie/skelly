import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bodyIsClear, findShamblerBenchPlayer, placeShamblerRing } from '../src/bench/shamblerPlacement.ts';
import { createHeadlessShamblerWorld } from '../src/bench/shamblerWorld.ts';
import { buildRegistry } from '../src/core/content.ts';
import { createPlayerBody } from '../src/game/player.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);

describe('shared shambler benchmark placement', () => {
  it('uses the browser placement path for seed 1 N=10 and clears hamlet terrain and furniture', () => {
    const engine = createHeadlessShamblerWorld(1, registry);
    const player = findShamblerBenchPlayer(engine);
    const positions = placeShamblerRing({ count: 10, seed: 1, player, engine });
    const s = engine.config.scale.blockSize;
    const halfWidth = 0.28 / s;

    expect(positions).toHaveLength(10);
    expect(engine.loadedColumns).toBeGreaterThan(0);
    expect(engine.loadedChunks).toBeGreaterThanOrEqual(engine.loadedColumns);
    for (let i = 0; i < positions.length; i++) {
      const position = positions[i]!;
      const body = createPlayerBody(engine.config.scale, ...position);
      body.halfWidth = halfWidth;
      body.height = 1.7 / s;
      body.onGround = true;
      expect(bodyIsClear(body, engine.isSolid)).toBe(true);
      const distance = Math.hypot((position[0] - player.pos[0]) * s, (position[2] - player.pos[2]) * s);
      expect(distance).toBeGreaterThanOrEqual(8);
      expect(distance).toBeLessThanOrEqual(20);
      for (const other of positions.slice(0, i)) {
        expect(
          Math.abs(position[0] - other[0]) >= halfWidth * 2 || Math.abs(position[2] - other[2]) >= halfWidth * 2,
        ).toBe(true);
      }
    }
  });
});
