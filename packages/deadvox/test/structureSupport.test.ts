import type { Vec3 } from '@skelly/engine/internal/core/coords.ts';
import { createSupport, type SupportView } from '@skelly/engine/internal/core/structureSupport.ts';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { fixtureBlockMaterial } from './blockMaterialFixture.ts';

const registry = baseRegistry();
const fixtureBlock = (id: string, span: number): number => {
  const material = `support_fixture_${id}`;
  registry.blockMaterials.set(material, { ...fixtureBlockMaterial(id), id: material, span });
  registry.blockIds.set(id, registry.blocks.length);
  registry.blocks.push({ id, name: id, material, solid: true, color: '#888888' });
  return registry.blockIds.get(id)!;
};
const GROUND = fixtureBlock('support_fixture_ground', 0);
const BEAM = fixtureBlock('support_fixture_beam', 2);
const POST = fixtureBlock('support_fixture_post', 0);

/** Ground fills y <= 0 and every ground block is natural; every other cell is what the case sets. */
const world = (cells: readonly (readonly [Vec3, number])[]) => {
  const placed = new Map(cells.map(([cell, id]) => [cell.join(','), id]));
  const block = (x: number, y: number, z: number) => placed.get(`${x},${y},${z}`) ?? (y <= 0 ? GROUND : 0);
  const view: SupportView = { minY: -4, maxY: 16, block, natural: (x, y, z) => block(x, y, z) === GROUND };
  return createSupport(registry, view);
};
const column = (x: number, height: number, id = POST): [Vec3, number][] =>
  Array.from({ length: height }, (_, at) => [[x, at + 1, 0], id]);

describe('structure support', () => {
  it('holds a column standing on natural ground and drops one whose foot is gone', () => {
    expect(world(column(0, 3)).holds([0, 3, 0])).toBe(true);
    expect(world(column(0, 3).slice(1)).holds([0, 3, 0])).toBe(false);
  });

  it('holds a sideways run as far as the cell’s own span reaches a standing cell, and no further', () => {
    const beams = (length: number, id = BEAM): [Vec3, number][] =>
      Array.from({ length }, (_, at) => [[at + 1, 3, 0], id]);
    const support = world([...column(0, 3), ...beams(3)]);
    expect(support.holds([2, 3, 0])).toBe(true);
    // Held beams don't anchor further beams, so spans never chain into an endless cantilever.
    expect(support.holds([3, 3, 0])).toBe(false);
    // Reach is the far cell's own span, not the post's: a zero-span cell hangs from nothing.
    expect(world([...column(0, 3), ...beams(1, POST)]).holds([1, 3, 0])).toBe(false);
  });

  it('holds a corner through a two-step bend even when the intermediate cell has no span', () => {
    const support = world([...column(0, 3), [[1, 3, 0], POST], [[1, 3, 1], BEAM]]);
    expect(support.holds([1, 3, 1])).toBe(true);
  });

  it('rejects a bent path one step beyond the querying cell’s span', () => {
    const support = world([...column(0, 3), [[1, 3, 0], BEAM], [[1, 3, 1], BEAM], [[2, 3, 1], BEAM]]);
    expect(support.holds([1, 3, 1])).toBe(true);
    expect(support.holds([2, 3, 1])).toBe(false);
  });

  it('does not end a bent run at a merely sideways-held cell', () => {
    const support = world([
      ...column(0, 3),
      [[1, 3, 0], BEAM],
      [[2, 3, 0], BEAM],
      [[2, 3, 1], BEAM],
      [[3, 3, 1], BEAM],
    ]);
    expect(support.holds([2, 3, 0])).toBe(true);
    expect(support.holds([3, 3, 1])).toBe(false);
  });

  it('lets natural ground beside a cell hold it sideways', () => {
    expect(world([...column(0, 3, GROUND), [[1, 3, 0], BEAM]]).holds([1, 3, 0])).toBe(true);
  });

  it('holds a cell on any held solid cell, whatever its material', () => {
    expect(world([...column(0, 1), [[0, 2, 0], BEAM], [[0, 3, 0], POST]]).holds([0, 3, 0])).toBe(true);
  });
});
