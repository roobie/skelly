import type { MissingFlesh } from './amalgamCarving.ts';
import type { AmalgamFigure } from './amalgamFigure.ts';
import type { Vec3 } from './coords.ts';
import { type BodyShape, CONTACT_SKIN } from './physics.ts';
import { BRICK_BITS, type BrickOut, brickHas, brickLayer, type SolidBricks } from './solidBricks.ts';

// The amalgam moves as its own flesh, not a box (#563): an octree over its rest-pose voxels, in its own frame
// and turned to its facing, is tested against the world's solid bricks (core/solidBricks.ts), and each side
// prunes the other, so a wall or an empty brick costs a few box tests. The rest pose stands for the moving
// body: limbs that sway are not followed.

/** Leaves hold 2×2×2 voxels, one bit each (bit di + 2dj + 4dk). */
const LEAF_BITS = 1;
/**
 * Terrain answers remembered, the newest overwriting the oldest: a blocked step asks the same places again,
 * retrying the move after its step-up fails and starting the next tick where the last contact search ended.
 */
const MEMO = 8;
const BRICK = 1 << BRICK_BITS;
/** One row of a brick layer: BRICK bits along x. */
const ROW = (1 << BRICK) - 1;
/** Horizontal pushes off terrain, per axis: the normals of a block's sides, then the diagonals between them. */
const PUSHES: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
/**
 * The maximum push along any axis, in blocks. The cap keeps a snapped background turn from jumping the
 * body far.
 */
const PUSH_LIMIT = 0.45;

/** The index of the lowest set bit. */
const lowBit = (bits: number): number => 31 - Math.clz32(bits & -bits);
/** One past the index of the highest set bit. */
const highBit = (bits: number): number => 32 - Math.clz32(bits);
/** Set bits in a 16-bit value. */
const popCount = (bits: number): number => {
  let count = bits - ((bits >>> 1) & 0x55_55);
  count = (count & 0x33_33) + ((count >>> 2) & 0x33_33);
  count = (count + (count >>> 4)) & 0x0f_0f;
  return (count + (count >>> 8)) & 0x1f;
};

/** The octree's layout for one figure at one block size, shared by every amalgam with that figure. */
interface ShapeTree {
  readonly owner: Uint8Array;
  readonly dims: readonly [number, number, number];
  /** Voxel edge in blocks. */
  readonly voxel: number;
  /** Local centre of voxel (0, 0, 0) in blocks, from the ground origin, facing -z. */
  readonly base: Vec3;
  /** Per node: first index into `children` and how many; leaves have none. */
  readonly childStart: Int32Array;
  readonly childCount: Uint8Array;
  readonly children: Int32Array;
  /** Per leaf node: its first voxel cell (i, j, k); -1 for inner nodes. */
  readonly leafCell: Int32Array;
  /** Per node: its parent, -1 for the root. */
  readonly parent: Int32Array;
  /** Per voxel cell: the leaf holding it, -1 for a cell with no flesh. */
  readonly leafOf: Int32Array;
  /** Nodes in build order: every child comes before its parent, and the root is last. */
  readonly nodeCount: number;
}

interface TreeNodes {
  readonly childStart: number[];
  readonly childCount: number[];
  readonly children: number[];
  readonly leafCell: number[];
  readonly parent: number[];
  readonly leafOf: Int32Array;
}

interface TreeLevel {
  readonly nodes: Int32Array;
  readonly dims: readonly number[];
}

/** One leaf per 2×2×2 voxels holding any flesh. */
const leafLevel = (owner: Uint8Array, dims: readonly number[], tree: TreeNodes): TreeLevel => {
  const levelDims = dims.map((n) => Math.ceil(n / (1 << LEAF_BITS)));
  const nodes = new Int32Array(levelDims[0]! * levelDims[1]! * levelDims[2]!).fill(-1);
  for (let cell = 0; cell < owner.length; cell++) {
    if (owner[cell] === 0) {
      continue;
    }
    const i = cell % dims[0]!;
    const j = Math.floor(cell / dims[0]!) % dims[1]!;
    const k = Math.floor(cell / (dims[0]! * dims[1]!));
    const slot = (i >> 1) + levelDims[0]! * ((j >> 1) + levelDims[1]! * (k >> 1));
    if (nodes[slot] === -1) {
      nodes[slot] = tree.leafCell.length;
      tree.leafCell.push((i >> 1) * 2 + dims[0]! * ((j >> 1) * 2 + dims[1]! * ((k >> 1) * 2)));
      tree.childStart.push(0);
      tree.childCount.push(0);
      tree.parent.push(-1);
    }
    tree.leafOf[cell] = nodes[slot]!;
  }
  return { nodes, dims: levelDims };
};

