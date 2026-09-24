import { describe, expect, it } from 'vitest';
import { applyPoint } from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixture, variant } from './helpers.ts';

const valid = loadFixture('archetype-rifle');
const at = (r: ReturnType<typeof resolve>, part: string, p: [number, number, number] = [0, 0, 0]) =>
  applyPoint(r.placed.get(part)!, p);

const expectVec = (actual: readonly number[], expected: readonly number[]) =>
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!));

describe('resolve', () => {
  const r = resolve(valid, gunDomain);

  it('places the root at the origin', () => {
    expectVec(at(r, 'receiver'), [0, 0, 0]);
  });

  it('mates ports face to face', () => {
    expectVec(at(r, 'barrel'), [0, 0, 0]);
    expectVec(at(r, 'barrel', [36, 0, 0]), [36, 0, 0]); // muzzle points forward
    expectVec(at(r, 'stock', [-16, 0, 0]), [-32, 0, 0]); // stock extends backward
    expectVec(at(r, 'lower'), [0, -2.5, 0]); // lower hangs under the receiver
    expectVec(at(r, 'magazine', [0, -10, 0]), [-5, -14, 0]); // magazine hangs from the lower
  });

  it('offsets slotted connections along the port', () => {
    expectVec(at(r, 'sight'), [-14 + 3 * 2, 2.5, 0]);
  });

  it('leans the grip back', () => {
    const bottom = at(r, 'grip', [0, -10, 0]);
    expect(bottom[0]).toBeLessThan(-12);
    expect(bottom[1]).toBeLessThan(-2.5);
  });

  it('marks the handguard clamp as the connection that closes a loop', () => {
    const roles = r.connections.map((c) => `${c.conn.from}:${c.role}`);
    expect(roles).toContain('handguard.front:loop');
    expect(r.connections.filter((c) => c.role === 'loop')).toHaveLength(1);
  });

  it('places the same whichever side of a connection comes first', () => {
    const flipped = variant('archetype-rifle', (a) => {
      a.connections = a.connections.map((c) =>
        c.slot === undefined ? { from: c.to, to: c.from } : c,
      );
    });
    const rf = resolve(flipped, gunDomain);
    for (const part of Object.keys(valid.parts)) {
      expectVec(at(rf, part, [1, 2, 3]), at(r, part, [1, 2, 3]));
    }
  });

  it('places the same when placing a rolled part from its own side', () => {
    const rolled = variant('archetype-rifle', (a) => {
      a.connections.find((c) => c.to === 'sight.base')!.roll = 90;
    });
    // Root the assembly at the sight: the receiver is placed from the sight.
    const fromSight = variant('broken-axis-alignment', (a) => {
      a.root = 'sight';
    });
    const r1 = resolve(rolled, gunDomain);
    const r2 = resolve(fromSight, gunDomain);
    // Compare relative placement: sight in receiver coordinates.
    const inv = (res: typeof r1, p: [number, number, number]) => {
      const rec = res.placed.get('receiver')!;
      const s = applyPoint(res.placed.get('sight')!, p);
      const d = [s[0] - rec.t[0], s[1] - rec.t[1], s[2] - rec.t[2]] as const;
      // rec.r is orthonormal: inverse is transpose.
      const m = rec.r;
      return [
        m[0] * d[0] + m[3] * d[1] + m[6] * d[2],
        m[1] * d[0] + m[4] * d[1] + m[7] * d[2],
        m[2] * d[0] + m[5] * d[1] + m[8] * d[2],
      ];
    };
    expectVec(inv(r2, [2, 1, 0]), inv(r1, [2, 1, 0]));
    expectVec(at(r1, 'sight', [2, 0, 0]).map(Math.abs), [8, 2.5, 2]);
  });
});

describe('resolve: structure issues', () => {
  const structure = (edit: Parameters<typeof variant>[1]) =>
    resolve(variant('archetype-rifle', edit), gunDomain).issues.map((i) => i.message);

  it('reports unknown families and bad params', () => {
    expect(structure((a) => { a.parts.grip = { family: 'wing' }; })).toEqual([
      'Part "grip" uses unknown family "wing".',
    ]);
    expect(structure((a) => { a.parts.grip = { family: 'grip', params: { length: 'XL' } }; })).toEqual([
      'Part "grip": length="XL" is not one of S, M, L.',
    ]);
  });

  it('reports unknown ports, bad slots and bad rolls', () => {
    expect(structure((a) => { a.connections[1] = { from: 'receiver.nose', to: 'barrel.rear' }; }))
      .toEqual(['Connection #1: part "receiver" (receiver) has no port "nose".']);
    expect(structure((a) => { a.connections[7] = { from: 'receiver.rail', slot: 7, to: 'sight.base' }; }))
      .toEqual(['Connection #7: slot 7 is outside receiver.rail (0–6).']);
    expect(structure((a) => { a.connections[7] = { from: 'receiver.rail', slot: 1, to: 'sight.base', roll: 45 }; }))
      .toEqual(['Connection #7: roll 45 is not a multiple of 90.']);
  });

  it('leaves parts that nothing connects unplaced', () => {
    const r = resolve(variant('archetype-rifle', (a) => {
      a.connections = a.connections.filter((c) => c.to !== 'stock.front');
    }), gunDomain);
    expect(r.placed.has('stock')).toBe(false);
    expect(r.issues).toEqual([]);
  });
});
