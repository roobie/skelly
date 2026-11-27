import type { Vec3 } from '@skelly/engine/internal/core/coords.ts';
import { World } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { fixtureBlockMaterial } from './blockMaterialFixture.ts';

describe('sideways support invalidation', () => {
  it.each([2.5, 1])('queues only the non-beam diamond and beam axis lines with override %s metres', (override) => {
    const blockSize = 0.25;
    const ordinary = { ...fixtureBlockMaterial('fixture_cube'), span: 0.75 };
    const member = { ...ordinary, id: 'fixture_member', span: 1.5 };
    const cube = { id: 'fixture_cube', name: 'Fixture cube', material: ordinary.id, solid: true, color: '#888888' };
    const registry = baseRegistry();
    registry.blockMaterials.set(ordinary.id, ordinary);
    registry.blockMaterials.set(member.id, member);
    registry.blocks.splice(
      1,
      registry.blocks.length - 1,
      cube,
      { ...cube, id: 'fixture_override', material: member.id, loadPath: { kind: 'beam', axis: 'x', span: override } },
      { ...cube, id: 'fixture_fallback', material: member.id, loadPath: { kind: 'beam', axis: 'z' } },
    );
    const world = new World();
    const centre: Vec3 = [-16, 3, -17];
    world.support.enqueueSideways(registry, centre, blockSize);
    const { frontier } = world.support.snapshotState();
    const queued = new Set(frontier.map(({ cell }) => cell.join(',')));
    const diamond = Math.floor(ordinary.span / blockSize);
    const line = Math.floor(Math.max(override, member.span) / blockSize);
    expect(queued.size).toBe(frontier.length);
    expect(frontier.every(({ lostFloor }) => !lostFloor)).toBe(true);
    const expectedCells: string[] = [];
    for (let x = -line - 1; x <= line + 1; x++) {
      for (let z = -line - 1; z <= line + 1; z++) {
        const distance = Math.abs(x) + Math.abs(z);
        const expected = distance > 0 && (distance <= diamond || ((x === 0 || z === 0) && distance <= line));
        if (expected) {
          expectedCells.push([centre[0] + x, centre[1], centre[2] + z].join(','));
        }
      }
    }
    expect(queued).toEqual(new Set(expectedCells));
  });
});
