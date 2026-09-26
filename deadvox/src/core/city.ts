// A stress-test city (`?site=city`, and `&storeys=N` for taller buildings): a flat
// grid of streets around the origin, each city block packed with the hamlet's
// templates in two back-to-back rows facing the streets. It exists to measure what a
// real town costs (memory, meshing, triangles, draw calls, and furniture in play),
// not to be played through: taller buildings have no stairs between storeys.

import type { Chunk } from './chunk.ts';
import type { Registry } from './content.ts';
import { CHUNK, toChunk, type Vec3 } from './coords.ts';
import { HAMLET_BLOCK_SIZE, HAMLET_TEMPLATES } from './hamlet.ts';
import { hash3 } from './random.ts';
import type { Scale } from './scale.ts';
import { type FurnitureSpawn, furnitureOf, type Rect, rectDistance, type Site, smoothstep } from './site.ts';
import {
  type CompiledTemplate,
  compileTemplate,
  footprint,
  type Placement,
  stackTemplate,
  stampPlacement,
  type Turn,
} from './templates.ts';
import { type Surface, terrainHeight } from './worldgen.ts';

/** Layout tunables, in blocks. */
export const CITY = {
  street: 12,
  /** A city block between streets. */
  blockX: 104,
  blockZ: 64,
  /** Between a building and the street, and between the two rows. */
  pad: 2,
  /** Between buildings in a row. */
  gap: 2,
  /** The city reaches at least this far from the origin in each direction (200 m). */
  reach: 400,
  /** How far flattening reaches into the natural ground around the city. */
  blend: 24,
} as const;

/** Buildings that don't stack: the gas station's canopy is its own top storey. */
const SINGLE_STOREY = new Set(['gas_station', 'shed']);

const pitchX = CITY.street + CITY.blockX;
const pitchZ = CITY.street + CITY.blockZ;
const mod = (n: number, m: number) => ((n % m) + m) % m;

export class StressCity implements Site {
  readonly seed: number;
  readonly registry: Registry;
  readonly spawn: { pos: Vec3; yaw: number };
  /** The streets and blocks, in blocks; the flattening reaches `CITY.blend` beyond. */
  readonly bounds: Rect;
  /** Every building. */
  readonly placements: readonly Placement[];
  /** Height of the city's top ground block. */
  readonly floor: number;
  private readonly asphalt: number;
  /** Buildings by the chunk columns they overlap, keyed "cx,cz". */
  private readonly byColumn = new Map<string, Placement[]>();

  constructor(seed: number, registry: Registry, scale: Scale, maxStoreys = 1) {
    if (scale.blockSize !== HAMLET_BLOCK_SIZE) {
      throw new Error(`the city's templates need ${HAMLET_BLOCK_SIZE} m blocks`);
    }
    this.seed = seed;
    this.registry = registry;
    this.asphalt = registry.blockIds.get('asphalt')!;
    this.floor = terrainHeight(seed, scale, 0, 0);
    const nx = Math.ceil(CITY.reach / pitchX);
    const nz = Math.ceil(CITY.reach / pitchZ);
    // A street runs along every multiple of the pitch, so the city closes with one at each far edge.
    this.bounds = { x0: -nx * pitchX, z0: -nz * pitchZ, x1: nx * pitchX + CITY.street, z1: nz * pitchZ + CITY.street };
    const templates = new Map<string, CompiledTemplate>();
    const compiled = (id: string, storeys: number) => {
      const key = `${id}:${storeys}`;
      let t = templates.get(key);
      if (!t) {
        t = stackTemplate(compileTemplate(registry, registry.templates.get(id)!), storeys);
        templates.set(key, t);
      }
      return t;
    };
    const placements: Placement[] = [];
    for (let j = -nz; j < nz; j++) {
      for (let i = -nx; i < nx; i++) {
        placements.push(...this.cityBlock(i, j, compiled, Math.max(1, maxStoreys)));
      }
    }
    this.placements = placements;
    for (const p of placements) {
      this.index(p);
    }
    const mid = CITY.street / 2;
    this.spawn = {
      pos: [mid * scale.blockSize, (this.floor + 1) * scale.blockSize, mid * scale.blockSize],
      yaw: -Math.PI / 2,
    };
  }