/** The level above `level`: each node groups up to 2×2×2 nodes below it. */
const parentLevel = (level: TreeLevel, tree: TreeNodes): TreeLevel => {
  const dims = level.dims.map((n) => Math.ceil(n / 2));
  const nodes = new Int32Array(dims[0]! * dims[1]! * dims[2]!).fill(-1);
  const grouped = new Map<number, number[]>();
  level.nodes.forEach((node, index) => {
    if (node < 0) {
      return;
    }
    const x = index % level.dims[0]!;
    const y = Math.floor(index / level.dims[0]!) % level.dims[1]!;
    const z = Math.floor(index / (level.dims[0]! * level.dims[1]!));
    const slot = (x >> 1) + dims[0]! * ((y >> 1) + dims[1]! * (z >> 1));
    const group = grouped.get(slot) ?? [];
    group.push(node);
    grouped.set(slot, group);
  });
  for (const [slot, group] of [...grouped].sort((a, b) => a[0] - b[0])) {
    const node = tree.leafCell.length;
    nodes[slot] = node;
    tree.leafCell.push(-1);
    tree.childStart.push(tree.children.length);
    tree.childCount.push(group.length);
    tree.children.push(...group);
    tree.parent.push(-1);
    for (const child of group) {
      tree.parent[child] = node;
    }
  }
  return { nodes, dims };
};

const buildTree = (figure: AmalgamFigure, blockSize: number): ShapeTree => {
  const { dims, owner, size, origin } = figure.realized.voxels;
  const metres = size * figure.scale;
  const tree: TreeNodes = {
    childStart: [],
    childCount: [],
    children: [],
    leafCell: [],
    parent: [],
    leafOf: new Int32Array(owner.length).fill(-1),
  };
  let level = leafLevel(owner, dims, tree);
  while (level.nodes.filter((node) => node >= 0).length > 1) {
    level = parentLevel(level, tree);
  }
  return {
    owner,
    dims,
    voxel: metres / blockSize,
    base: [
      (origin[0] * metres + figure.originOffset[0]) / blockSize,
      ((origin[1] + 0.5) * metres + figure.originOffset[1]) / blockSize,
      (origin[2] * metres + figure.originOffset[2]) / blockSize,
    ],
    childStart: Int32Array.from(tree.childStart),
    childCount: Uint8Array.from(tree.childCount),
    children: Int32Array.from(tree.children),
    leafCell: Int32Array.from(tree.leafCell),
    parent: Int32Array.from(tree.parent),
    leafOf: tree.leafOf,
    nodeCount: tree.leafCell.length,
  };
};

const trees = new WeakMap<AmalgamFigure, Map<number, ShapeTree>>();

const treeFor = (figure: AmalgamFigure, blockSize: number): ShapeTree => {
  let bySize = trees.get(figure);
  if (!bySize) {
    bySize = new Map();
    trees.set(figure, bySize);
  }
  let tree = bySize.get(blockSize);
  if (!tree) {
    tree = buildTree(figure, blockSize);
    bySize.set(blockSize, tree);
  }
  return tree;
};

/**
 * Whether a box turned about y overlaps an axis-aligned box: separating axes are world x and z, the turned
 * box's own x and z, and y. Boxes that only touch don't overlap. The turned box has world centre (x, y, z),
 * half extents (hx, hy, hz) in its own frame and its own x axis along world (c, -s); `target` holds the
 * axis-aligned box's centre, then its half extents.
 */
