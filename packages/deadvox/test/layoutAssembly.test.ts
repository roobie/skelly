import { buildRegistry } from '@skelly/engine/content';
import { authoredLayoutIssues } from '@skelly/engine/internal/core/authoredLayout.ts';
import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import type { ContentFile, SiteLayoutDef } from '@skelly/engine/internal/core/schema.ts';
import { cellsOf, placedBlockAt } from '@skelly/engine/internal/core/templates.ts';
import { makeScale, toChunk, type Vec3, World } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { baseContentSources } from './baseContentFiles.ts';
import { terrainFor } from './fixtures/terrain.ts';

// The fixture kit's route assembly, placed by an authored layout beside the base content's own templates.
const { damageKinds: _, ...KITS } = JSON.parse(
  compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/map-kits.jsonnet'),
) as ContentFile;
const base = baseContentSources().filter(({ source }) => !source.startsWith('layouts') && source !== 'starts.json');
const scale = makeScale(0.5);

const layout: SiteLayoutDef = {
  id: 'fixture_assembly_site',
  lootContext: { usage: ['Residential'], tier: 'Tier1' },
  bounds: { x0: 0, z0: 0, x1: 12, z1: 12 },
  ground: 0,
  terrain: [],
  buildings: [{ template: 'fixture_route', position: [2, 0, 2], rotation: 0 }],
  player: { position: [8, 0.5, 9], bearing: 0 },
  actors: [],
  woodlands: [],
  tracks: [],
};
const { registry, issues } = buildRegistry([
  ...base,
  { source: 'fixture-kits.json', data: KITS },
  { source: 'fixture-assembly-site.json', data: { layouts: [layout] } },
]);

it('places a curated assembly from an authored layout, resolving its slots from the world seed', () => {
  expect(issues.filter(({ source }) => source.startsWith('fixture-'))).toEqual([]);
  const variants = new Set<string>();
  for (let seed = 0; seed < 8; seed++) {
    const site = new AuthoredSite(seed, registry, scale, registry.layouts.get(layout.id)!);
    const placement = site.placements[0]!;
    const front = new Set(
      placement.template
        .provenance!.filter((owner) => owner?.slotPath === 'fixture_route/front')
        .map((o) => o!.variant),
    );
    expect(front.size).toBe(1);
    variants.add([...front][0]!);
    const world = new World();
    for (const chunk of terrainFor(site, registry, scale, seed).generateColumn(
      toChunk(placement.origin[0]),
      toChunk(placement.origin[2]),
    )) {
      world.addChunk(chunk);
    }
    const stamped = [...cellsOf(placement.template.size)]
      .map(([x, y, z]): Vec3 => [placement.origin[0] + x, placement.origin[1] + y, placement.origin[2] + z])
      .filter((cell) => registry.blocks[placedBlockAt(placement, cell)!]?.solid);
    expect(stamped.length).toBeGreaterThan(0);
    for (const cell of stamped) {
      expect(world.getBlock(...cell)).toBe(placedBlockAt(placement, cell));
    }
  }
  expect(variants.size).toBeGreaterThan(1);
});

it('reports an unknown assembly and stacked storeys on an assembly at their paths', () => {
  const [route] = layout.buildings;
  const paths = (building: SiteLayoutDef['buildings'][number]) =>
    authoredLayoutIssues({ ...layout, buildings: [building] }, registry).map(([path]) => path);
  expect(paths({ ...route!, template: 'fixture_missing_assembly' })).toContain('.buildings[0].template');
  expect(paths({ ...route!, storeys: 2 })).toContain('.buildings[0].storeys');
});
