import { describe, expect, it } from 'vitest';
import { declaredAsset, type PackLocation, resolvePhysical } from '../src/packs.ts';

const EXTERNAL = 'fixture-built';
const pack: PackLocation = {
  root: 'fixture-mods/fixture.pack',
  manifest: {
    id: 'fixture.pack',
    files: [
      { path: 'rows.json', kind: 'content' },
      { path: 'local.model.json', kind: 'json' },
      { path: 'assets/external.glb', kind: 'asset' },
      { path: 'assets/both.glb', kind: 'asset' },
      { path: 'assets/absent.glb', kind: 'asset' },
      { path: 'outside.json', kind: 'content' },
    ],
  },
};
const local = (path: string) => `${pack.root}/${path}`;
const external = (path: string) => `${EXTERNAL}/${pack.manifest.id}/${path}`;
const inventory = new Set([
  local('rows.json'),
  local('local.model.json'),
  external('assets/external.glb'),
  local('assets/both.glb'),
  external('assets/both.glb'),
  external('outside.json'),
]);
const resolved = (path: string) =>
  resolvePhysical(pack, pack.manifest.files.find((entry) => entry.path === path)!, inventory, EXTERNAL);

describe('pack file resolver', () => {
  it('a json or asset entry resolves to exactly one root, a content entry only locally', () => {
    expect(resolved('rows.json')).toEqual({ key: local('rows.json') });
    expect(resolved('local.model.json')).toEqual({ key: local('local.model.json') });
    expect(resolved('assets/external.glb')).toEqual({ key: external('assets/external.glb') });
    for (const [path, problem] of [
      ['assets/both.glb', 'file found in both roots'],
      ['assets/absent.glb', 'missing file'],
      ['outside.json', 'missing file'],
    ] as const) {
      expect(resolved(path)).toEqual({
        issue: { source: pack.root, path: 'files', message: `Pack ${pack.manifest.id}: ${problem} ${path}` },
      });
    }
  });

  it('an external key is foreign, declared or orphan by its namespace', () => {
    const packs = [pack];
    expect(declaredAsset(packs, external('assets/external.glb'), EXTERNAL)).toEqual({
      kind: 'declared',
      pack,
      path: 'assets/external.glb',
    });
    expect(declaredAsset(packs, external('assets/undeclared.glb'), EXTERNAL)).toEqual({ kind: 'orphan' });
    expect(declaredAsset(packs, external('rows.json'), EXTERNAL)).toEqual({ kind: 'orphan' });
    expect(declaredAsset(packs, `${EXTERNAL}/fixture.other-product/assets/x.glb`, EXTERNAL)).toEqual({
      kind: 'foreign',
    });
    expect(declaredAsset(packs, local('assets/anything.glb'), EXTERNAL)).toEqual({
      kind: 'declared',
      pack,
      path: 'assets/anything.glb',
    });
    expect(declaredAsset(packs, 'fixture-mods/fixture.unknown/assets/x.glb', EXTERNAL)).toEqual({ kind: 'orphan' });
  });
});