// biome-ignore lint/complexity/useMaxParams: it runs per voxel and per node each tick; scalars keep it allocation-free.
const turnedBoxOverlaps = (
  x: number,
  y: number,
  z: number,
  hx: number,
  hy: number,
  hz: number,
  c: number,
  s: number,
  target: Float64Array,
): boolean => {
  const ac = Math.abs(c);
  const as = Math.abs(s);
  const dx = x - target[0]!;
  const dz = z - target[2]!;
  const bhx = target[3]!;
  const bhz = target[5]!;
  return (
    Math.abs(y - target[1]!) < target[4]! + hy &&
    Math.abs(dx) < bhx + hx * ac + hz * as &&
    Math.abs(dz) < bhz + hx * as + hz * ac &&
    Math.abs(dx * c - dz * s) < hx + bhx * ac + bhz * as &&
    Math.abs(dx * s + dz * c) < hz + bhx * as + bhz * ac
  );
};

/** What a live voxel the walk reaches is tested against: the target box, or the solid blocks of one brick. */
type VoxelTest = 'box' | 'brick';

/** One amalgam's flesh as a collision shape: shed members and carved holes leave it, and it turns to face. */
export class AmalgamShape implements BodyShape {
  private readonly tree: ShapeTree;
  private readonly terrain: SolidBricks;
  /** Per node: live voxels (leaves) and the tight local box around them, min then max, in blocks. */
  private readonly masks: Uint8Array;
  private readonly bounds: Float64Array;
  private readonly stack: Int32Array;
  /** The box the walk prunes against: centre, then half extents. */
  private readonly target = new Float64Array(6);
  /** One unit block, laid out as `target`. */
  private readonly block = Float64Array.of(0, 0, 0, 0.5, 0.5, 0.5);
  /** The brick being walked; then its origin and the box of the layers being walked, in blocks: min, exclusive max. */
  private readonly brick: BrickOut = { lo: 0, hi: 0 };
  private readonly span = new Int32Array(9);
  /** Whether those layers are solid throughout their box, so the box alone answers. */
  private full = false;
  /** Whether a walk notes every overlap's push needs (`pushOut`) instead of stopping at the first. */
  private gathering = false;
  /** How far each of PUSHES must move the overlapping voxels to clear them, along each axis it moves on. */
  private readonly needs = new Float64Array(PUSHES.length);
  private readonly probe: Vec3 = [0, 0, 0];
  /** Per remembered answer: x, y, z, c, s, then 1 or 0. Kept while the terrain version and the flesh stay. */
  private readonly memo = new Float64Array(MEMO * 6).fill(Number.NaN);
  private memoNext = 0;
  private memoVersion = Number.NaN;
  /** Per voxel cell, 1 once carved out; per bone, 1 once shed. */
  private readonly gone: Uint8Array;
  private goneCount = 0;
  private readonly shed = new Uint8Array(256);
  private c = 1;
  private s = 0;
  private facingX = 0;
  private facingZ = -1;
  private carved: readonly number[] | undefined;
  private severedCount = -1;

  constructor(figure: AmalgamFigure, blockSize: number, terrain: SolidBricks) {
    this.tree = treeFor(figure, blockSize);
    this.terrain = terrain;
    this.masks = new Uint8Array(this.tree.nodeCount);
    this.bounds = new Float64Array(this.tree.nodeCount * 6);
    this.stack = new Int32Array(this.tree.nodeCount);
    this.gone = new Uint8Array(this.tree.owner.length);
  }

  /** Turns the shape to `facing`, as the posed figure turns (core/zombiePose.ts, `yaw`). */
  face(facing: Vec3): void {
    if (facing[0] === this.facingX && facing[2] === this.facingZ) {
      return;
    }
    this.facingX = facing[0];
    this.facingZ = facing[2];
    const yaw = Math.atan2(-facing[0], -facing[2]);
    this.c = Math.cos(yaw);
    this.s = Math.sin(yaw);
  }

  /**
   * Drops the flesh the amalgam has lost: redone only when its carved list (replaced on every carve) or its
   * severed count moves.
   */
  keep(carved: readonly number[], severedCount: number, lost: () => MissingFlesh): void {
    if (carved === this.carved && severedCount === this.severedCount) {
      return;
    }
    const missing = lost();
    this.memo.fill(Number.NaN);
    if (severedCount === this.severedCount && this.carveMore(missing)) {
      this.carved = carved;
      return;
    }
    this.carved = carved;
    this.severedCount = severedCount;
    this.gone.fill(0);
    for (const cell of missing.carved) {
      this.gone[cell] = 1;
    }
    this.goneCount = missing.carved.size;
    this.shed.fill(0);
    for (const bone of missing.severedOwners) {
      this.shed[bone] = 1;
    }
    for (let node = 0; node < this.tree.nodeCount; node++) {
      if (this.tree.leafCell[node]! >= 0) {
        this.keepLeaf(node);
      } else {
        this.keepParent(node);
      }
    }
  }

