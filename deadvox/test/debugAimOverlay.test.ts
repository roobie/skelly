import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type LineBasicMaterial, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { zombiePoseInputFor } from '../src/core/zombiePose.ts';
import { posedShamblerRegionBoxes } from '../src/core/zombieRegions.ts';
import { FISTS_MELEE, type Zombie, ZombieSystem } from '../src/core/zombies.ts';
import { DebugAimOverlay } from '../src/debug/aimOverlay.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const SCALE = makeScale(0.5);
const BLOCK_SIZE = SCALE.blockSize;
const FLOOR = (_x: number, y: number) => y === 0;

const standing = (position: Vec3, facing: Vec3) => {
  const system = new ZombieSystem({
    player: () => ({
      pos: [100, 1, 100],
      facing: [1, 0, 0],
      movement: 'still',
      lit: false,
      lightSeenFrom: 40,
    }),
    isSolid: FLOOR,
    isOpaque: FLOOR,
    hour: () => 12,
    blockSize: BLOCK_SIZE,
    physics: physicsFor(SCALE),
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    hurtPlayer: () => undefined,
  });
  const id = system.add(registry.zombies.get('shambler')!, position, facing);
  return { system, id, zombie: system.store.get(id)! };
};

const posed = (zombie: Zombie, id: number) => posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, BLOCK_SIZE));

const expectedVertices = (aim: NonNullable<ReturnType<ZombieSystem['aimAt']>>) => {
  const edges = [
    [0, 1],
    [0, 2],
    [0, 4],
    [1, 3],
    [1, 5],
    [2, 3],
    [2, 6],
    [3, 7],
    [4, 5],
    [4, 6],
    [5, 7],
    [6, 7],
  ] as const;
  return aim.boxes.flatMap((box) => {
    const corners = Array.from({ length: 8 }, (_, index) => {
      const local = [
        index & 1 ? box.halfSize[0] : -box.halfSize[0],
        index & 2 ? box.halfSize[1] : -box.halfSize[1],
        index & 4 ? box.halfSize[2] : -box.halfSize[2],
      ];
      return [0, 1, 2].map(
        (axis) =>
          box.center[axis]! * BLOCK_SIZE +
          box.rotation[axis * 3]! * local[0]! +
          box.rotation[axis * 3 + 1]! * local[1]! +
          box.rotation[axis * 3 + 2]! * local[2]!,
      );
    });
    return edges.flatMap(([a, b]) => [...corners[a]!, ...corners[b]!]);
  });
};

describe('debug melee aim overlay', () => {
  it('draws exactly the aimed posed region boxes in range/out-of-range colors and clears on no target', () => {
    const { system, id, zombie } = standing([4, 1, 4], [0, 0, -1]);
    const headBox = posed(zombie, id).head[0]!;
    const origin: Vec3 = [headBox.center[0], headBox.center[1] + 0.45 / BLOCK_SIZE, headBox.center[2]];
    const aim = system.aimAt(origin, [0, -1, 0], FISTS_MELEE)!;
    expect(aim.region).toBe('head');

    const overlay = new DebugAimOverlay(new Scene(), BLOCK_SIZE);
    overlay.update(aim);
    expect(overlay.aimedBoxes).toEqual(aim.boxes);
    expect((overlay.line.material as LineBasicMaterial).color.getHex()).toBe(0x00_ff_50);
    const expected = expectedVertices(aim);
    const position = overlay.line.geometry.getAttribute('position');
    expect(position.count).toBe(expected.length / 3);
    expected.forEach((value, index) => {
      const vertex = Math.floor(index / 3);
      const coordinates = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)];
      expect(Math.abs(coordinates[index % 3]! - value)).toBeLessThanOrEqual(0.001);
    });

    const { system: distantSystem, id: distantId, zombie: distantZombie } = standing([6 / BLOCK_SIZE, 1, 0], [1, 0, 0]);
    const distantOrigin: Vec3 = [0, 1 + PLAYER.eye / BLOCK_SIZE, 0];
    const distantHead = posed(distantZombie, distantId).head[0]!;
    const distantDirection: Vec3 = [
      distantHead.center[0] - distantOrigin[0],
      distantHead.center[1] - distantOrigin[1],
      distantHead.center[2] - distantOrigin[2],
    ];
    const distantAim = distantSystem.aimAt(distantOrigin, distantDirection, FISTS_MELEE)!;
    expect(distantAim.inReach).toBe(false);
    overlay.update(distantAim);
    expect((overlay.line.material as LineBasicMaterial).color.getHex()).toBe(0xff_b5_00);

    overlay.update(undefined);
    expect(overlay.aimedBoxes).toEqual([]);
    expect(overlay.line.visible).toBe(false);
    expect(overlay.line.geometry.getAttribute('position').count).toBe(0);
    overlay.dispose();
  });
});
