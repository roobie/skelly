import { AuthoredSite } from '../../src/core/authoredSite.ts';
import type { Chunk } from '../../src/core/chunk.ts';
import type { Registry } from '../../src/core/content.ts';
import { CHUNK } from '../../src/core/coords.ts';
import type { Scale } from '../../src/core/scale.ts';
import { type BlockBox, stampChunk } from '../../src/core/structure.ts';

/** A small authored world with independent furniture, zombie and foliage columns. */
export class SnapshotSite extends AuthoredSite {
  readonly bounds = { x0: 192, z0: -32, x1: 448, z1: 96 };
  readonly hedges: readonly BlockBox[];
  constructor(seed: number, registry: Registry, scale: Scale) {
    super(seed, registry, scale, {
      id: 'snapshot_fixture',
      lootContext: { usage: ['Residential'], tier: 'Tier1' },
      bounds: { x0: 96, z0: -16, x1: 224, z1: 48 },
      ground: 20,
      terrain: [],
      buildings: [
        { template: 'small_house', position: [128, 20, 0], rotation: 0 },
        { template: 'small_house', position: [160, 20, 0], rotation: 0 },
        { template: 'garage', position: [192, 20, 0], rotation: 0 },
        { template: 'shed', position: [144, 20, -8], rotation: 0 },
      ],
      player: { position: [112, 20.5, 0], bearing: 0 },
      shamblers: [],
      woodlands: [],
      tracks: [],
    });
    this.hedges = [{ min: [224, 41, 0], max: [225, 44, 1], block: registry.blockIds.get('leaves')! }];
  }
  override zombiesIn(cx: number, cz: number) {
    return cz === 0 && (cx === 8 || cx === 9)
      ? [{ type: 'shambler', pos: [cx * CHUNK + 12, 41, 8] as [number, number, number] }]
      : [];
  }
  override stamp(chunk: Chunk): void {
    super.stamp(chunk);
    stampChunk(chunk, this.hedges);
  }
}
