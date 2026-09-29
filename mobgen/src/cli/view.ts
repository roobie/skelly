// Text renderer: judge head/face shape from the terminal (we can't render WebGL here).
//   npm run view -- --template shambler --seed 7
//   npm run view -- --template shambler --seed 7 --valid --region body --view side
//   npm run view -- --template brute --seed 11 --voxel 0.04 --view all
// Prints orthographic front/side/top projections at rest pose: one grid of the nearest
// voxel's material letter per column, and one depth-relief grid (0 = nearest voxel in
// that projection), plus per-bone voxel counts and the genome's face-related params.

import process from 'node:process';
import { parseArgs } from 'node:util';
import type { Body, Material } from '../core/body.ts';
import { MATERIALS } from '../core/body.ts';
import { generate, generateValid, type Realized, realize } from '../core/generate.ts';
import type { Genome } from '../core/template.ts';
import { cellIndex, materialOf, type Voxels } from '../core/voxelize.ts';
import { TEMPLATES } from '../mob/templates.ts';

const { values } = parseArgs({
  options: {
    template: { type: 'string' },
    seed: { type: 'string', default: '0' },
    valid: { type: 'boolean', default: false },
    voxel: { type: 'string' },
    region: { type: 'string', default: 'head' },
    view: { type: 'string', default: 'all' },
  },
});

const names = TEMPLATES.map((t) => t.name).join(', ');
const template = TEMPLATES.find((t) => t.name === values.template);
if (!template) {
  console.error(`--template must be one of: ${names}`);
  process.exit(2);
}
const seed = Number(values.seed);
if (!Number.isInteger(seed)) {
  console.error('--seed must be an integer');
  process.exit(2);
}
const voxelSize = values.voxel === undefined ? undefined : Number(values.voxel);
if (voxelSize !== undefined && !(voxelSize > 0)) {
  console.error('--voxel must be a positive number');
  process.exit(2);
}

const REGIONS = ['head', 'body'] as const;
type Region = (typeof REGIONS)[number];
if (!REGIONS.includes(values.region as Region)) {
  console.error(`--region must be one of: ${REGIONS.join(', ')}`);
  process.exit(2);
}
const region = values.region as Region;

const VIEW_NAMES = ['front', 'side', 'top'] as const;
type ViewName = (typeof VIEW_NAMES)[number];
const VIEW_CHOICES = [...VIEW_NAMES, 'all'] as const;
if (!VIEW_CHOICES.includes(values.view as (typeof VIEW_CHOICES)[number])) {
  console.error(`--view must be one of: ${VIEW_CHOICES.join(', ')}`);
  process.exit(2);
}
const views: readonly ViewName[] = values.view === 'all' ? VIEW_NAMES : [values.view as ViewName];

let genome: Genome;
let realized: Realized;
if (values.valid) {
  const found = generateValid(template, seed);
  if (!found) {
    console.error(`No valid ${template.name} in 100 seeds from ${seed}.`);
    process.exit(1);
  }
  ({ genome, realized } = found);
  console.error(`seed ${found.seed} (after ${found.attempts} attempt${found.attempts === 1 ? '' : 's'}): PASS`);
} else {
  genome = generate(template, seed, voxelSize === undefined ? undefined : { voxelSize });
  realized = realize(genome);
}

const { body, voxels, report } = realized;
console.error(`seed ${genome.seed}: ${report.ok ? 'PASS' : 'FAIL'}`);
for (const issue of report.issues) {
  console.error(`  [${issue.rule}] ${issue.message}`);
}

const MATERIAL_LETTER: Readonly<Record<Material, string>> = {
  skin: 's',
  bruise: 'b',
  shirt: 'c',
  pants: 'p',
  shoe: 'o',
  hair: 'h',
  eye: 'e',
  mouth: 'm',
  gore: 'g',
  bone: 'B',
};

const HEAD_REGION_BONES = ['head', 'jaw'] as const;
const NECK_BONE = 'neck';

/** Owner byte values (bone index + 1) this region includes. Head region also carries the neck,
 * marked separately (dimmed) so the head/jaw sit in context without cluttering the counts. */
const ownersOf = (
  b: Body,
  r: Region,
): { readonly included: ReadonlySet<number>; readonly neck: number | undefined } => {
  if (r === 'body') {
    const included = new Set(b.bones.map((_, i) => i + 1));
    return { included, neck: undefined };
  }
  const included = new Set<number>();
  let neck: number | undefined;
  for (const [i, bone] of b.bones.entries()) {
    if ((HEAD_REGION_BONES as readonly string[]).includes(bone.id)) {
      included.add(i + 1);
    } else if (bone.id === NECK_BONE) {
      included.add(i + 1);
      neck = i + 1;
    }
  }
  return { included, neck };
};