  get surface(): Surface {
    return {
      height: (x, z, natural) => {
        const d = rectDistance(this.bounds, x, z);
        if (d >= CITY.blend) {
          return natural;
        }
        return Math.round(natural + smoothstep(1 - d / CITY.blend) * (this.floor - natural));
      },
      top: (x, z) => {
        const inside = rectDistance(this.bounds, x, z) === 0;
        const street = mod(x, pitchX) < CITY.street || mod(z, pitchZ) < CITY.street;
        return inside && street ? this.asphalt : undefined;
      },
    };
  }

  stamp(chunk: Chunk): void {
    const y0 = chunk.cy * CHUNK;
    for (const p of this.byColumn.get(`${chunk.cx},${chunk.cz}`) ?? []) {
      if (p.origin[1] < y0 + CHUNK && p.origin[1] + p.template.size[1] > y0) {
        stampPlacement(chunk, p);
      }
    }
  }

  furnitureIn(cx: number, cz: number): FurnitureSpawn[] {
    return (this.byColumn.get(`${cx},${cz}`) ?? []).flatMap((p) => furnitureOf(this, p, [cx, cz]));
  }

  // ---- internals ----

  /** Two rows of buildings in the city block (i, j): the north row faces north, the south row south. */
  private cityBlock(
    i: number,
    j: number,
    compiled: (id: string, storeys: number) => CompiledTemplate,
    maxStoreys: number,
  ) {
    const x0 = i * pitchX + CITY.street + CITY.pad;
    const x1 = (i + 1) * pitchX - CITY.pad;
    const north = j * pitchZ + CITY.street + CITY.pad;
    const south = (j + 1) * pitchZ - CITY.pad;
    const out: Placement[] = [];
    for (const [row, turn] of [
      [0, 0],
      [1, 2],
    ] as const) {
      let x = x0;
      for (let k = 0; ; k++) {
        const pick = (n: number) => Math.floor(hash3(this.seed, i * 64 + k, j * 2 + row, n) * HAMLET_TEMPLATES.length);
        const fits = (name: string) => this.width(compiled(name, 1), turn) <= x1 - x;
        // The hashed choice, or else any template that still fits the row.
        const first = HAMLET_TEMPLATES[pick(0)]!;
        const id = fits(first) ? first : HAMLET_TEMPLATES.find(fits);
        if (!id) {
          break;
        }
        const storeys = SINGLE_STOREY.has(id)
          ? 1
          : 1 + Math.floor(hash3(this.seed, i, j * 2 + row, k + 1000) * maxStoreys);
        const template = compiled(id, storeys);
        const probe: Placement = { template, origin: [0, 0, 0], turn: turn as Turn };
        const [w, d] = footprint(probe);
        out.push({ template, origin: [x, this.floor, row === 0 ? north : south - d], turn: turn as Turn });
        x += w + CITY.gap;
      }
    }
    return out;
  }

  private width(template: CompiledTemplate, turn: number): number {
    return footprint({ template, origin: [0, 0, 0], turn: turn as Turn })[0];
  }

  private index(p: Placement): void {
    const [w, d] = footprint(p);
    for (let cz = toChunk(p.origin[2]); cz <= toChunk(p.origin[2] + d - 1); cz++) {
      for (let cx = toChunk(p.origin[0]); cx <= toChunk(p.origin[0] + w - 1); cx++) {
        const key = `${cx},${cz}`;
        const list = this.byColumn.get(key) ?? [];
        list.push(p);
        this.byColumn.set(key, list);
      }
    }
  }
}
