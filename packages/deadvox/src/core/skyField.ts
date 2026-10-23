import type { BlockEntities } from './blockEntities.ts';
import type { Registry } from './content.ts';
import { CHUNK, type Vec3 } from './coords.ts';
import type { SkyBounds } from './skylight.ts';
import {
  type CapturedSky,
  captureSky,
  containsSky,
  furnitureBounds,
  growSky,
  SKY_SHELL,
  type SkySnapshot,
  skyDependencyBounds,
} from './skySnapshot.ts';
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

/** Hands a snapshot to an off-thread build; false when it cannot take one now. */
export type SkySubmit = (input: SkySnapshot, receive: (result: SkyResult, ms: number) => void) => boolean;
export interface SkySettled {
  /** False when the world changed while the build was out, or a synchronous build got there first. */
  accepted: boolean;
  result: SkyResult;
  workerRealMs: number;
}
export interface SkyField {
  /** The sky box grown by its shell: where the field answers. */
  bounds: SkyBounds;
  /** Every cell the field's answer depends on, up to the sky top. */
  dependency: SkyBounds;
}

interface Entry extends SkyField {
  built: { captured: CapturedSky; result: SkyResult } | undefined;
  /** The world and furniture versions the build was last confirmed current against. */
  checked: string;
  /** The last complete result, kept while a rebuild is pending so a view of it does not flash. */
  latest: SkyResult | undefined;
  /** A capture waiting for, or out at, an off-thread build. */
  request: { captured: CapturedSky; submitted: boolean } | undefined;
}

/**
 * The simulation's sky-visibility cache: one field per sky box, each a pure function of world state.
 * A field rebuilds synchronously at its first query after its inputs change, so when it is built never
 * changes an answer. An off-thread build of the same snapshot may fill it first; it lands only while
 * that snapshot is still current, so it is the result a synchronous build would give.
 */
export class SkyFields {
  readonly fields: readonly SkyField[];
  readonly range: { bottom: number; top: number };
  private readonly entries: Entry[];
  private readonly owner: SkyFieldOwner;
  private standing = { version: Number.NaN, boxes: [] as SkyBounds[] };

  constructor(owner: SkyFieldOwner, range: { bottom: number; top: number }, boxes: readonly SkyBounds[] = []) {
    this.owner = owner;
    this.range = range;
    this.entries = boxes.map((box) => {
      const bounds = growSky(box, SKY_SHELL);
      return {
        bounds,
        dependency: skyDependencyBounds(bounds, range.top),
        built: undefined,
        checked: '',
        latest: undefined,
        request: undefined,
      };
    });
    this.fields = this.entries;
  }

  /**
   * Sky visibility in 0..1 at a point in blocks, by the renderer's rules: the volume inside a field's core,
   * the roof heights elsewhere in the field, and open sky outside every field or where a field's chunks
   * are not loaded.
   */
  visibilityAt(point: Vec3): number {
    const known = this.entries
      .filter((entry) => containsSky(entry.bounds, point))
      .map((entry) => ({ entry, result: this.build(entry) }))
      .filter(({ result }) => result.complete);
    for (const { result } of known) {
      if (result.volume && containsSky(result.volume, point)) {
        return sampleSky(result.volume, point);
      }
    }
    if (known.length === 0) {
      return 1;
    }
    return Number(known.some(({ entry, result }) => Math.floor(point[1]) > skyRoofAt(entry, result, point)));
  }

  /** A field's result if it is current, without building it. */
  current(index: number): SkyResult | undefined {
    const entry = this.entries[index]!;
    this.refresh(entry);
    return entry.built?.result;
  }

  /** A field's last complete result, current or not. */
  latest(index: number): SkyResult | undefined {
    return this.entries[index]!.latest;
  }

  /** Whether a field's off-thread build is out. */
  submitted(index: number): boolean {
    return this.entries[index]!.request?.submitted ?? false;
  }

  /** Whether every chunk a field depends on is loaded. */
  loaded(index: number): boolean {
    const { min, max } = this.entries[index]!.dependency;
    for (let z = Math.floor(min[2] / CHUNK); z < Math.ceil(max[2] / CHUNK); z++) {
      for (let x = Math.floor(min[0] / CHUNK); x < Math.ceil(max[0] / CHUNK); x++) {
        for (let y = Math.floor(Math.max(this.range.bottom, min[1]) / CHUNK); y < Math.ceil(max[1] / CHUNK); y++) {
          if (!this.owner.world.getChunk(x, y, z)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Asks for a field's build off-thread. A capture `submit` refuses waits for the next request, so a
   * caller that requests one field at a time holds at most one prepared snapshot. Returns whether a
   * build went out.
   */
  request(index: number, submit: SkySubmit, settle?: (settled: SkySettled) => void): boolean {
    const entry = this.entries[index]!;
    this.refresh(entry);
    if (entry.built || entry.request?.submitted) {
      return false;
    }
    entry.request ??= { captured: this.capture(entry), submitted: false };
    const { request } = entry;
    const sent = submit(request.captured.input, (result, workerRealMs) => {
      if (entry.request === request) {
        entry.request = undefined;
      }
      const accepted = !entry.built && request.captured.current(this.furniture());
      if (accepted) {
        this.install(entry, request.captured, result);
      }
      settle?.({ accepted, result, workerRealMs });
    });
    request.submitted = sent;
    return sent;
  }

  private version(): string {
    return `${this.owner.world.version}:${this.owner.entities.standing}`;
  }

  /** One furniture scan per standing change, shared by every field's capture and currency check. */
  private furniture(): readonly SkyBounds[] {
    const { standing } = this.owner.entities;
    if (this.standing.version !== standing) {
      this.standing = { version: standing, boxes: furnitureBounds(this.owner.entities) };
    }
    return this.standing.boxes;
  }

  private refresh(entry: Entry): void {
    const version = this.version();
    if (entry.checked === version) {
      return;
    }
    entry.checked = version;
    if (entry.built && !entry.built.captured.current(this.furniture())) {
      entry.built = undefined;
    }
    if (entry.request && !entry.request.captured.current(this.furniture())) {
      entry.request = undefined;
    }
  }

  private capture(entry: Entry): CapturedSky {
    const iterator = captureSky(this.owner, entry.bounds, this.range, this.furniture());
    let next = iterator.next();
    while (!next.done) {
      next = iterator.next();
    }
    return next.value;
  }

  private install(entry: Entry, captured: CapturedSky, result: SkyResult): void {
    entry.built = { captured, result };
    entry.checked = this.version();
    if (!entry.request?.submitted) {
      entry.request = undefined;
    }
    if (result.complete) {
      entry.latest = result;
    }
  }

  private build(entry: Entry): SkyResult {
    this.refresh(entry);
    if (!entry.built) {
      const captured = this.capture(entry);
      this.install(entry, captured, buildSkyResult(captured.input));
    }
    return entry.built!.result;
  }
}

/** The highest blocking cell of a field's column at a point, from its roof heights. */
export const skyRoofAt = ({ dependency }: SkyField, result: SkyResult, point: Vec3): number =>
  result.heights[
    Math.floor(point[0]) -
      dependency.min[0] +
      (dependency.max[0] - dependency.min[0]) * (Math.floor(point[2]) - dependency.min[2])
  ]!;
