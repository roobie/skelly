import { InstancedMesh, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BODY_REGIONS, type BodyWounds } from '../src/core/body.ts';
import { MapEntityStore } from '../src/core/entities.ts';
import { FIGURE_BOXES } from '../src/core/zombieRegions.ts';
import type { HitImpulse, Zombie } from '../src/core/zombies.ts';
import { PLAYER_ARM_BOXES } from '../src/render/figure.ts';
import { DROPLET_CAP, DROPLET_SPAWNS_PER_FRAME, Gore, type GoreBodies, SPLAT_CAP } from '../src/render/gore.ts';

const floor = (_x: number, y: number, _z: number) => y < 0;
// A heavy downward hit just above the floor, so most droplets land within a few updates.
const lowHit: HitImpulse = { point: [0.5, 0.05, 0.5], direction: [0, -1, 0], impulse: 4 };

describe('Gore', () => {
  it('starts at most the per-frame budget of droplets between two updates, however much is sprayed', () => {
    const gore = new Gore(1);
    for (let spray = 0; spray < DROPLET_CAP; spray++) {
      gore.spray(lowHit, 100);
    }
    expect(gore.activeDroplets).toBe(DROPLET_SPAWNS_PER_FRAME);
    gore.dispose();
  });

  it.each(BODY_REGIONS)('keeps $0 drips on the same avatar region in both views', (region) => {
    const yaw = 0.37;
    const playerPos: [number, number, number] = [4, 2, 7];
    const avatarBoxes = [...Object.values(FIGURE_BOXES), ...Object.values(PLAYER_ARM_BOXES)];
    const avatarHorizontalRadius = Math.max(
      ...avatarBoxes.map(({ at, size }) => Math.hypot(Math.abs(at[0]) + size[0] / 2, Math.abs(at[2]) + size[2] / 2)),
    );
    const wounds: BodyWounds = {
      head: null,
      torso: null,
      leftArm: null,
      rightArm: null,
      leftLeg: null,
      rightLeg: null,
    };
    wounds[region] = {
      bleeding: 'moderate',
      bleedingSimSeconds: 0,
      infection: 'none',
      infectionGameSeconds: 0,
      infectionAtRisk: false,
    };

    const dripPosition = (thirdPerson: boolean): Vector3 => {
      const gore = new Gore(1);
      gore.update(1, floor, {
        zombies: new MapEntityStore<Zombie>(),
        listener: playerPos,
        player: { pos: playerPos, yaw, wounds, thirdPerson },
      });
      expect(gore.activeDroplets).toBe(1);
      const mesh = gore.group.children.find((child): child is InstancedMesh => child instanceof InstancedMesh);
      if (!mesh) {
        throw new Error('Gore has no droplet mesh');
      }
      const matrix = new Matrix4();
      mesh.getMatrixAt(0, matrix);
      const position = new Vector3().setFromMatrixPosition(matrix);
      gore.dispose();
      return position;
    };

    const firstPersonOrigin = dripPosition(false);
    const thirdPersonOrigin = dripPosition(true);
    const horizontalOffset = new Vector3(firstPersonOrigin.x - playerPos[0], 0, firstPersonOrigin.z - playerPos[2]);
    const lookDirection = new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));

    expect(firstPersonOrigin.distanceTo(thirdPersonOrigin)).toBeLessThan(1e-9);
    expect(Math.hypot(horizontalOffset.x, horizontalOffset.z)).toBeLessThan(avatarHorizontalRadius);
    expect(Math.abs(horizontalOffset.dot(lookDirection))).toBeLessThan(1e-6);
  });

  it('stops player wound drips after treatment', () => {
    const gore = new Gore(1);
    const wounds: BodyWounds = {
      head: null,
      torso: null,
      leftArm: {
        bleeding: 'moderate',
        bleedingSimSeconds: 0,
        infection: 'none',
        infectionGameSeconds: 0,
        infectionAtRisk: false,
      },
      rightArm: null,
      leftLeg: null,
      rightLeg: null,
    };
    const bodies: GoreBodies = {
      zombies: new MapEntityStore<Zombie>(),
      listener: [0, 0, 0],
      player: {
        pos: [0, 0, 0],
        yaw: 0,
        wounds,
        thirdPerson: false,
      },
    };

    gore.update(1, floor, bodies);
    expect(gore.activeDroplets).toBeGreaterThan(0);
    gore.update(3, floor, {
      ...bodies,
      player: {
        ...bodies.player!,
        wounds: { ...wounds, leftArm: { ...wounds.leftArm!, bleeding: null } },
      },
    });
    expect(gore.activeDroplets).toBe(0);
    gore.dispose();
  });

  it('keeps droplets and splats within their pools under a flood of sprays', () => {
    const gore = new Gore(1);
    const frames = Math.ceil(SPLAT_CAP / DROPLET_SPAWNS_PER_FRAME) * 3;
    for (let frame = 0; frame < frames; frame++) {
      for (let spray = 0; spray < DROPLET_CAP; spray++) {
        gore.spray(lowHit, 100);
      }
      expect(gore.activeDroplets).toBeLessThanOrEqual(DROPLET_CAP);
      gore.update(1 / 60, floor);
      expect(gore.activeSplats).toBeLessThanOrEqual(SPLAT_CAP);
    }
    // The splat ring filled and then reused its oldest entries instead of growing.
    expect(gore.activeSplats).toBe(SPLAT_CAP);
    gore.dispose();
  });
});
