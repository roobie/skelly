import type { PackInput } from '../../src/engine/packs.ts';

export const fixturePack = (id: string, dependencies: string[], optIn: boolean): PackInput => ({
  source: `mods/${id}`,
  manifest: {
    id,
    version: '1',
    tier: 'scenario',
    product: false,
    ...(optIn ? { optIn: true as const } : {}),
    dependencies,
    overrides: [],
    files: [],
  },
  files: [],
});

/** Opt-in A -> opt-in B -> opt-in C -> default D, so a walk of the roots' direct dependencies alone misses C. */
export const folderChain = () => {
  const d = fixturePack('fixture.d', [], false);
  const c = fixturePack('fixture.c', [d.manifest.id], true);
  const b = fixturePack('fixture.b', [c.manifest.id], true);
  const a = fixturePack('fixture.a', [b.manifest.id], true);
  return { a, b, c, d, defaults: [d], available: [d, c, b, a] };
};
