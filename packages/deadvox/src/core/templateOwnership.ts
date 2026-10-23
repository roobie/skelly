import type { TemplateDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { CompiledTemplate, VoxelProvenance } from './templates.ts';

export const OWNERSHIP_AIR = 2;

export const ownershipShapeIssues = (template: Pick<TemplateDef, 'size' | 'ownership'>): [string, string][] => {
  if (!template.ownership) {
    return [];
  }
  const [sx, sy, sz] = template.size;
  const { layers } = template.ownership;
  return layers.length !== sy ||
    layers.some((layer) => layer.length !== sz || layer.some((row) => [...row].length !== sx))
    ? [['.ownership.layers', 'ownership dimensions must equal the literal layers']]
    : [];
};

export const compileOwnership = (
  template: TemplateDef,
  blocks: Uint16Array,
  pieces: CompiledTemplate['pieces'],
  source: string,
): Pick<CompiledTemplate, 'ownership' | 'reserved' | 'provenance'> => {
  if (!template.ownership) {
    return {};
  }
  const [sx, , sz] = template.size;
  const ownership = new Uint8Array(blocks.length);
  const reserved = new Uint8Array(blocks.length);
  const provenance: (VoxelProvenance | undefined)[] = new Array(blocks.length);
  const occupied = new Set<number>();
  for (const piece of pieces) {
    for (let y = 0; y < piece.size[1]; y++) {
      for (let z = 0; z < piece.size[2]; z++) {
        for (let x = 0; x < piece.size[0]; x++) {
          occupied.add(piece.pos[0] + x + sx * (piece.pos[2] + z + sz * (piece.pos[1] + y)));
        }
      }
    }
  }
  template.ownership.layers.forEach((layer, y) => {
    layer.forEach((row, z) => {
      [...row].forEach((mark, x) => {
        const index = x + sx * (z + sz * y);
        const solid = blocks[index] !== 0 || occupied.has(index);
        if ((mark === 'S') !== solid) {
          throw new Error(
            `${source}: ${template.id}: ownership ${mark} disagrees with occupancy at ${[x, y, z].join(',')}`,
          );
        }
        ownership[index] = { S: 1, '.': 0, A: OWNERSHIP_AIR, R: OWNERSHIP_AIR }[mark]!;
        reserved[index] = Number(mark === 'R');
        if (mark !== '.') {
          provenance[index] = {
            owner: template.id,
            source,
            variant: template.id,
            slotPath: template.id,
            turn: 0,
          };
        }
      });
    });
  });
  return { ownership, reserved, provenance };
};

export const ownershipCell = (size: Vec3, [x, y, z]: Vec3): number => x + size[0] * (z + size[2] * y);