  /**
   * A carve only adds holes, so only the leaves that lost a voxel, and their ancestors, are redone. False when
   * the carved cells are not the old ones plus more, which takes a full rebuild.
   */
  private carveMore(missing: MissingFlesh): boolean {
    const { leafOf, parent } = this.tree;
    const fresh: number[] = [];
    for (const cell of missing.carved) {
      if (this.gone[cell] === 0) {
        fresh.push(cell);
      }
    }
    if (this.goneCount + fresh.length !== missing.carved.size) {
      return false;
    }
    const redo: number[] = [];
    for (const cell of fresh) {
      this.gone[cell] = 1;
      if (leafOf[cell]! >= 0) {
        redo.push(leafOf[cell]!);
      }
    }
    this.goneCount = missing.carved.size;
    // Up to the root (the loop reaches the parents it adds), then each node once, children before parents.
    for (const node of redo) {
      const up = parent[node]!;
      if (up >= 0) {
        redo.push(up);
      }
    }
    for (const node of [...new Set(redo)].sort((a, b) => a - b)) {
      if (this.tree.leafCell[node]! >= 0) {
        this.keepLeaf(node);
      } else {
        this.keepParent(node);
      }
    }
    return true;
  }

  private keepLeaf(node: number): void {
    const { gone, shed } = this;
    const { owner, dims, voxel, base, leafCell } = this.tree;
    const half = voxel / 2;
    const cell = leafCell[node]!;
    const i0 = cell % dims[0];
    const j0 = Math.floor(cell / dims[0]) % dims[1];
    const k0 = Math.floor(cell / (dims[0] * dims[1]));
    let mask = 0;
    for (let bit = 0; bit < 8; bit++) {
      const i = i0 + (bit & 1);
      const j = j0 + ((bit >> 1) & 1);
      const k = k0 + (bit >> 2);
      const index = i + dims[0] * (j + dims[1] * k);
      const bone = i < dims[0] && j < dims[1] && k < dims[2] ? owner[index]! : 0;
      if (bone !== 0 && shed[bone] === 0 && gone[index] === 0) {
        mask |= 1 << bit;
      }
    }
    this.masks[node] = mask;
    const at = node * 6;
    if (mask === 0) {
      this.bounds.fill(Number.POSITIVE_INFINITY, at, at + 3);
      this.bounds.fill(Number.NEGATIVE_INFINITY, at + 3, at + 6);
      return;
    }
    // The bits at the low and high voxel along each axis: 0x55 and 0xaa along i, 0x33 and 0xcc along j,
    // 0x0f and 0xf0 along k.
    this.bounds[at] = base[0] + (i0 + ((mask & 0x55) === 0 ? 1 : 0)) * voxel - half;
    this.bounds[at + 1] = base[1] + (j0 + ((mask & 0x33) === 0 ? 1 : 0)) * voxel - half;
    this.bounds[at + 2] = base[2] + (k0 + ((mask & 0x0f) === 0 ? 1 : 0)) * voxel - half;
    this.bounds[at + 3] = base[0] + (i0 + ((mask & 0xaa) === 0 ? 0 : 1)) * voxel + half;
    this.bounds[at + 4] = base[1] + (j0 + ((mask & 0xcc) === 0 ? 0 : 1)) * voxel + half;
    this.bounds[at + 5] = base[2] + (k0 + ((mask & 0xf0) === 0 ? 0 : 1)) * voxel + half;
  }

  private keepParent(node: number): void {
    const { childStart, childCount, children } = this.tree;
    const { bounds } = this;
    const at = node * 6;
    for (let axis = 0; axis < 3; axis++) {
      let low = Number.POSITIVE_INFINITY;
      let high = Number.NEGATIVE_INFINITY;
      for (let child = childStart[node]!; child < childStart[node]! + childCount[node]!; child++) {
        const from = children[child]! * 6 + axis;
        low = Math.min(low, bounds[from]!);
        high = Math.max(high, bounds[from + 3]!);
      }
      bounds[at + axis] = low;
      bounds[at + 3 + axis] = high;
    }
  }

