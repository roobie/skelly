import { describe, expect, it } from 'vitest';
import { resolve } from '../src/core/resolve.ts';
import { keepOut } from '../src/core/rules.ts';
import type { Assembly, Domain, KeepOut, PartFamily } from '../src/core/schema.ts';

const notchProfile = [
  [0, 0],
  [4, 0],
  [4, 1],
  [1, 1],
  [1, 4],
  [0, 4],
] as const;

const keepOutFixture = (entry: KeepOut): { assembly: Assembly; domain: Domain } => {
  const owner: PartFamily = {
    name: 'owner',
    params: {},
    build: () => ({
      family: 'owner',
      solids: [],
      ports: [{ id: 'mate', mount: 'test', gender: 'female', pos: [0, 0, 0], normal: [1, 0, 0], up: [0, 1, 0] }],
      keepOuts: [entry],
      axes: [],
    }),
  };
  const other: PartFamily = {
    name: 'other',
    params: {},
    build: () => ({
      family: 'other',
      solids: [{ id: 'notch-block', kind: 'box', box: { center: [3, 3, 0.5], half: [0.5, 0.5, 0.5] } }],
      ports: [{ id: 'mate', mount: 'test', gender: 'male', pos: [0, 0, 0], normal: [-1, 0, 0], up: [0, 1, 0] }],
      keepOuts: [],
      axes: [],
    }),
  };
  return {
    assembly: {
      name: 'invalid keep-out profile fixture',
      root: 'owner',
      parts: { owner: { family: 'owner' }, other: { family: 'other' } },
      connections: [{ from: 'owner.mate', to: 'other.mate' }],
    },
    domain: {
      name: 'keep-out-profile-fixture',
      units: { metresPerUnit: 1, grid: 0.25, bevel: 0 },
      families: { owner, other },
      axisRules: [],
    },
  };
};

const box = { center: [2, 2, 0.5], half: [2, 2, 0.5] } as const;

describe('keep-out profile validation', () => {
  it('reports a concave profile and falls back to its box', () => {
    const { assembly, domain } = keepOutFixture({
      id: 'notch',
      kind: 'notch',
      box,
      profile: notchProfile,
      z: [0, 1],
    });
    const resolved = resolve(assembly, domain);

    expect(resolved.issues).toHaveLength(1);
    expect(resolved.issues[0]).toMatchObject({ rule: 'structure', parts: ['owner'] });
    expect(resolved.issues[0]?.message).toContain('keep-out "notch"');
    const fallback = resolved.defs.get('owner')!.keepOuts[0]!;
    expect(fallback.profile).toBeUndefined();
    expect(fallback.z).toBeUndefined();
    expect(keepOut.check(resolved)).toHaveLength(1);
  });

  it.each([
    ['profile without z', { profile: notchProfile }],
    ['z without profile', { z: [0, 1] as const }],
  ])('reports and falls back for %s', (_label, shape) => {
    const { assembly, domain } = keepOutFixture({ id: 'partial', kind: 'partial', box, ...shape });
    const resolved = resolve(assembly, domain);
    expect(resolved.issues).toHaveLength(1);
    expect(resolved.issues[0]?.message).toContain('requires both profile and z');
    expect(resolved.defs.get('owner')!.keepOuts[0]).toMatchObject({ box });
    expect(resolved.defs.get('owner')!.keepOuts[0]?.profile).toBeUndefined();
    expect(resolved.defs.get('owner')!.keepOuts[0]?.z).toBeUndefined();
  });
});