const { included, neck: neckOwner } = ownersOf(body, region);

console.error(`region: ${region}, voxel size: ${voxels.size.toFixed(4)} m, dims: ${voxels.dims.join('x')}`);
console.error('per-bone voxel counts:');
for (const [i, bone] of body.bones.entries()) {
  if (!included.has(i + 1)) {
    continue;
  }
  const count = report.stats.perBoneVoxels[bone.id] ?? 0;
  const tag = bone.id === NECK_BONE ? ' (context)' : '';
  console.error(`  ${bone.id}${tag}: ${count}`);
}

const FACE_PARAMS = ['headScale', 'headTilt', 'jawOpen', 'noseLength', 'earSize', 'hairCover'] as const;
console.error('face params:');
for (const p of FACE_PARAMS) {
  const v = genome.params[p];
  if (v !== undefined) {
    console.error(`  ${p}: ${v}`);
  }
}
console.error('');

interface Bbox {
  iMin: number;
  iMax: number;
  jMin: number;
  jMax: number;
  kMin: number;
  kMax: number;
}

/** Widens `box` (in place, or creates it) so it also covers (i, j, k). */
const growBbox = (prev: Bbox | undefined, i: number, j: number, k: number): Bbox => {
  if (!prev) {
    return { iMin: i, iMax: i, jMin: j, jMax: j, kMin: k, kMax: k };
  }
  return {
    iMin: Math.min(prev.iMin, i),
    iMax: Math.max(prev.iMax, i),
    jMin: Math.min(prev.jMin, j),
    jMax: Math.max(prev.jMax, j),
    kMin: Math.min(prev.kMin, k),
    kMax: Math.max(prev.kMax, k),
  };
};

/** Tight bounds (in grid indices) around every filled, included voxel. undefined if there are none. */
const bboxOf = (v: Voxels, incl: ReadonlySet<number>): Bbox | undefined => {
  let box: Bbox | undefined;
  for (let k = 0; k < v.dims[2]; k++) {
    for (let j = 0; j < v.dims[1]; j++) {
      for (let i = 0; i < v.dims[0]; i++) {
        const owner = v.owner[cellIndex(v.dims, i, j, k)]!;
        if (owner === 0 || !incl.has(owner)) {
          continue;
        }
        box = growBbox(box, i, j, k);
      }
    }
  }
  return box;
};

interface Cell {
  readonly ownerIdx: number;
  readonly colorByte: number;
  /** Coordinate along the sight axis, oriented so that smaller = nearer the camera. */
  readonly depthCoord: number;
}

/** One orthographic view: how screen rows/cols map to grid indices, and how to find, for a given
 * (row, col), the nearest included voxel by scanning along the sight axis from near to far. */
interface ViewSpec {
  readonly title: string;
  readonly rows: readonly number[]; // grid index for each screen row, top to bottom
  readonly cols: readonly number[]; // grid index for each screen column, left to right
  readonly rowAxisLabel: string;
  readonly colRange: string;
  readonly nearest: (row: number, col: number) => Cell | undefined;
}

const range = (lo: number, hi: number): number[] => {
  const out: number[] = [];
  for (let x = lo; x <= hi; x++) {
    out.push(x);
  }
  return out;
};
const rangeDesc = (hi: number, lo: number): number[] => {
  const out: number[] = [];
  for (let x = hi; x >= lo; x--) {
    out.push(x);
  }
  return out;
};

const findNearest = (
  v: Voxels,
  incl: ReadonlySet<number>,
  order: readonly number[],
  cellAt: (t: number) => readonly [number, number, number],
): Cell | undefined => {
  for (const t of order) {
    const [i, j, k] = cellAt(t);
    const idx = cellIndex(v.dims, i, j, k);
    const ownerIdx = v.owner[idx]!;
    if (ownerIdx !== 0 && incl.has(ownerIdx)) {
      return { ownerIdx, colorByte: v.color[idx]!, depthCoord: t };
    }
  }
  return undefined;
};

/** Front: camera at -Z looking toward +Z (the face protrudes toward -Z, so it's nearest). Screen-right
 * is world -X, i.e. the figure's left (screen-right = -X because forward x up = (0,0,1)x(0,1,0) = -X). */
