import { expect, it } from 'vitest';
import { CHUNK, type Vec3 } from '../src/core/coords.ts';
import { deriveFencePosts, type FencePostDefs } from '../src/core/fencePosts.ts';
import { buildMesh } from '../src/core/mesher.ts';
import { extractPadded, PADDED, paddedIndex } from '../src/core/meshInput.ts';
import { World } from '../src/core/world.ts';

const definition = { widthBlocks: 0.2, spacingBlocks: 7 };
const definitions: FencePostDefs = [undefined, definition];
const middle: Vec3 = [Math.floor(CHUNK / 2), 2, Math.floor(CHUNK / 2)];
const cell = (padded: Uint16Array, [x, y, z]: Vec3) => {
  padded[paddedIndex(x + 1, y + 1, z + 1)] = 1;
};
const column = (post: ReturnType<typeof deriveFencePosts>[number]): Vec3 => [
  (post.min[0] + post.max[0]) / 2 - 0.5,
  post.min[1],
  (post.min[2] + post.max[2]) / 2 - 0.5,
];

it('supports isolated cells, ends, corners, T junctions and crossings, not arbitrary straight cells', () => {
  const neighbours: Vec3[] = [
    [-1, 0, 0],
    [1, 0, 0],
    [0, 0, -1],
    [0, 0, 1],
  ];
  // Each mask is a horizontal connection topology, independent of content ids or world layout.
  for (const mask of [0, 1, 3, 5, 7, 15]) {
    const padded = new Uint16Array(PADDED ** 3);
    cell(padded, middle);
    neighbours.forEach((offset, direction) => {
      if (mask & (1 << direction)) {
        cell(padded, middle.map((value, axis) => value + offset[axis]!) as Vec3);
      }
    });
    const supportsMiddle = deriveFencePosts(padded, definitions, [0, 0, 0]).some((post) =>
      column(post).every((value, axis) => value === middle[axis]),
    );
    expect(supportsMiddle, `connection mask ${mask}`).toBe(mask !== 3);
  }
});

it('spaces straight-run poles on the world lattice in either direction, including negative chunks', () => {
  for (const axis of [0, 2] as const) {
    const padded = new Uint16Array(PADDED ** 3);
    for (let along = -1; along <= CHUNK; along++) {
      const pos: Vec3 = [...middle];
      pos[axis] = along;
      cell(padded, pos);
    }
    for (const chunk of [-1, 0, 1]) {
      const origin: Vec3 = [0, 0, 0];
      origin[axis] = chunk * CHUNK;
      const poles = deriveFencePosts(padded, definitions, origin);
      expect(poles.length).toBeGreaterThan(0);
      const cells = new Set(poles.map((post) => column(post)[axis]));
      for (let along = 0; along < CHUNK; along++) {
        expect(cells.has(along)).toBe((origin[axis] + along) % definition.spacingBlocks === 0);
      }
    }
  }
});

it('owns each boundary pole once and preserves its placement across reversed rebuild order', () => {
  const world = new World();
  const interval = CHUNK;
  const table: FencePostDefs = [undefined, { ...definition, spacingBlocks: interval }];
  for (let x = -1; x <= 2 * CHUNK; x++) {
    world.setBlock(x, middle[1], middle[2], 1);
  }
  const derive = (chunk: number) =>
    deriveFencePosts(extractPadded(world, [chunk, 0, 0]), table, [chunk * CHUNK, 0, 0]).map((post) =>
      column(post)
        .map((value, axis) => value + (axis === 0 ? chunk * CHUNK : 0))
        .join(','),
    );
  const forward = [0, 1].flatMap(derive);
  const reverse = [1, 0].flatMap(derive);
  expect(new Set(forward).size).toBe(forward.length);
  expect(new Set(reverse)).toEqual(new Set(forward));
  for (const poles of [forward, reverse]) {
    expect(poles).toContain([CHUNK, middle[1], middle[2]].join(','));
    expect(poles.every((key) => Number(key.split(',')[0]) % interval === 0)).toBe(true);
  }
});

it('joins vertical segments at chunk boundaries without doubling their end caps', () => {
  const world = new World();
  for (let y = CHUNK - 2; y <= CHUNK + 1; y++) {
    world.setBlock(middle[0], y, middle[2], 1);
  }
  const lower = deriveFencePosts(extractPadded(world, [0, 0, 0]), definitions, [0, 0, 0]);
  const upper = deriveFencePosts(extractPadded(world, [0, 1, 0]), definitions, [0, CHUNK, 0]);
  expect(lower.length).toBeGreaterThan(0);
  expect(upper.length).toBeGreaterThan(0);
  expect(lower.every((post) => post.capBottom && !post.capTop)).toBe(true);
  expect(upper.every((post) => !post.capBottom && post.capTop)).toBe(true);
});

it('emits content-sized pole surfaces in the chunk mesh without growing the fence cell bounds', () => {
  const padded = new Uint16Array(PADDED ** 3);
  cell(padded, middle);
  const colors = new Uint8Array([0, 0, 0, 100, 150, 200]);
  const options = { wireMeshes: [undefined, { cellsPerBlock: 2, wireFraction: 0.1 }] };
  const plain = buildMesh(padded, colors, options);
  const withPosts = buildMesh(padded, colors, { ...options, fencePosts: definitions });
  expect(withPosts.indices.length).toBeGreaterThan(plain.indices.length);
  const vertices = Array.from({ length: withPosts.positions.length / 3 }, (_, index) =>
    Array.from(withPosts.positions.slice(index * 3, index * 3 + 3)),
  );
  const half = definition.widthBlocks / 2;
  expect(
    vertices.some(
      ([x, , z]) => Math.abs(x! - (middle[0] + 0.5 - half)) < 1e-5 && Math.abs(z! - (middle[2] + 0.5 - half)) < 1e-5,
    ),
  ).toBe(true);
  expect(
    vertices.every((vertex) => vertex.every((value, axis) => value >= middle[axis]! && value <= middle[axis]! + 1)),
  ).toBe(true);
});