  /** Whether node's turned box, with the shape's base centre at `pos`, overlaps the target box. */
  private nodeOverlaps(node: number, pos: Vec3): boolean {
    const { bounds } = this;
    const at = node * 6;
    const minX = bounds[at]!;
    if (!(minX <= bounds[at + 3]!)) {
      return false;
    }
    const lx = (minX + bounds[at + 3]!) / 2;
    const ly = (bounds[at + 1]! + bounds[at + 4]!) / 2;
    const lz = (bounds[at + 2]! + bounds[at + 5]!) / 2;
    return turnedBoxOverlaps(
      pos[0] + this.c * lx + this.s * lz,
      pos[1] + ly,
      pos[2] - this.s * lx + this.c * lz,
      bounds[at + 3]! - lx,
      bounds[at + 4]! - ly,
      bounds[at + 5]! - lz,
      this.c,
      this.s,
      this.target,
    );
  }

  /** Walks the octree, pruned by the target box, and tests each live voxel it reaches by `test`. */
  private walk(pos: Vec3, test: VoxelTest): boolean {
    const { childStart, childCount, children, leafCell, nodeCount } = this.tree;
    const root = nodeCount - 1;
    if (!this.nodeOverlaps(root, pos)) {
      return false;
    }
    this.stack[0] = root;
    let top = 1;
    while (top > 0) {
      top -= 1;
      const node = this.stack[top]!;
      if (leafCell[node]! >= 0) {
        if (this.leafHits(node, pos, test)) {
          return true;
        }
        continue;
      }
      for (let child = childStart[node]!; child < childStart[node]! + childCount[node]!; child++) {
        const next = children[child]!;
        if (this.nodeOverlaps(next, pos)) {
          this.stack[top] = next;
          top += 1;
        }
      }
    }
    return false;
  }

