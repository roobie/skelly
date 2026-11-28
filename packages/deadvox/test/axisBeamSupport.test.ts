import type { Vec3 } from '@skelly/engine/internal/core/coords.ts';
import { createSupport } from '@skelly/engine/internal/core/structureSupport.ts';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { fixtureBlockMaterial } from './blockMaterialFixture.ts';

const fixture = (axis: 'x' | 'z', length: number, naturalEnds = false) => {
  const registry = baseRegistry();
  const blockSize = 0.25;
  const material = { ...fixtureBlockMaterial('fixture_post'), span: blockSize };
  registry.blockMaterials.set(material.id, material);
  const add = (id: string, path?: 'x' | 'z') => {
    const block = registry.blocks.length;
    registry.blocks.push({
      id,
      name: id,
      material: material.id,
      solid: true,
      color: '#888888',
      ...(path ? { loadPath: { kind: 'beam', axis: path, span: 1.75 } as const } : {}),
    });
    return block;
  };
  const post = add('fixture_post');
  const beam = add('fixture_beam', axis);
  const crossed = add('fixture_crossed', axis === 'x' ? 'z' : 'x');
  const cells = new Map<string, number>();
  const at = (along: number, y = 3, across = 0): Vec3 =>
    axis === 'x' ? [along - 16, y, across - 17] : [across - 16, y, along - 17];
  const put = (cell: Vec3, id: number) => cells.set(cell.join(','), id);
  const end = (along: number) => {
    for (let y = naturalEnds ? 3 : 1; y <= 3; y++) {
      put(at(along, y), post);
    }
  };
  end(0);
  end(length + 1);
  const run = Array.from({ length }, (_, index) => at(index + 1));
  for (const cell of run) {
    put(cell, beam);
  }
  const support = () =>
    createSupport(registry, {
      blockSize,
      minY: 1,
      maxY: 8,
      block: (x, y, z) => cells.get(`${x},${y},${z}`) ?? 0,
      natural: (x, y, z) =>
        naturalEnds && (at(0).join(',') === `${x},${y},${z}` || at(length + 1).join(',') === `${x},${y},${z}`),
    });
  return { registry, cells, at, put, run, support, post, beam, crossed };
};

describe('axis beam clear span', () => {
  it.each(['x', 'z'] as const)('holds the whole run at its limit and rejects one cell wider on axis %s', (axis) => {
    const held = fixture(axis, 7);
    const wide = fixture(axis, 8);
    expect(held.run.map(held.support().holds)).toEqual(held.run.map(() => true));
    expect(wide.run.map(wide.support().holds)).toEqual(wide.run.map(() => false));
    const reversed = held.support();
    expect([...held.run].reverse().map(reversed.holds)).toEqual(held.run.map(() => true));
  });

  it.each(['x', 'z'] as const)(
    'does not reach across its axis %s even with standing cells on both cross sides',
    (axis) => {
      const f = fixture(axis, 1);
      f.cells.delete(f.at(0).join(','));
      f.cells.delete(f.at(2).join(','));
      for (const across of [-1, 1]) {
        for (let y = 1; y <= 3; y++) {
          f.put(f.at(1, y, across), f.post);
        }
      }
      expect(f.support().holds(f.at(1))).toBe(false);
    },
  );

  it.each([-1, 1])('rejects a cantilever when bearing side %s is absent', (side) => {
    const f = fixture('x', 3);
    f.cells.delete(f.at(side < 0 ? 0 : 4).join(','));
    expect(f.run.map(f.support().holds)).toEqual(f.run.map(() => false));
  });

  it('accepts natural ends but traverses only same-axis beam cells between its bearings', () => {
    const f = fixture('z', 3, true);
    expect(f.support().holds(f.at(1))).toBe(true);
    for (const id of [f.crossed, f.post, 0]) {
      f.put(f.at(2), id);
      expect(f.support().holds(f.at(1))).toBe(false);
    }
  });

  it('does not use a standing but crumbling cell as a beam bearing', () => {
    const f = fixture('x', 3);
    const material = {
      ...fixtureBlockMaterial('fixture_char'),
      id: 'fixture_char_material',
      span: 0,
      crumblesUnderLoad: true,
    };
    f.registry.blockMaterials.set(material.id, material);
    const char = f.registry.blocks.length;
    f.registry.blocks.push({
      id: 'fixture_char',
      name: 'Fixture char',
      material: material.id,
      solid: true,
      color: '#222222',
    });
    f.put(f.at(0), char);
    const support = f.support();
    expect(support.supported(f.at(0))).toBe(true);
    expect(support.holds(f.at(0))).toBe(false);
    expect(support.holds(f.at(1))).toBe(false);
  });

  it('does not use a merely sideways-held end as a beam bearing', () => {
    const f = fixture('x', 3);
    f.cells.delete(f.at(0, 1).join(','));
    f.cells.delete(f.at(0, 2).join(','));
    for (let y = 1; y <= 3; y++) {
      f.put(f.at(0, y, 1), f.post);
    }
    const support = f.support();
    expect(support.holds(f.at(0))).toBe(true);
    expect(support.holds(f.at(1))).toBe(false);
  });

  it('holds a deck on the beam but not a deck beside a sideways-held beam', () => {
    const f = fixture('x', 7);
    f.put(f.at(4, 4), f.post);
    f.put(f.at(4, 3, 1), f.post);
    const support = f.support();
    expect(support.holds(f.at(4))).toBe(true);
    expect(support.holds(f.at(4, 4))).toBe(true);
    expect(support.holds(f.at(4, 3, 1))).toBe(false);
  });
});
