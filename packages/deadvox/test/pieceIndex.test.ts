import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { BlockEntities, type BlockEntitiesState, type BlockEntity, isBodyDoor } from '../src/core/blockEntities.ts';
import type { FurnitureDef } from '../src/core/content.ts';
import { CHUNK, toChunk, type Vec3 } from '../src/core/coords.ts';
import { type BrickOut, worldBricks } from '../src/core/solidBricks.ts';
import { World } from '../src/core/world.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const defs = [...registry.furniture.values()];
/** A breakable doorway leaf wider than one cell, so it can straddle a column seam. */
const doorDef = defs.find((def) => def.door?.breach && !def.door.hatch && !isBodyDoor(def) && def.size[0] > 1);
const blockDef = defs.find((def) => !(def.door || def.container || def.vehicle || def.climbable));
if (!(doorDef && blockDef)) {
  throw new Error('Base content has no wide breakable door or plain piece for the index fixture');
}

const spec = (def: FurnitureDef, pos: Vec3) => ({
  type: def.id,
  pos,
  size: [...def.size] as Vec3,
  facing: 'n' as const,
});

/** The columns a standing piece's cells reach into. */
const columnsOf = ({ pos, size }: BlockEntity): Set<string> => {
  const columns = new Set<string>();
  const [x0, , z0] = pos;
  const [width, , depth] = size;
  for (let x = x0; x < x0 + width; x++) {
    for (let z = z0; z < z0 + depth; z++) {
      columns.add(`${toChunk(x)},${toChunk(z)}`);
    }
  }
  return columns;
};

/** What `near` must list for a box of chunk columns: a full scan of the standing pieces, in its order. */
const scanColumns = (entities: BlockEntities, columns: readonly string[]): number[] =>
  [...entities.all]
    .filter((entity) => columns.some((column) => columnsOf(entity).has(column)))
    .map((entity) => entity.uid);

/**
 * Where the indexes disagree with a full scan: each column around the seams the fixture straddles, one at a time,
 * then two together, and every piece by its uid.
 */
const indexMismatches = (entities: BlockEntities): string[] => {
  const boxes: [low: Vec3, high: Vec3, columns: string[]][] = [
    [
      [0, 0, 0],
      [2 * CHUNK - 1, 0, CHUNK - 1],
      ['0,0', '1,0'],
    ],
  ];
  for (let cx = -2; cx <= 2; cx++) {
    for (let cz = -1; cz <= 1; cz++) {
      boxes.push([[cx * CHUNK, 0, cz * CHUNK], [cx * CHUNK + CHUNK - 1, 0, cz * CHUNK + CHUNK - 1], [`${cx},${cz}`]]);
    }
  }
  const mismatches = boxes.flatMap(([low, high, columns]) => {
    const listed = entities.near(low, high).map((entity) => entity.uid);
    const scanned = scanColumns(entities, columns);
    return listed.join() === scanned.join() ? [] : [`${columns.join(' ')}: listed ${listed}, scanned ${scanned}`];
  });
  for (const entity of entities.records) {
    if (entities.byUid(entity.uid) !== entity) {
      mismatches.push(`uid ${entity.uid}`);
    }
  }
  return mismatches;
};

it('lists the pieces of each column as a full scan does through adds, moves, removal, a breach and a restore', () => {
  const entities = new BlockEntities(registry);
  const seamDoor = entities.add(spec(doorDef, [CHUNK - 1, 0, 4]))!;
  const raised = entities.add(spec(blockDef, [CHUNK - 1, 3, 1]))!;
  const far = entities.add(spec(blockDef, [-3, 0, -3]))!;
  const moved = entities.add(spec(blockDef, [2, 0, 2]))!;
  expect(columnsOf(seamDoor).size).toBeGreaterThan(1);
  expect(indexMismatches(entities)).toEqual([]);

  entities.lift(moved);
  expect(indexMismatches(entities)).toEqual([]);
  entities.place(moved, [CHUNK + 2, 0, CHUNK + 2]);
  expect(indexMismatches(entities)).toEqual([]);

  entities.drop(raised, 0);
  entities.remove(far);
  expect(entities.byUid(far.uid)).toBeUndefined();
  expect(indexMismatches(entities)).toEqual([]);

  expect(entities.bash(seamDoor, doorDef.door!.breach!.toughness)).toBe('broken');
  expect(indexMismatches(entities)).toEqual([]);

  entities.lift(raised);
  const saved = JSON.parse(JSON.stringify(entities.snapshotState())) as BlockEntitiesState;
  entities.place(raised, [-CHUNK, 0, 0]);
  entities.restoreState(saved);
  expect(indexMismatches(entities)).toEqual([]);
  const carried = entities.carrying()!;
  entities.place(carried, [-CHUNK + 1, 0, -1]);
  expect(indexMismatches(entities)).toEqual([]);
});

// biome-ignore lint/style/noProcessEnv: this benchmark is explicitly opt-in.
describe.runIf(process.env.DEADVOX_BENCH === '1')('piece edit cost benchmark', () => {
  it('prints the cost of one piece edit and its lookups against resident pieces', () => {
    const rows = [2000, 10_000, 50_000].map((resident) => {
      const entities = new BlockEntities(registry);
      const side = Math.ceil(Math.sqrt(resident));
      const stride = Math.max(...blockDef.size);
      for (let index = 0; index < resident; index++) {
        entities.add(spec(blockDef, [(index % side) * stride, 0, Math.floor(index / side) * stride]));
      }
      const bricks = worldBricks(new World(), registry, entities);
      const out: BrickOut = { lo: 0, hi: 0 };
      bricks.brick(0, 0, 0, out);
      const piece = entities.byUid(Math.ceil(resident / 2))!;
      const home: Vec3 = [...piece.pos];
      const began = performance.now();
      entities.lift(piece);
      entities.place(piece, home);
      bricks.brick(0, 0, 0, out);
      const editMs = performance.now() - began;
      const looked = performance.now();
      entities.byUid(piece.uid);
      entities.near([home[0] - 8, 0, home[2] - 8], [home[0] + 8, 0, home[2] + 8]);
      const lookupMs = performance.now() - looked;
      return { resident, editMs, lookupMs };
    });
    process.stdout.write(`PIECE_EDIT_COST ${JSON.stringify(rows)}\n`);
  });
});
