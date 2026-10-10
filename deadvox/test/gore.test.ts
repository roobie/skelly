import { InstancedMesh, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MapEntityStore } from '../src/core/entities.ts';
import type { HitImpulse, Zombie } from '../src/core/zombies.ts';
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

  it.each([Math.PI / 2, -Math.PI / 2])('places a left-arm drip to the left of a side-on view (%s)', (yaw) => {
    const gore = new Gore(1);
    const eye: [number, number, number] = [0, 1.62, 0];
    const lookDirection: [number, number, number] = [0, 0, -1];
    const wounds = {
      head: null,
      torso: null,
      leftArm: { bleeding: true, infection: 'none' as const, infectionGameSeconds: 0, infectionAtRisk: false },
      rightArm: null,
      leftLeg: null,
      rightLeg: null,
    };
    gore.update(1, floor, {
      zombies: new MapEntityStore<Zombie>(),
      listener: [0, 0, 0],
      player: { pos: [0, 0, 0], yaw, wounds, eye, lookDirection, thirdPerson: false },
    });

    const mesh = gore.group.children.find((child): child is InstancedMesh => child instanceof InstancedMesh);
    if (!mesh) {
      throw new Error('Gore has no droplet mesh');
    }
    const matrix = new Matrix4();
    mesh.getMatrixAt(0, matrix);
    const position = new Vector3().setFromMatrixPosition(matrix);
    const cameraRightX = Math.cos(yaw);
    const cameraRightZ = -Math.sin(yaw);
    const viewCenterX = eye[0] + lookDirection[0] * 1.5;
    const viewCenterZ = eye[2] + lookDirection[2] * 1.5;
    const offsetAlongCameraRight =
      (position.x - viewCenterX) * cameraRightX + (position.z - viewCenterZ) * cameraRightZ;

    expect(offsetAlongCameraRight).toBeLessThan(0);
    gore.dispose();
  });

  it.each([
    { thirdPerson: false, view: 'first person' },
    { thirdPerson: true, view: 'third person' },
  ])('drips from player wounds in $view and stops after treatment', ({ thirdPerson }) => {
    const gore = new Gore(1);
    const wounds = {
      head: null,
      torso: null,
      leftArm: { bleeding: true, infection: 'none' as const, infectionGameSeconds: 0, infectionAtRisk: false },
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
        eye: [0, 1.62, 0],
        lookDirection: [0, 0, -1],
        thirdPerson,
      },
    };

    gore.update(1, floor, bodies);
    expect(gore.activeDroplets).toBeGreaterThan(0);
    gore.update(3, floor, {
      ...bodies,
      player: {
        ...bodies.player!,
        wounds: { ...wounds, leftArm: { ...wounds.leftArm!, bleeding: false } },
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
