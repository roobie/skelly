import { type Vec3 } from '../core/coords.ts';
import { World } from '../core/world.ts';

/** Resident blocks for drawing; the simulation owns a separate canonical store. */
export class RenderWorld extends World {
  readonly renderOnly = true;
  private readonly masked = new Map<string, number>();

  /** Removes cells from this view-only world's meshes, retaining their landed block for restoration. */
  mask(cell: Readonly<Vec3>): Vec3[] {
    const key = cell.join(',');
    if (this.masked.has(key)) {
      return [];
    }
    const block = this.getBlock(...cell);
    if (block === 0) {
      return [];
    }
    this.masked.set(key, block);
    return super.setBlock(...cell, 0);
  }

  /** Restores a landed cell that this view hid while its fall was drawn. */
  unmask(cell: Readonly<Vec3>): Vec3[] {
    const key = cell.join(',');
    const block = this.masked.get(key);
    if (block === undefined) {
      return [];
    }
    this.masked.delete(key);
    return super.setBlock(...cell, block);
  }
}
