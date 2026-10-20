import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { buildRegistry } from '../src/core/content.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { templateStandingRoute } from '../src/core/templateSpatial.ts';
import { compileAssembly, compileMapPiece, kitSlotChoices } from '../src/core/templates.ts';
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();

it('equipment alternatives leave declared level circulation reachable in both directions', () => {
  const { registry } = BUNDLED_CONTENT;
  const surfaces = [...registry.mapAssemblies.values()].filter((assembly) => {
    const standing = Object.values(assembly.anchors).filter((anchor) => anchor.kind === 'standing');
    return !assembly.access && standing.length > 1 && standing.every((anchor) => anchor.at[1] === standing[0]!.at[1]);
  });
  expect(surfaces.length).toBeGreaterThan(0);
  let furnished = false;
  for (const surface of surfaces) {
    for (const slot of surface.slots) {
      for (const choice of kitSlotChoices(registry, slot)) {
        const definition = {
          ...surface,
          slots: surface.slots.map((candidate) =>
            candidate === slot ? { ...candidate, pool: undefined, choices: [choice] } : candidate,
          ),
        };
        const compiled = compileAssembly(registry, definition, { seed: 1, siteId: 'circulation-witness' });
        furnished ||= compiled.pieces.some((piece) => !registry.furniture.get(piece.furniture)!.climbable);
        const standing = Object.values(compiled.anchors!).filter((anchor) => anchor.kind === 'standing');
        const entry = standing[0]!.at;
        for (const target of standing.slice(1)) {
          expect(templateStandingRoute(registry, compiled, entry, target.at), `${surface.id}: outward`).toBe(true);
          expect(templateStandingRoute(registry, compiled, target.at, entry), `${surface.id}: return`).toBe(true);
        }
      }
    }
  }
  expect(furnished).toBe(true);
});

it('a fixture mod can replace a role style by id without changing curated geometry', () => {
  const mod = JSON.parse(
    compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/concrete-style-mod.jsonnet'),
  ) as ContentFile;
  const sources = readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: file,
      data: JSON.parse(readFileSync(`src/content/base/${file}`, 'utf8')) as unknown,
    }));
  const { registry, issues } = buildRegistry([...sources, { source: 'fixture-style-mod.json', data: mod }]);
  expect(issues).toEqual([]);
  const style = mod.mapStyles![0]!;
  const piece = [...registry.mapPieces.values()].find(
    (candidate) =>
      candidate.style === style.id &&
      Object.entries(candidate.palette).some(
        ([char, entry]) =>
          'role' in entry &&
          entry.material === 'facade' &&
          candidate.layers.some((layer) => layer.some((row) => row.includes(char))),
      ),
  )!;
  expect(piece).toBeDefined();
  const compiled = compileMapPiece(registry, piece);
  const facade = registry.blockIds.get(style.bindings.facade!.block)!;
  const chars = piece.layers.flat().join('');
  const facadeCells = [...chars].flatMap((char, index) => {
    const entry = piece.palette[char]!;
    return 'role' in entry && entry.material === 'facade' ? [index] : [];
  });
  expect(facadeCells.length).toBeGreaterThan(0);
  expect(facadeCells.every((index) => compiled.blocks[index] === facade)).toBe(true);
  const base = BUNDLED_CONTENT;
  expect(base.issues).toEqual([]);
  const original = compileMapPiece(base.registry, base.registry.mapPieces.get(piece.id)!);
  expect(compiled.ownership).toEqual(original.ownership);
  expect(compiled.reserved).toEqual(original.reserved);
  const facadeSet = new Set(facadeCells);
  expect(compiled.blocks.every((block, index) => facadeSet.has(index) || block === original.blocks[index])).toBe(true);
  expect(registry.mapStyles.get(style.id)).toEqual(style);
  expect(registry.contentOrigins.get(`mapStyles:${style.id}`)!.source).toBe('fixture-style-mod.json');
});
