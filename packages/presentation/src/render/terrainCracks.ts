import type { BlockMaterialDef, Registry } from '@skelly/engine/content';
import { Rng } from '@skelly/engine/math';
import type { ColumnReveal } from '@skelly/engine/mesh';
import type { Vec3, World } from '@skelly/engine/world';
import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshLambertMaterial } from 'three';
import { patchHeightFog } from './heightFog.ts';
import { freezeMatrices } from './staticMatrices.ts';
import { type Stroke, strokeQuads } from './strokeQuads.ts';

export type CrackPattern = BlockMaterialDef['cracks'];

/** Each face's outward normal and in-plane axes, with u × v along the normal so strokes face out. */
const FACES = {
  e: { normal: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  w: { normal: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  up: { normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  down: { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  s: { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  n: { normal: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
} as const satisfies Record<string, Record<'normal' | 'u' | 'v', Readonly<Vec3>>>;

export type CrackFace = keyof typeof FACES;

const FACE_NAMES = Object.keys(FACES) as CrackFace[];

// The crack's form; content shapes it only through the pattern. A straight strand just reaches the face edge.
const ROOT_SPREAD = 0.15;
const STRAND_LENGTH = 0.5;
const BRANCH_SWING_RADIANS = Math.PI / 4;
const BRANCH_STEP = 0.6;
const TIP_WIDTH = 0.4;

/** One face of one cell; the crack it shows depends on nothing else but its pattern. */
export interface CrackSite {
  readonly seed: number;
  readonly cell: Readonly<Vec3>;
  readonly face: CrackFace;
}

/** The reach of the highest step the damage fraction has met; none below the first step. */
export const crackReach = (fraction: number, steps: CrackPattern['steps']): number => {
  let reach = 0;
  for (const step of fraction > 0 ? steps : []) {
    if (step.from <= fraction) {
      ({ reach } = step);
    }
  }
  return reach;
};

interface CrackSegment {
  readonly stroke: Stroke;
  /** How far down the crack the segment ends, root 0 to tip 1; reach reveals the segments up to it. */
  readonly t: number;
}

/** A growing crack end; `depth` counts whole segments from the root, so t lands exactly on authored reaches. */
interface CrackTip {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly depth: number;
}

const clampToFace = (value: number): number => Math.min(1, Math.max(0, value));

const onEdge = ({ x, y }: CrackTip): boolean => x === 0 || x === 1 || y === 0 || y === 1;

const advance = (tip: CrackTip, turn: number, length: number): CrackTip => {
  const angle = tip.angle + turn;
  return {
    x: clampToFace(tip.x + Math.cos(angle) * length),
    y: clampToFace(tip.y + Math.sin(angle) * length),
    angle,
    depth: tip.depth + 1,
  };
};

/** The whole crack a face would show at full reach. Reach never feeds the draws, so less reach shows a prefix. */
const crackTree = ({ seed, cell, face }: CrackSite, pattern: CrackPattern): CrackSegment[] => {
  const rng = Rng.stream(seed, `crack:${cell.join(',')}:${face}`);
  const tree: CrackSegment[] = [];
  const grow = (start: CrackTip, count: number, length: number): void => {
    let tip = start;
    for (let at = 1; at <= count && !onEdge(tip); at++) {
      const next = advance(tip, rng.range(-1, 1) * pattern.jitterRadians, length);
      const t = next.depth / pattern.segments;
      if (next.x !== tip.x || next.y !== tip.y) {
        tree.push({ stroke: [tip.x, tip.y, next.x, next.y, pattern.widthBlocks * (1 - (1 - TIP_WIDTH) * t)], t });
      }
      tip = next;
      if (at < count && !onEdge(tip) && rng.next() < pattern.branchChance) {
        const swing = (rng.next() < 0.5 ? -1 : 1) * (BRANCH_SWING_RADIANS + rng.range(0, 1) * pattern.jitterRadians);
        grow({ ...tip, angle: tip.angle + swing }, Math.ceil((count - at) / 2), length * BRANCH_STEP);
      }
    }
  };
  const x = 0.5 + rng.range(-ROOT_SPREAD, ROOT_SPREAD);
  const y = 0.5 + rng.range(-ROOT_SPREAD, ROOT_SPREAD);
  const turn = rng.range(0, Math.PI * 2);
  for (let strand = 0; strand < pattern.strands; strand++) {
    const angle = turn + ((strand + rng.range(-0.25, 0.25)) * Math.PI * 2) / pattern.strands;
    grow({ x, y, angle, depth: 0 }, pattern.segments, STRAND_LENGTH / pattern.segments);
  }
  return tree;
};

/** The strokes, in face-local [0, 1]² units, a face shows at `reach`; deterministic per site. */
export const crackStrokes = (site: CrackSite, reach: number, pattern: CrackPattern): Stroke[] =>
  reach > 0
    ? crackTree(site, pattern)
        .filter(({ t }) => t <= reach)
        .map(({ stroke }) => stroke)
    : [];

const exposedFaces = (cell: Readonly<Vec3>, isOpaque: (x: number, y: number, z: number) => boolean): CrackFace[] =>
  FACE_NAMES.filter((face) => {
    const [nx, ny, nz] = FACES[face].normal;
    return !isOpaque(cell[0] + nx, cell[1] + ny, cell[2] + nz);
  });

interface CrackVertices {
  readonly positions: number[];
  readonly normals: number[];
  readonly colors: number[];
}

/**
 * Damaged terrain cells drawn cracked on their exposed faces, as one overlay draw beside the chunk meshes: a crack
 * reads as damage where a tint does not. Rebuilt only when damage, blocks or the revealed columns change.
 */
export class TerrainCracks {
  readonly mesh: Mesh<BufferGeometry, MeshLambertMaterial>;
  private readonly seed: number;
  private readonly blockSize: number;
  private readonly registry: Registry;
  private readonly color = new Color();
  private drawn: readonly number[] | undefined;

  constructor({ seed, blockSize, registry }: { seed: number; blockSize: number; registry: Registry }) {
    this.seed = seed;
    this.blockSize = blockSize;
    this.registry = registry;
    const material = new MeshLambertMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -1,
    });
    material.customProgramCacheKey = () => 'terrain-cracks';
    material.onBeforeCompile = (shader) => patchHeightFog(shader);
    this.mesh = new Mesh(new BufferGeometry(), material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain-cracks';
    freezeMatrices(this.mesh);
  }

  sync(world: World, isOpaque: (x: number, y: number, z: number) => boolean, reveal: ColumnReveal): void {
    const versions = [world.blockDamage.version, world.version, reveal.revealVersion];
    if (this.drawn?.every((version, at) => version === versions[at])) {
      return;
    }
    this.drawn = versions;
    const out: CrackVertices = { positions: [], normals: [], colors: [] };
    for (const [cell, { damage }] of world.blockDamage.damaged()) {
      const block = this.registry.blocks[world.getBlock(...cell)];
      const material = block?.solid ? this.registry.blockMaterials.get(block.material) : undefined;
      const crack =
        material && reveal.isRevealed(cell[0], cell[2])
          ? { reach: crackReach(damage / material.durability, material.cracks.steps), pattern: material.cracks }
          : undefined;
      if (crack && crack.reach > 0) {
        this.addCell(out, cell, crack, exposedFaces(cell, isOpaque));
      }
    }
    if (out.positions.length === 0 && (this.mesh.geometry.attributes.position?.count ?? 0) === 0) {
      return;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(out.positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(out.normals, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(out.colors, 4));
    geometry.computeBoundingSphere();
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
  }

  private addCell(
    out: CrackVertices,
    cell: Readonly<Vec3>,
    { reach, pattern }: { reach: number; pattern: CrackPattern },
    exposed: readonly CrackFace[],
  ): void {
    this.color.set(pattern.color);
    const { r, g, b } = this.color;
    for (const face of exposed) {
      const { normal, u, v } = FACES[face];
      strokeQuads(crackStrokes({ seed: this.seed, cell, face }, reach, pattern), (x, y) => {
        for (let axis = 0; axis < 3; axis++) {
          const centre = cell[axis]! + 0.5 + normal[axis]! * 0.5;
          out.positions.push((centre + (x - 0.5) * u[axis]! + (y - 0.5) * v[axis]!) * this.blockSize);
        }
        out.normals.push(...normal);
        out.colors.push(r, g, b, pattern.opacity);
      });
    }
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