const frontView = (v: Voxels, incl: ReadonlySet<number>, bbox: Bbox): ViewSpec => ({
  title: "FRONT (camera at -Z looking toward +Z; screen-right is the figure's LEFT, -X)",
  rows: rangeDesc(bbox.jMax, bbox.jMin),
  cols: rangeDesc(bbox.iMax, bbox.iMin),
  rowAxisLabel: 'y',
  colRange: `x: ${bbox.iMax} (left) .. ${bbox.iMin} (right)`,
  nearest: (j, i) => findNearest(v, incl, range(bbox.kMin, bbox.kMax), (k) => [i, j, k]),
});

/** Side: camera at -X looking toward +X (the figure's left side). Screen-right is world +Z; the face
 * (which protrudes toward -Z) points toward screen-left. */
const sideView = (v: Voxels, incl: ReadonlySet<number>, bbox: Bbox): ViewSpec => ({
  title: "SIDE (camera at -X looking toward +X, the figure's left side; face points screen-left)",
  rows: rangeDesc(bbox.jMax, bbox.jMin),
  cols: range(bbox.kMin, bbox.kMax),
  rowAxisLabel: 'y',
  colRange: `z: ${bbox.kMin} (front) .. ${bbox.kMax} (back)`,
  nearest: (j, k) => findNearest(v, incl, range(bbox.iMin, bbox.iMax), (i) => [i, j, k]),
});

/** Top: camera above looking down (-Y). Screen-up is world -Z (the figure's front), screen-right +X. */
const topView = (v: Voxels, incl: ReadonlySet<number>, bbox: Bbox): ViewSpec => ({
  title: "TOP (camera above looking down; screen-up is the figure's front, -Z; screen-right +X)",
  rows: range(bbox.kMin, bbox.kMax),
  cols: range(bbox.iMin, bbox.iMax),
  rowAxisLabel: 'z',
  colRange: `x: ${bbox.iMin} (left) .. ${bbox.iMax} (right)`,
  nearest: (k, i) => findNearest(v, incl, rangeDesc(bbox.jMax, bbox.jMin), (j) => [i, j, k]),
});

const buildView = (name: ViewName, v: Voxels, incl: ReadonlySet<number>, bbox: Bbox): ViewSpec => {
  if (name === 'front') {
    return frontView(v, incl, bbox);
  }
  if (name === 'side') {
    return sideView(v, incl, bbox);
  }
  return topView(v, incl, bbox);
};

const cellMark = (ownerIdx: number): string => (ownerIdx === neckOwner ? '~' : ' ');

const printView = (spec: ViewSpec): void => {
  console.log(spec.title);
  console.log(`  ${spec.colRange} (${spec.cols.length} cols x ${spec.rows.length} rows)`);

  const grid: (Cell | undefined)[][] = spec.rows.map((row) => spec.cols.map((col) => spec.nearest(row, col)));

  let depthMin = Number.POSITIVE_INFINITY;
  let depthMax = Number.NEGATIVE_INFINITY;
  for (const rowCells of grid) {
    for (const cell of rowCells) {
      if (cell) {
        depthMin = Math.min(depthMin, cell.depthCoord);
        depthMax = Math.max(depthMax, cell.depthCoord);
      }
    }
  }
  const depthRange = depthMax - depthMin;
  const depthDigit = (cell: Cell): string =>
    depthRange === 0 ? '0' : Math.round((9 * (cell.depthCoord - depthMin)) / depthRange).toString();

  const rowLabelWidth = Math.max(...spec.rows.map((r) => Math.abs(r).toString().length), spec.rowAxisLabel.length) + 1;
  console.log(`  ${spec.rowAxisLabel.padStart(rowLabelWidth)}  material${' '.repeat(spec.cols.length * 2 - 6)}  depth`);
  for (const [ri, rowCells] of grid.entries()) {
    const label = spec.rows[ri]!.toString().padStart(rowLabelWidth);
    let material = '';
    let depth = '';
    for (const cell of rowCells) {
      if (cell) {
        material += MATERIAL_LETTER[materialOf(cell.colorByte)] + cellMark(cell.ownerIdx);
        depth += depthDigit(cell) + cellMark(cell.ownerIdx);
      } else {
        material += '. ';
        depth += '. ';
      }
    }
    console.log(`  ${label}  ${material}  ${depth}`);
  }
  console.log('');
};

const box = bboxOf(voxels, included);
if (!box) {
  console.error(`No voxels found for region "${region}".`);
  process.exit(1);
}

console.log(
  `letters: ${MATERIALS.map((m) => `${MATERIAL_LETTER[m]} ${m}`).join(', ')}` +
    (region === 'head' ? " ('~' after a letter/digit = neck, shown for context)" : ''),
);
console.log('');

for (const name of views) {
  printView(buildView(name, voxels, included, box));
}
