import { describe, expect, it } from 'vitest';
import { applyPoint } from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Domain } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
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
    expectVec(at(r, 'magazine', [0, -10, 0]), [-4.5, -14, 0]); // magazine hangs from the lower
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

describe('resolve: params from neighbours', () => {
  const param = (r: ReturnType<typeof resolve>, part: string, name: string) => r.params.get(part)![name]!;

  it('reads unset params from the connected neighbour', () => {
    const r = resolve(valid, gunDomain);
    expect(param(r, 'handguard', 'length')).toEqual({ value: 'M', source: 'inherited', from: 'barrel.length' });
    expect(param(r, 'barrel', 'bore')).toEqual({ value: 'M', source: 'inherited', from: 'receiver.bore' });
    expect(param(r, 'barrel', 'length')).toEqual({ value: 'M', source: 'set' });
  });

  it('re-sizes a clamped handguard to whatever barrel it clamps to', () => {
    for (const length of ['S', 'M', 'L']) {
      const a = variant('archetype-rifle', (x) => { x.parts.barrel!.params = { length }; });
      const report = validate(a, gunDomain);
      expect(param(report.resolved, 'handguard', 'length').value).toBe(length);
      expect(report.issues).toEqual([]);
    }
  });

  it('re-sizes a tube magazine to the barrel its cap fixes to', () => {
    for (const length of ['S', 'M', 'L']) {
      const a = variant('archetype-pump-shotgun', (x) => { x.parts.barrel!.params = { length }; });
      const report = validate(a, gunDomain);
      expect(param(report.resolved, 'tube', 'length').value).toBe(length);
      expect(report.issues).toEqual([]);
    }
  });

  it('lets the assembly override a neighbour', () => {
    const r = resolve(loadFixture('broken-loop-closure'), gunDomain);
    expect(param(r, 'handguard', 'length')).toEqual({ value: 'M', source: 'set' });
  });

  it('falls back to the default when the source port is not connected', () => {
    // A free-floating handguard has nothing on its front port.
    const r = resolve(loadFixture('broken-solid-overlap'), gunDomain);
    expect(param(r, 'handguard', 'length')).toEqual({ value: 'M', source: 'default' });
  });

  // A domain where the handguard's inner size also follows the barrel's bore,
  // which itself follows the receiver: a two-step chain.
  const handguard = gunDomain.families.handguard!;
  const chained = (values?: readonly string[]): Domain => ({
    ...gunDomain,
    families: {
      ...gunDomain.families,
      handguard: {
        ...handguard,
        params: {
          ...handguard.params,
          inner: { values: values ?? ['S', 'M', 'L'], default: 'M', from: [{ port: 'front', param: 'bore' }] },
        },
      },
    },
  });

  it('resolves chains of neighbours', () => {
    const a = variant('archetype-rifle', (x) => {
      x.parts.receiver!.params = { ...x.parts.receiver!.params, bore: 'L' };
      delete x.parts.handguard!.params;
    });
    const r = resolve(a, chained());
    expect(param(r, 'barrel', 'bore').value).toBe('L');
    expect(param(r, 'handguard', 'inner')).toEqual({ value: 'L', source: 'inherited', from: 'barrel.bore' });
  });

  it('reports a neighbour value the param does not allow', () => {
    const a = variant('archetype-rifle', (x) => {
      x.parts.receiver!.params = { ...x.parts.receiver!.params, bore: 'L' };
      delete x.parts.handguard!.params;
    });
    const r = resolve(a, chained(['S', 'M']));
    expect(r.issues.map((i) => i.message)).toEqual([
      'Part "handguard": inner would come from barrel.bore="L", which is not one of S, M.',
    ]);
  });

  it('passes a default along a chain whose middle has nothing to read from', () => {
    // Free-floating handguard: its length can't come from a barrel, so it
    // takes the default. A domain where the tube's length follows the
    // handguard should then read that default, not fall back on its own.
    const tube = gunDomain.families['tube-magazine']!;
    const domain: Domain = {
      ...chained(),
      families: {
        ...chained().families,
        'tube-magazine': {
          ...tube,
          params: { length: { values: ['S', 'M', 'L'], default: 'S', from: [{ port: 'cap', param: 'length' }] } },
        },
      },
    };
    const a = variant('broken-solid-overlap', (x) => {
      x.parts.tube = { family: 'tube-magazine' };
      // Params only need topology; this connection needn't be mountable.
      x.connections.push({ from: 'tube.cap', to: 'handguard.rear' });
    });
    const r = resolve(a, domain);
    expect(param(r, 'handguard', 'length')).toEqual({ value: 'M', source: 'default' });
    expect(param(r, 'tube', 'length')).toEqual({ value: 'M', source: 'inherited', from: 'handguard.length' });
  });

  it('falls back to defaults for a cycle', () => {
    // Tube length reads the handguard; the handguard's length reads the tube.
    const tube = gunDomain.families['tube-magazine']!;
    const domain: Domain = {
      ...gunDomain,
      families: {
        ...gunDomain.families,
        'tube-magazine': {
          ...tube,
          params: { length: { values: ['S', 'M', 'L'], default: 'S', from: [{ port: 'cap', param: 'length' }] } },
        },
      },
    };
    const a = variant('broken-solid-overlap', (x) => {
      x.parts.tube = { family: 'tube-magazine' };
      x.connections.push({ from: 'tube.cap', to: 'handguard.front' });
    });
    const r = resolve(a, domain);
    expect(param(r, 'handguard', 'length')).toEqual({ value: 'M', source: 'default' });
    expect(param(r, 'tube', 'length')).toEqual({ value: 'S', source: 'default' });
  });

  it("sizes a magazine from the receiver's cartridge, through the lower", () => {
    const r = resolve(valid, gunDomain);
    expect(param(r, 'lower', 'bore')).toEqual({ value: 'M', source: 'inherited', from: 'receiver.bore' });
    expect(param(r, 'magazine', 'bore')).toEqual({ value: 'M', source: 'inherited', from: 'lower.bore' });
  });

  it('gives a small-bore gun a slimmer magazine than a rifle', () => {
    const body = (fixture: string) => resolve(loadFixture(fixture), gunDomain).defs.get('magazine')!.solids[0]!.box.half;
    const smg = body('archetype-smg'); // bore S, capacity L
    const rifle = body('archetype-rifle'); // bore M, capacity M
    expect(smg[0]).toBeLessThan(rifle[0]); // depth, front to back
    expect(smg[2]).toBeLessThan(rifle[2]); // width
    // Length follows rounds × per-round pitch × 1.2, snapped to the grid:
    // 30 × 0.4 × 1.2 = 14.4 → 14.5, and 20 × 0.5 × 1.2 = 12.
    expect([smg[1] * 2, rifle[1] * 2]).toEqual([14.5, 12]);
  });
});

