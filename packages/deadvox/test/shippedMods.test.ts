import { basename } from 'node:path';
import process from 'node:process';
import type { PackInput } from '@skelly/engine/packs';
import { expect, it } from 'vitest';
import { readAvailablePacks } from '../tools/readBundledPacks.ts';

const folderIssues = (packs: readonly PackInput[]): string[] =>
  packs.flatMap(({ source, manifest }) => {
    const folder = basename(source);
    return folder === manifest.id && folder.length <= 64 ? [] : [source];
  });

const tierIssues = (packs: readonly PackInput[]): string[] => {
  const tiers = { core: 0, theme: 1, product: 2, scenario: 3 };
  return packs.flatMap(({ manifest }) =>
    manifest.dependencies.filter((id) => {
      if (manifest.product) {
        return false;
      }
      const dependency = packs.find((pack) => pack.manifest.id === id);
      return dependency && tiers[dependency.manifest.tier] > tiers[manifest.tier];
    }),
  );
};

it('keeps shipped mod folders equal to their full manifest ids within the path budget', () => {
  const packs = readAvailablePacks(process.cwd());
  expect(packs.length).toBeGreaterThan(0);
  expect(folderIssues(packs)).toEqual([]);
  const fixture = { ...packs[0]!, source: 'mods/fixture.mod', manifest: { ...packs[0]!.manifest, id: 'fixture.mod' } };
  expect(folderIssues([fixture])).toEqual([]);
  expect(folderIssues([{ ...fixture, source: 'mods/another.mod' }])).not.toEqual([]);
  const id = 'x'.repeat(65);
  expect(folderIssues([{ ...fixture, source: `mods/${id}`, manifest: { ...fixture.manifest, id } }])).not.toEqual([]);
});

it('keeps shipped mod dependencies, other than the entry pack selecting the stack, from pointing to a higher tier without privileging loader tiers', () => {
  const packs = readAvailablePacks(process.cwd());
  expect(packs.length).toBeGreaterThan(0);
  expect(tierIssues(packs)).toEqual([]);
  const owner: PackInput = {
    ...packs[0]!,
    manifest: { ...packs[0]!.manifest, id: 'fixture.owner', tier: 'theme', dependencies: [] },
  };
  const consumer: PackInput = {
    ...owner,
    manifest: { ...owner.manifest, id: 'fixture.consumer', tier: 'core', dependencies: [owner.manifest.id] },
  };
  expect(tierIssues([owner, consumer])).toEqual([owner.manifest.id]);
  expect(tierIssues([owner, { ...consumer, manifest: { ...consumer.manifest, tier: 'theme' } }])).toEqual([]);
  const scenario: PackInput = { ...owner, manifest: { ...owner.manifest, id: 'fixture.scenario', tier: 'scenario' } };
  const entry: PackInput = {
    ...owner,
    manifest: {
      ...owner.manifest,
      id: 'fixture.entry',
      tier: 'product',
      product: true,
      dependencies: ['fixture.scenario'],
    },
  };
  expect(tierIssues([scenario, entry])).toEqual([]);
  const productMod = { ...entry, manifest: { ...entry.manifest, product: false } };
  expect(tierIssues([scenario, productMod])).toEqual(['fixture.scenario']);
});
