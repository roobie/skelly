// Generator metrics (PROJECT.md milestone 1 targets), per template over a range of seeds:
//   npm run stats                 300 seeds per template
//   npm run stats -- --seeds 1000

import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { generate, realize } from '../core/generate.ts';
import { TEMPLATES } from '../mob/templates.ts';

const { values } = parseArgs({ options: { seeds: { type: 'string', default: '300' } } });
const n = Number(values.seeds);

/** FNV-1a over the owner + colour bytes: a cheap fingerprint of the actual voxel grid, not the genome
 * (two genomes can look the same; PROJECT.md CHALLENGES.md §6). */
const hashVoxels = (owner: Uint8Array, color: Uint8Array): string => {
  let h = 0x81_1c_9d_c5;
  for (const b of owner) {
    h = Math.imul(h ^ b, 0x01_00_01_93);
  }
  for (const b of color) {
    h = Math.imul(h ^ b, 0x01_00_01_93);
  }
  return (h >>> 0).toString(16);
};

const pct = (x: number, of: number): string => `${((100 * x) / of).toFixed(1)}%`.padStart(6);

console.log(`${n} seeds per template (seeds 0..${n - 1})\n`);

for (const t of TEMPLATES) {
  let valid = 0;
  const distinctGrids = new Set<string>();
  const failures = new Map<string, number>();
  let voxelSum = 0;
  let voxelMin = Number.POSITIVE_INFINITY;
  let voxelMax = 0;
  let headSum = 0;
  let triSum = 0;
  let timeSum = 0;
  let timeMax = 0;

  for (let seed = 0; seed < n; seed++) {
    const genome = generate(t, seed);
    const start = performance.now();
    const { voxels, report } = realize(genome);
    const elapsed = performance.now() - start;
    timeSum += elapsed;
    timeMax = Math.max(timeMax, elapsed);

    voxelSum += report.stats.voxels;
    voxelMin = Math.min(voxelMin, report.stats.voxels);
    voxelMax = Math.max(voxelMax, report.stats.voxels);
    headSum += (report.stats.perBoneVoxels.head ?? 0) + (report.stats.perBoneVoxels.jaw ?? 0);
    triSum += report.stats.triangles;

    if (report.ok) {
      valid += 1;
      distinctGrids.add(hashVoxels(voxels.owner, voxels.color));
    }
    for (const rule of new Set(report.issues.map((i) => i.rule))) {
      failures.set(rule, (failures.get(rule) ?? 0) + 1);
    }
  }

  const top = [...failures]
    .sort((a, b) => b[1] - a[1])
    .map(([rule, c]) => `${rule} ${pct(c, n).trim()}`)
    .join(', ');

  console.log(`## ${t.name} (voxel ${t.voxelSize.toFixed(4)} m)`);
  console.log(`  valid:                     ${pct(valid, n)}`);
  console.log(`  distinct grids (of valid): ${valid > 0 ? pct(distinctGrids.size, valid) : '   n/a'}`);
  console.log(`  voxels:                    mean ${(voxelSum / n).toFixed(0)}, min ${voxelMin}, max ${voxelMax}`);
  console.log(`  head+jaw voxels:           mean ${(headSum / n).toFixed(1)}`);
  console.log(`  triangles:                 mean ${(triSum / n).toFixed(0)}`);
  console.log(`  time/figure:               mean ${(timeSum / n).toFixed(2)} ms, max ${timeMax.toFixed(2)} ms`);
  console.log(`  failures:                  ${top || '-'}`);
  console.log();
}
