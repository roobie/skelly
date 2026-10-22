import { readFileSync } from 'node:fs';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Resolved } from '@skelly/engine/assembly/schema.ts';
import { applyPoint, type Vec3 } from '@skelly/engine/foundation/math.ts';
import { obbPolyhedron, worldSolid } from '@skelly/engine/shapes/geometry.ts';
import { expect, it } from 'vitest';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { COMPACT_SMG_PROPORTIONS } from '../src/gun/compactSmgProportions.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';

const variants = [
  { file: 'compact-smg.json', muzzle: 'threaded' },
  { file: 'compact-smg-plain.json', muzzle: 'plain' },
] as const;

const load = (file: string): Resolved => {
  const loaded = loadGunDesign(readFileSync(new URL(`../designs/${file}`, import.meta.url), 'utf8'));
  if (!loaded.ok) {
    throw new Error(JSON.stringify(loaded.error));
  }
  return resolve(loaded.design.assembly, gunDomain);
};

const owner = (resolved: Resolved, family: string): string => {
  const entry = [...resolved.defs].find(([, def]) => def.family === family);
  if (!entry) {
    throw new Error(`Fixture needs ${family}`);
  }
  return entry[0];
};

it.each(variants)('registers the receiver on its front face and the bore on the x axis: $muzzle', ({ file }) => {
  const resolved = load(file);
  const id = owner(resolved, 'receiver');
  const xs = resolved.defs
    .get(id)!
    .solids.flatMap((solid) => {
      const shape = worldSolid(resolved.placed.get(id)!, solid);
      return [...('vertices' in shape ? shape : obbPolyhedron(shape)).vertices];
    })
    .map(([x]) => x);
  expect(Math.max(...xs)).toBeCloseTo(COMPACT_SMG_PROPORTIONS.receiver.frontX, 6);
  expect(Math.min(...xs)).toBeCloseTo(COMPACT_SMG_PROPORTIONS.receiver.rearX, 6);

  const barrel = owner(resolved, 'barrel');
  const muzzle = GUN_ANCHORS.barrel!.anchors({}, resolved.defs.get(barrel)!).muzzle!;
  const tip = applyPoint(resolved.placed.get(barrel)!, muzzle.position);
  expect(tip[1]).toBeCloseTo(0, 6);
  expect(tip[2]).toBeCloseTo(0, 6);
});

it.each(variants)('puts the muzzle anchor at the tip of the muzzle variant: $muzzle', ({ file, muzzle }) => {
  const resolved = load(file);
  const barrel = owner(resolved, 'barrel');
  const anchor = GUN_ANCHORS.barrel!.anchors({}, resolved.defs.get(barrel)!).muzzle!;
  const tip: Vec3 = applyPoint(resolved.placed.get(barrel)!, anchor.position);
  expect(tip[0]).toBeCloseTo(COMPACT_SMG_PROPORTIONS.barrel.tipU[muzzle], 6);
});
