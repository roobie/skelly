import type { BlockEntities } from './blockEntities.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { SkyBounds } from './skylight.ts';
import { type CapturedSky, captureSky, containsSky, growSky, SKY_SHELL, skyDependencyBounds } from './skySnapshot.ts';
import { buildSkyResult, type SkyResult, sampleSky } from './skyTransport.ts';
import { footprint, type Placement } from './templates.ts';
import type { World } from './world.ts';

/** One sky box per finished authored footprint, in blocks; simulation and renderer enumerate the same fields. */
export const authoredSkyBoxes = (placements: readonly Placement[]): SkyBounds[] =>
  placements.map((placement) => {
    const [width, depth] = footprint(placement);
    const { origin } = placement;
    return {
      min: [...origin] as Vec3,
      max: [origin[0] + width, origin[1] + placement.template.size[1], origin[2] + depth] as Vec3,
    };
  });

export interface SkyFieldOwner {
  world: World;
  entities: BlockEntities;
  registry: Registry;
}

interface Entry {
  bounds: SkyBounds;
  dependency: SkyBounds;
  built: { captured: CapturedSky; result: SkyResult } | undefined;
  /** The world and furniture versions the build was last confirmed current against. */
  checked: string;
}

/**
 * The simulation's sky-visibility cache: one field per sky box, each a pure function of world state.
 * A field rebuilds synchronously at its first query after its inputs change, so when it is built never
 * changes an answer.
 */
export class SkyFields {
  private readonly entries: Entry[];
  private readonly owner: SkyFieldOwner;
  private readonly range: { bottom: number; top: number };

  constructor(owner: SkyFieldOwner, range: { bottom: number; top: number }, boxes: readonly SkyBounds[] = []) {
    this.owner = owner;
    this.range = range;
    this.entries = boxes.map((box) => {
      const bounds = growSky(box, SKY_SHELL);
      return { bounds, dependency: skyDependencyBounds(bounds, range.top), built: undefined, checked: '' };
    });
  }

  /**
   * Sky visibility in 0..1 at a point in blocks, by the renderer's rules: the volume inside a field's core,
   * the roof heights elsewhere in the field, and open sky outside every field or where a field's chunks
   * are not loaded.
   */
  visibilityAt(point: Vec3): number {
    const known = this.entries
      .filter((entry) => containsSky(entry.bounds, point))
      .map((entry) => ({ entry, result: this.result(entry) }))
      .filter(({ result }) => result.complete);
    for (const { result } of known) {
      if (result.volume && containsSky(result.volume, point)) {
        return sampleSky(result.volume, point);
      }
    }
    if (known.length === 0) {
      return 1;
    }
    return Number(
      known.some(({ entry: { dependency }, result }) => {
        const column =
          Math.floor(point[0]) -
          dependency.min[0] +
          (dependency.max[0] - dependency.min[0]) * (Math.floor(point[2]) - dependency.min[2]);
        return Math.floor(point[1]) > result.heights[column]!;
      }),
    );
  }

  private result(entry: Entry): SkyResult {
    const version = `${this.owner.world.version}:${this.owner.entities.standing}`;
    if (entry.built && entry.checked !== version && !entry.built.captured.current()) {
      entry.built = undefined;
    }
    entry.checked = version;
    if (!entry.built) {
      const iterator = captureSky(this.owner, entry.bounds, this.range);
      let next = iterator.next();
      while (!next.done) {
        next = iterator.next();
      }
      entry.built = { captured: next.value, result: buildSkyResult(next.value.input) };
    }
    return entry.built.result;
  }
}
