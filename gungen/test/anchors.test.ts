import { describe, expect, it } from 'vitest';
import { resolveAnchors } from '../src/core/anchors.ts';
import type { AnchorFrame } from '../src/core/design.ts';
import { generate } from '../src/core/generate.ts';
import { applyDir, applyPoint, cross, dot, length, type Vec3 } from '../src/core/math.ts';
import { type Resolved, resolve } from '../src/core/resolve.ts';
import type { Assembly, PartDef, Solid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { GUN_ANCHOR_POLICY, type GunAnchorDeclarations, selectGunAnchors } from '../src/gun/anchors.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { loadFixture, loadFixtures } from './helpers.ts';

const EPS = 1e-6;
const ARCHETYPES = loadFixtures().filter((a) => a.name.startsWith('archetype'));

const select = (assembly: Assembly, declarations: GunAnchorDeclarations = GUN_ANCHORS) =>
  selectGunAnchors(resolve(assembly, gunDomain), declarations, GUN_ANCHOR_POLICY);

/** What is wrong with a frame: not unit-length, not orthogonal, or not right-handed. */
const frameDefects = (f: AnchorFrame): string[] => {
  const near = (a: number, b: number) => Math.abs(a - b) < EPS;
  const defects: string[] = [];
  if (!(near(length(f.forward), 1) && near(length(f.up), 1))) {
    defects.push('not unit length');
  }
  if (!near(dot(f.forward, f.up), 0)) {
    defects.push('not orthogonal');
  }
  // right-handed: (forward, up, forward x up) is a proper rotation when forward x up is a unit third axis
  if (!near(length(cross(f.forward, f.up)), 1)) {
    defects.push('not right-handed');
  }
  return defects;
};

const insideSolid = (s: Solid, p: Vec3): boolean => {
  if (s.kind === 'box') {
    return [0, 1, 2].every((i) => Math.abs(p[i]! - s.box.center[i]!) <= s.box.half[i]! + EPS);
  }
  if (p[2] < s.z[0] - EPS || p[2] > s.z[1] + EPS) {
    return false;
  }
  return s.profile.every((a, i) => {
    const b = s.profile[(i + 1) % s.profile.length]!;
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -EPS;
  });
};

const paramsOf = (resolved: Resolved, id: string): Record<string, string> =>
  Object.fromEntries(Object.entries(resolved.params.get(id)!).map(([k, v]) => [k, v.value]));

interface LocalFrame {
  readonly label: string;
  readonly name: string;
  readonly frame: AnchorFrame;
  readonly def: PartDef;
}

/** Every declared family-local frame in an assembly's placed parts. */
const localFrames = (a: Assembly): LocalFrame[] => {
  const resolved = resolve(a, gunDomain);
  return [...resolved.defs].flatMap(([id, def]) => {
    const decl = GUN_ANCHORS[a.parts[id]!.family];
    const frames = decl ? decl.anchors(paramsOf(resolved, id), def) : {};
    return Object.entries(frames).map(([name, frame]) => ({ label: `${a.name} ${id}`, name, frame: frame!, def }));
  });
};

const selected = (a: Assembly) => {
  const r = select(a);
  if ('code' in r) {
    throw new Error(`${a.name}: ${JSON.stringify(r)}`);
  }
  return r;
};

const partsOf = (a: Assembly, family: string) => Object.entries(a.parts).filter(([, p]) => p.family === family);

describe('resolveAnchors (core)', () => {
  it('transforms local frames by the placed transform, with no domain names', () => {
    const def = { family: 'x', ports: [], solids: [], keepOuts: [], axes: [] } as PartDef;
    const t = { r: [0, -1, 0, 1, 0, 0, 0, 0, 1] as const, t: [10, 0, 5] as Vec3 };
    const resolved = {
      assembly: { name: 't', root: 'a', parts: { a: { family: 'widget' }, b: { family: 'widget' } }, connections: [] },
      defs: new Map([['a', def]]),
      params: new Map([['a', { size: { value: 'M', source: 'set' as const } }]]),
      placed: new Map([['a', t]]),
      connections: [],
      issues: [],
    } as unknown as Resolved;
    const out = resolveAnchors(resolved, {
      widget: (params) => ({
        thing: { position: [1, 0, 0], forward: [1, 0, 0], up: [0, 1, 0] },
        [`size-${params.size}`]: { position: [0, 0, 0] as Vec3, forward: [0, 1, 0] as Vec3, up: [1, 0, 0] as Vec3 },
      }),
    });
    expect(Object.keys(out)).toEqual(['a']);
    expect(out.a!.thing!.position).toEqual(applyPoint(t, [1, 0, 0]));
    expect(out.a!.thing!.forward).toEqual(applyDir(t, [1, 0, 0]));
    expect(out.a!['size-M']!.position).toEqual([10, 0, 5]);
  });
});

describe('hold selection', () => {
  it('every archetype fixture resolves exactly one hold', () => {
    expect(ARCHETYPES.length).toBeGreaterThanOrEqual(11);
    for (const a of ARCHETYPES) {
      expect(frameDefects(selected(a).hold)).toEqual([]);
    }
  });

  it('every template resolves exactly one hold', () => {
    for (const t of TEMPLATES) {
      let checked = 0;
      for (let seed = 0; seed < 25; seed++) {
        const a = generate(t, gunDomain, seed);
        if (validate(a, gunDomain).ok) {
          selected(a);
          checked += 1;
        }
      }
      expect(checked, t.name).toBeGreaterThan(0);
    }
  });

  it('holds the integrated pistol grip', () => {
    const a = loadFixture('archetype-pistol');
    const resolved = resolve(a, gunDomain);
    expect(partsOf(a, 'grip')).toHaveLength(0);
    const [frameId] = partsOf(a, 'frame')[0]!;
    const r = selected(a);
    const def = resolved.defs.get(frameId)!;
    const local = GUN_ANCHORS.frame!.anchors(paramsOf(resolved, frameId), def).hold!;
    expect(r.hold.position).toEqual(applyPoint(resolved.placed.get(frameId)!, local.position));
    expect(GUN_ANCHORS.frame!.holdRank).toBe('grip');
  });

  it('holds a stock wrist when there is no grip', () => {
    const a = loadFixture('archetype-bolt-rifle');
    expect(partsOf(a, 'grip')).toHaveLength(0);
    const [stockId, stock] = partsOf(a, 'stock')[0]!;
    expect(stock.params?.style).toBe('sporting');
    const resolved = resolve(a, gunDomain);
    const local = GUN_ANCHORS.stock!.anchors(paramsOf(resolved, stockId), resolved.defs.get(stockId)!).hold!;
    expect(selected(a).hold.position).toEqual(applyPoint(resolved.placed.get(stockId)!, local.position));
  });

  it('a grip beats a FIRING_GRIP stock', () => {
    const ar = loadFixture('archetype-ar');
    const [gripId] = partsOf(ar, 'grip')[0]!;
    const [stockId, stock] = partsOf(ar, 'stock')[0]!;
    const a: Assembly = {
      ...ar,
      parts: { ...ar.parts, [stockId]: { ...stock, params: { ...stock.params, style: 'sporting' } } },
    };
    const resolved = resolve(a, gunDomain);
    expect(resolved.defs.get(stockId)!.tags).toContain('firing-grip');
    expect(GUN_ANCHORS.stock!.anchors(paramsOf(resolved, stockId), resolved.defs.get(stockId)!).hold).toBeDefined();
    const local = GUN_ANCHORS.grip!.anchors(paramsOf(resolved, gripId), resolved.defs.get(gripId)!).hold!;
    expect(selected(a).hold.position).toEqual(applyPoint(resolved.placed.get(gripId)!, local.position));
  });

  it('refuses two equal-rank holds', () => {
    const ar = loadFixture('archetype-ar');
    const [gripId, grip] = partsOf(ar, 'grip')[0]!;
    const touches = (ref: string) => ref.startsWith(`${gripId}.`);
    const swap = (ref: string) => ref.replace(`${gripId}.`, 'grip2.');
    const a: Assembly = {
      ...ar,
      parts: { ...ar.parts, grip2: grip },
      connections: [
        ...ar.connections,
        ...ar.connections
          .filter((c) => touches(c.from) || touches(c.to))
          .map((c) => ({ ...c, from: swap(c.from), to: swap(c.to) })),
      ],
    };
    const r = select(a);
    expect(r).toMatchObject({ code: 'ambiguous-anchor', name: 'hold' });
    expect([...(r as { candidates: readonly string[] }).candidates].sort()).toEqual([gripId, 'grip2'].sort());
  });

  it('refuses a design with no hold', () => {
    expect(select(loadFixture('broken-firing-grip'))).toEqual({ code: 'missing-required-anchor', name: 'hold' });
  });

  it('ranks by the declaration, so equal ranks tie', () => {
    const ar = loadFixture('archetype-ar');
    const [stockId, stock] = partsOf(ar, 'stock')[0]!;
    const a: Assembly = {
      ...ar,
      parts: { ...ar.parts, [stockId]: { ...stock, params: { ...stock.params, style: 'sporting' } } },
    };
    const tied: GunAnchorDeclarations = {
      ...GUN_ANCHORS,
      grip: { ...GUN_ANCHORS.grip!, holdRank: 'firing-grip-stock' },
    };
    expect(select(a, tied)).toMatchObject({ code: 'ambiguous-anchor', name: 'hold' });
  });
});

describe('anchor data', () => {
  it('is keyed by registry keys of the gun domain', () => {
    for (const key of Object.keys(GUN_ANCHORS)) {
      expect(Object.keys(gunDomain.families)).toContain(key);
    }
    expect(Object.keys(GUN_ANCHORS).sort()).toEqual(['barrel', 'forend', 'frame', 'grip', 'handguard', 'stock']);
  });

  it('frames are unit-length and right-handed; hold frames sit within their part', () => {
    const assemblies = [
      ...ARCHETYPES,
      ...TEMPLATES.flatMap((t) => [1, 2, 3, 4, 5].map((s) => generate(t, gunDomain, s))),
    ];
    const declared = assemblies.flatMap(localFrames);
    const holds = declared.filter((d) => d.name === 'hold');
    for (const d of declared) {
      expect(frameDefects(d.frame)).toEqual([]);
    }
    for (const d of holds) {
      expect(
        d.def.solids.some((s) => insideSolid(s, d.frame.position)),
        d.label,
      ).toBe(true);
    }
    expect(holds.length).toBeGreaterThan(20);
    expect(declared.length).toBeGreaterThan(holds.length);
  });

  it('resolved frames stay unit-length and orthogonal in assembly space', () => {
    for (const a of ARCHETYPES) {
      const r = selected(a);
      expect(frameDefects(r.hold)).toEqual([]);
      for (const f of Object.values(r.others)) {
        expect(frameDefects(f)).toEqual([]);
      }
    }
  });

  it('selects support on handguard and forend, and muzzle on barrel', () => {
    expect(selected(loadFixture('archetype-ar')).others.support).toBeDefined();
    expect(selected(loadFixture('archetype-pump-shotgun')).others.support).toBeDefined();
    for (const a of ARCHETYPES) {
      expect(selected(a).others.muzzle, a.name).toBeDefined();
    }
  });
});

describe('sweep', () => {
  it('never errors on a valid generated design', () => {
    for (const t of TEMPLATES) {
      let valid = 0;
      let errors = 0;
      for (let seed = 0; seed < 300; seed++) {
        const a = generate(t, gunDomain, seed);
        if (!validate(a, gunDomain).ok) {
          continue;
        }
        valid += 1;
        if ('code' in select(a)) {
          errors += 1;
        }
      }
      expect(errors, t.name).toBe(0);
      expect(valid, t.name).toBeGreaterThan(100);
    }
  }, 120_000);
});