  private leafHits(node: number, pos: Vec3, test: VoxelTest): boolean {
    const { dims, voxel, base, leafCell } = this.tree;
    const cell = leafCell[node]!;
    const mask = this.masks[node]!;
    const half = voxel / 2;
    const i0 = cell % dims[0];
    const j0 = Math.floor(cell / dims[0]) % dims[1];
    const k0 = Math.floor(cell / (dims[0] * dims[1]));
    for (let bit = 0; bit < 8; bit++) {
      if (((mask >> bit) & 1) === 0) {
        continue;
      }
      const lx = base[0] + (i0 + (bit & 1)) * voxel;
      const y = pos[1] + base[1] + (j0 + ((bit >> 1) & 1)) * voxel;
      const lz = base[2] + (k0 + (bit >> 2)) * voxel;
      const x = pos[0] + this.c * lx + this.s * lz;
      const z = pos[2] - this.s * lx + this.c * lz;
      if (
        test === 'box'
          ? turnedBoxOverlaps(x, y, z, half, half, half, this.c, this.s, this.target)
          : this.voxelInBrick(x, y, z)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Whether the voxel centred at (x, y, z) overlaps a solid block of the brick being walked. While gathering,
   * it notes how far each push must move the voxel off what it overlaps, and answers false so the walk goes on.
   */
  private voxelInBrick(x: number, y: number, z: number): boolean {
    const { span, block } = this;
    const half = this.tree.voxel / 2;
    if (this.full) {
      return (
        turnedBoxOverlaps(x, y, z, half, half, half, this.c, this.s, this.target) &&
        this.overlapFound(x, z, this.target)
      );
    }
    const reach = half * (Math.abs(this.c) + Math.abs(this.s));
    const toX = Math.min(span[6]! - 1, Math.ceil(x + reach) - 1);
    const toY = Math.min(span[7]! - 1, Math.ceil(y + half) - 1);
    const toZ = Math.min(span[8]! - 1, Math.ceil(z + reach) - 1);
    for (let blockY = Math.max(span[4]!, Math.floor(y - half)); blockY <= toY; blockY++) {
      for (let blockZ = Math.max(span[5]!, Math.floor(z - reach)); blockZ <= toZ; blockZ++) {
        for (let blockX = Math.max(span[3]!, Math.floor(x - reach)); blockX <= toX; blockX++) {
          block[0] = blockX + 0.5;
          block[1] = blockY + 0.5;
          block[2] = blockZ + 0.5;
          if (
            brickHas(this.brick, blockX - span[0]!, blockY - span[1]!, blockZ - span[2]!) &&
            turnedBoxOverlaps(x, y, z, half, half, half, this.c, this.s, block) &&
            this.overlapFound(x, z, block)
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /** A voxel at (x, z) overlaps `box`: true ends the walk; while gathering, it is noted and the walk goes on. */
  private overlapFound(x: number, z: number, box: Float64Array): boolean {
    if (!this.gathering) {
      return true;
    }
    this.noteNeeds(x, z, box);
    return false;
  }

  /**
   * Widens each push's need to move the voxel centred at (x, z) clear of `box` (laid out as `target`), from the
   * voxel's own world box: a side's push clears it past that side, a diagonal's past either of its two.
   */
  private noteNeeds(x: number, z: number, box: Float64Array): void {
    const { needs } = this;
    const reach = (this.tree.voxel / 2) * (Math.abs(this.c) + Math.abs(this.s));
    const plusX = box[0]! + box[3]! - (x - reach);
    const minusX = x + reach - (box[0]! - box[3]!);
    const plusZ = box[2]! + box[5]! - (z - reach);
    const minusZ = z + reach - (box[2]! - box[5]!);
    needs[0] = Math.max(needs[0]!, plusX);
    needs[1] = Math.max(needs[1]!, minusX);
    needs[2] = Math.max(needs[2]!, plusZ);
    needs[3] = Math.max(needs[3]!, minusZ);
    needs[4] = Math.max(needs[4]!, Math.min(plusX, plusZ));
    needs[5] = Math.max(needs[5]!, Math.min(plusX, minusZ));
    needs[6] = Math.max(needs[6]!, Math.min(minusX, plusZ));
    needs[7] = Math.max(needs[7]!, Math.min(minusX, minusZ));
  }

  /**
   * Whether the flesh overlaps the solid blocks of brick (bx, by, bz). Each run of identical block layers is
   * walked under its own box, so a floor layer under a wall doesn't widen the wall's box into the flesh above.
   */
  private brickHits(pos: Vec3, bx: number, by: number, bz: number): boolean {
    if (!this.terrain.brick(bx, by, bz, this.brick)) {
      return false;
    }
    const { span } = this;
    span[0] = bx << BRICK_BITS;
    span[1] = by << BRICK_BITS;
    span[2] = bz << BRICK_BITS;
    let layer = 0;
    while (layer < BRICK) {
      const mask = brickLayer(this.brick, layer);
      let end = layer + 1;
      while (end < BRICK && brickLayer(this.brick, end) === mask) {
        end += 1;
      }
      if (mask !== 0 && this.layersHit(pos, mask, layer, end)) {
        return true;
      }
      layer = end;
    }
    return false;
  }

  /** Whether the flesh overlaps layers `from` to `to` (exclusive) of the brick, each solid as `mask`. */
  private layersHit(pos: Vec3, mask: number, from: number, to: number): boolean {
    const { span, target } = this;
    let columns = 0;
    let rows = 0;
    for (let z = 0; z < BRICK; z++) {
      const row = (mask >> (BRICK * z)) & ROW;
      columns |= row;
      rows |= row === 0 ? 0 : 1 << z;
    }
    span[3] = span[0]! + lowBit(columns);
    span[4] = span[1]! + from;
    span[5] = span[2]! + lowBit(rows);
    span[6] = span[0]! + highBit(columns);
    span[7] = span[1]! + to;
    span[8] = span[2]! + highBit(rows);
    for (let axis = 0; axis < 3; axis++) {
      target[axis] = (span[3 + axis]! + span[6 + axis]!) / 2;
      target[3 + axis] = (span[6 + axis]! - span[3 + axis]!) / 2;
    }
    this.full = popCount(mask) === (span[6]! - span[3]!) * (span[8]! - span[5]!);
    return this.walk(pos, 'brick');
  }

  /**
   * The shortest horizontal push that clears the shape at `pos` of terrain, moving it at most `reach` (and
   * PUSH_LIMIT) along each axis: along a block side's normal or a diagonal between two. One walk notes how
   * far every overlapping voxel must move each way, then the pushes are tried shortest first, since moving
   * can meet blocks the shape didn't overlap. Undefined when none clears it.
   */
  pushOut(pos: Vec3, reach: number): Vec3 | undefined {
    const { needs, probe } = this;
    needs.fill(0);
    this.gathering = true;
    this.terrainHit(pos);
    this.gathering = false;
    const limit = Math.min(reach, PUSH_LIMIT);
    const length = (push: number): number => needs[push]! * Math.hypot(...PUSHES[push]!);
    const order = PUSHES.map((_, push) => push)
      .filter((push) => needs[push]! <= limit)
      .sort((a, b) => length(a) - length(b));
    for (const push of order) {
      const [ux, uz] = PUSHES[push]!;
      const along = needs[push]! + CONTACT_SKIN;
      probe[0] = pos[0] + ux * along;
      probe[1] = pos[1];
      probe[2] = pos[2] + uz * along;
      if (!this.overlapsTerrain(probe)) {
        return [ux * along, 0, uz * along];
      }
    }
    return undefined;
  }

  /** How far its flesh reaches from the upright axis it turns about, at most, in blocks. */
  get radius(): number {
    const { bounds } = this;
    const at = (this.tree.nodeCount - 1) * 6;
    return Math.hypot(Math.max(-bounds[at]!, bounds[at + 3]!), Math.max(-bounds[at + 2]!, bounds[at + 5]!));
  }

  overlapsBox(pos: Vec3, min: Vec3, max: Vec3): boolean {
    for (let axis = 0; axis < 3; axis++) {
      this.target[axis] = (min[axis]! + max[axis]!) / 2;
      this.target[3 + axis] = (max[axis]! - min[axis]!) / 2;
    }
    return this.walk(pos, 'box');
  }

  overlapsTerrain(pos: Vec3): boolean {
    const { version } = this.terrain;
    if (version !== this.memoVersion) {
      this.memo.fill(Number.NaN);
      this.memoVersion = version;
    }
    const { memo } = this;
    for (let at = 0; at < memo.length; at += 6) {
      if (
        memo[at] === pos[0] &&
        memo[at + 1] === pos[1] &&
        memo[at + 2] === pos[2] &&
        memo[at + 3] === this.c &&
        memo[at + 4] === this.s
      ) {
        return memo[at + 5] === 1;
      }
    }
    const hit = this.terrainHit(pos);
    const at = this.memoNext * 6;
    memo[at] = pos[0];
    memo[at + 1] = pos[1];
    memo[at + 2] = pos[2];
    memo[at + 3] = this.c;
    memo[at + 4] = this.s;
    memo[at + 5] = hit ? 1 : 0;
    this.memoNext = (this.memoNext + 1) % MEMO;
    return hit;
  }

  private terrainHit(pos: Vec3): boolean {
    const { bounds } = this;
    const at = (this.tree.nodeCount - 1) * 6;
    if (!(bounds[at]! <= bounds[at + 3]!)) {
      return false;
    }
    // The root's world box bounds the bricks to read.
    const lx = (bounds[at]! + bounds[at + 3]!) / 2;
    const lz = (bounds[at + 2]! + bounds[at + 5]!) / 2;
    const ac = Math.abs(this.c);
    const as = Math.abs(this.s);
    const cx = pos[0] + this.c * lx + this.s * lz;
    const cz = pos[2] - this.s * lx + this.c * lz;
    const wx = (bounds[at + 3]! - lx) * ac + (bounds[at + 5]! - lz) * as;
    const wz = (bounds[at + 3]! - lx) * as + (bounds[at + 5]! - lz) * ac;
    const x1 = Math.floor(cx + wx) >> BRICK_BITS;
    const y1 = Math.floor(pos[1] + bounds[at + 4]!) >> BRICK_BITS;
    const z1 = Math.floor(cz + wz) >> BRICK_BITS;
    for (let by = Math.floor(pos[1] + bounds[at + 1]!) >> BRICK_BITS; by <= y1; by++) {
      for (let bz = Math.floor(cz - wz) >> BRICK_BITS; bz <= z1; bz++) {
        for (let bx = Math.floor(cx - wx) >> BRICK_BITS; bx <= x1; bx++) {
          if (this.brickHits(pos, bx, by, bz)) {
            return true;
          }
        }
      }
    }
    return false;
  }
}
