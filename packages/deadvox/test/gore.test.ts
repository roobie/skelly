import { InstancedMesh, Matrix4, MeshLambertMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BODY_REGIONS, type BodyRegion } from '../src/core/body.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { MapEntityStore } from '../src/core/entities.ts';
import { BLOCK_SIZE } from '../src/core/scale.ts';
import type { HitImpulse, Zombie } from '../src/core/zombies.ts';
import { Gore, type GoreBodies } from '../src/render/gore.ts';
import { PLAYER_REGION_BOXES } from '../src/render/playerFigure.ts';
import { WORLD_GRAVITY } from './playerFixture.ts';
import { GORE_TUNING_FIXTURE } from './presentationFixture.ts';

const floor = (_x: number, y: number, _z: number) => y < 0;
// A heavy downward hit just above the floor, so most droplets land within a few updates.
const lowHit: HitImpulse = { point: [0.5, 0.05, 0.5], direction: [0, -1, 0], impulse: 4 };
/** A wound dripping at the base rate and size. */
const BASE_DRIP = { rate: 1, size: 1 };

describe('Gore', () => {
  it('lights droplets and splats as the world is lit, shadows included', () => {
    const gore = new Gore(1, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
    const meshes = gore.group.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
    expect(meshes).toHaveLength(2);
    expect(meshes.every((mesh) => mesh.material instanceof MeshLambertMaterial)).toBe(true);
    expect(meshes.every((mesh) => mesh.receiveShadow)).toBe(true);
    gore.dispose();
  });

  it('starts at most the per-frame budget of droplets between two updates, however much is sprayed', () => {
    const gore = new Gore(1, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
    for (let spray = 0; spray < GORE_TUNING_FIXTURE.dropletCap; spray++) {
      gore.spray(lowHit, 100);
    }
    expect(gore.activeDroplets).toBe(GORE_TUNING_FIXTURE.dropletSpawnsPerFrame);
    gore.dispose();
  });

  it("gives a severed part's blood the part's launch velocity", () => {
    const gore = new Gore(1, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
    const partVelocity: Vec3 = [3, 0, 0];
    gore.severed(lowHit, partVelocity, {
      droplets: 2,
      speedMetresPerRealSecond: 0,
      spreadFraction: 0,
      lifetimeRealSeconds: 1,
      partVelocityShare: 1,
    });
    const { droplets } = gore as unknown as { droplets: { active: boolean; velocity: Vector3 }[] };
    const live = droplets.filter((droplet) => droplet.active);
    expect(live).toHaveLength(2);
    for (const droplet of live) {
      expect(droplet.velocity.x).toBeCloseTo(partVelocity[0]);
    }
    gore.dispose();
  });

  it.each(BODY_REGIONS)('starts $0 drips inside the drawn region in both views', (region) => {
    const yaw = 0.37;
    const playerPos: [number, number, number] = [4, 2, 7];
    const drip = (bleeding: BodyRegion) => (bleeding === region ? BASE_DRIP : undefined);

    const dripPosition = (thirdPerson: boolean): Vector3 => {
      const gore = new Gore(BLOCK_SIZE, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
      gore.update(1, floor, {
        zombies: new MapEntityStore<Zombie>(),
        listener: playerPos,
        player: { pos: playerPos, yaw, drip, thirdPerson },
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

    const regionBox = PLAYER_REGION_BOXES[region];
    const assertWithinDrawnRegion = (origin: Vector3): void => {
      const figureOrigin = new Vector3(...playerPos).multiplyScalar(BLOCK_SIZE);
      const worldX = origin.x - figureOrigin.x;
      const worldZ = origin.z - figureOrigin.z;
      const local = new Vector3(
        worldX * Math.cos(yaw) - worldZ * Math.sin(yaw),
        origin.y - figureOrigin.y,
        worldX * Math.sin(yaw) + worldZ * Math.cos(yaw),
      );
      const epsilon = 1e-5;
      for (const axis of [0, 1, 2] as const) {
        const halfSize = regionBox.size[axis] / 2;
        expect(local.getComponent(axis)).toBeGreaterThanOrEqual(regionBox.at[axis] - halfSize - epsilon);
        expect(local.getComponent(axis)).toBeLessThanOrEqual(regionBox.at[axis] + halfSize + epsilon);
      }
    };

    assertWithinDrawnRegion(dripPosition(false));
    assertWithinDrawnRegion(dripPosition(true));
  });

  it('stops player wound drips once the wound stops bleeding', () => {
    const gore = new Gore(1, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
    const bodies: GoreBodies = {
      zombies: new MapEntityStore<Zombie>(),
      listener: [0, 0, 0],
      player: {
        pos: [0, 0, 0],
        yaw: 0,
        drip: (region) => (region === 'leftArm' ? BASE_DRIP : undefined),
        thirdPerson: false,
      },
    };

    gore.update(1, floor, bodies);
    expect(gore.activeDroplets).toBeGreaterThan(0);
    gore.update(3, floor, { ...bodies, player: { ...bodies.player!, drip: () => undefined } });
    expect(gore.activeDroplets).toBe(0);
    gore.dispose();
  });

  it('keeps droplets and splats within their pools under a flood of sprays', () => {
    const gore = new Gore(1, WORLD_GRAVITY, GORE_TUNING_FIXTURE);
    const frames = Math.ceil(GORE_TUNING_FIXTURE.splatCap / GORE_TUNING_FIXTURE.dropletSpawnsPerFrame) * 3;
    for (let frame = 0; frame < frames; frame++) {
      for (let spray = 0; spray < GORE_TUNING_FIXTURE.dropletCap; spray++) {
        gore.spray(lowHit, 100);
      }
      expect(gore.activeDroplets).toBeLessThanOrEqual(GORE_TUNING_FIXTURE.dropletCap);
      gore.update(1 / 60, floor);
      expect(gore.activeSplats).toBeLessThanOrEqual(GORE_TUNING_FIXTURE.splatCap);
    }
    // The splat ring filled and then reused its oldest entries instead of growing.
    expect(gore.activeSplats).toBe(GORE_TUNING_FIXTURE.splatCap);
    gore.dispose();
  });
});
