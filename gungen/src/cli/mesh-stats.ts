// Mesh-triangle metrics per template (PROJECT.md §7), median over a seed sweep:
//   npm run mesh-stats                 1000 seeds per template
//   npm run mesh-stats -- --seeds 200
//
// "Before" is the viewer's old, unbeveled geometry (a BoxGeometry has 12
// triangles; an unbeveled N-gon extrusion has 4N-4: an N-2 fan per cap, 2
// per side). "After" is the new chamfered mesh (src/core/mesh.ts).

import { parseArgs } from 'node:util';
import { displayItems } from '../core/display.ts';
import { generate } from '../core/generate.ts';
import { meshForSolid, meshForSolidGroup } from '../core/mesh.ts';
import { resolve } from '../core/resolve.ts';
import type { Solid } from '../core/schema.ts';
import { gunDomain } from '../gun/domain.ts';
import { TEMPLATES } from '../gun/templates.ts';

const { values } = parseArgs({ options: { seeds: { type: 'string', default: '1000' } } });
const n = Number(values.seeds);

const unbeveledTriangleCount = (solid: Solid): number => (solid.kind === 'box' ? 12 : 4 * solid.profile.length - 4);

const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

console.log(`${n} seeds per template (seeds 0..${n - 1})\n`);
console.log('template          before (median)  after (median)  after (max)');
for (const t of TEMPLATES) {
  const before: number[] = [];
  const after: number[] = [];
  for (let seed = 0; seed < n; seed++) {
    const resolved = resolve(generate(t, gunDomain, seed), gunDomain);
    let triBefore = 0;
    let triAfter = 0;
    for (const part of resolved.placed.keys()) {
      const def = resolved.defs.get(part)!;
      const drawn = def.displaySolids ?? def.solids;
      for (const solid of drawn) {
        triBefore += unbeveledTriangleCount(solid);
      }
      for (const item of displayItems(drawn)) {
        const mesh = item.merged ? meshForSolidGroup(item.solids) : meshForSolid(item.solids[0]!);
        triAfter += mesh.triangleCount;
      }
    }
    before.push(triBefore);
    after.push(triAfter);
  }
  console.log(
    `${t.name.padEnd(17)} ${String(median(before)).padStart(15)}  ${String(median(after)).padStart(14)}  ${String(Math.max(...after)).padStart(11)}`,
  );
}
