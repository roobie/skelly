import { ShaderLib } from 'three';
import { safeParse } from 'valibot';
import { expect, it } from 'vitest';
import { BlockEntities, panelFor } from '../src/core/blockEntities.ts';
import { buildRegistry, type TemplateDef } from '../src/core/content.ts';
import { DECAL_KINDS } from '../src/core/decalKinds.ts';
import { type DecalDef, DecalSchema } from '../src/core/schema.ts';
import { templateBodySpace } from '../src/core/templateSpatial.ts';
import { compileTemplate, placedDecals, type Turn } from '../src/core/templates.ts';
import { gameHours } from '../src/core/time.ts';
import { AuthoredDecals } from '../src/render/decals.ts';
import { FIXTURE_MATERIAL, fixtureBreach, fixtureLootContext, fixtureMaterials } from './economyFixtures.ts';

const decal = (): DecalDef => ({
  kind: 'blood',
  at: [2, 1, 2],
  normal: 'up',
  rotation: 0,
  variants: [
    {
      sizeMetres: [0.3, 0.6],
      color: '#662222',
      agedColor: '#332211',
      opacity: 0.9,
      agedOpacity: 0.5,
      ageingGameHours: gameHours(48),
      noiseScale: 8,
      edgeRaggedness: 0.4,
      strokes: [[0.1, 0.1, 0.9, 0.9, 0.1]],
    },
  ],
});
const template = (): TemplateDef => ({
  id: 'fixture_room',
  size: [4, 5, 4],
  lootContext: fixtureLootContext(),
  palette: { '#': 'fixture_wall', '.': 'air' },
  layers: [new Array(4).fill('####'), ...Array.from({ length: 4 }, () => ['#..#', '#..#', '#..#', '####'])],
});
const fixture = () => {
  const result = buildRegistry([
    {
      source: 'fixture',
      data: {
        furnitureMaterials: fixtureMaterials(),
        blocks: [{ id: 'fixture_wall', name: 'Wall', color: '#808080', solid: true }],
        furniture: [
          {
            id: 'fixture_door',
            name: 'Door',
            color: '#808080',
            size: [2, 4, 1],
            breach: fixtureBreach(),
            material: FIXTURE_MATERIAL,
            door: {
              methods: {},
              handlingSimSeconds: 1,
            },
          },
        ],
      },
    },
  ]);
  if (result.issues.length > 0) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.registry;
};

it('rejects a decal kind not owned by the dispatch table', () => {
  const result = buildRegistry([
    { source: 'bad-decal', data: { templates: [{ ...template(), decals: [{ ...decal(), kind: 'unknown' }] }] } },
  ]);
  expect(result.issues.some((issue) => issue.path.includes('decals') && issue.path.includes('kind'))).toBe(true);
  expect(safeParse(DecalSchema, { ...decal(), kind: 'unknown' }).success).toBe(false);
});

it('decals leave collision and sight authorities unchanged while preserving render placements', () => {
  const registry = fixture();
  const bare = compileTemplate(registry, template());
  const clear = templateBodySpace(registry, bare).clear([2, 1, 1]);
  expect(clear).toBe(true);
  for (const [i, kind] of Object.keys(DECAL_KINDS).entries()) {
    const authored = compileTemplate(registry, {
      ...template(),
      decals: [{ ...decal(), kind: kind as DecalDef['kind'] }],
    });
    const placement = { template: authored, origin: [10, 0, 20] as [number, number, number], turn: i as Turn };
    expect(placedDecals(placement)).toHaveLength(1);
    // These are the complete inputs to terrain/furniture collision and sight, not a decal-specific substitute.
    expect(authored.blocks).toEqual(bare.blocks);
    expect(authored.pieces).toEqual(bare.pieces);
    expect(templateBodySpace(registry, authored).clear([2, 1, 1])).toBe(clear);
    expect(templateBodySpace(registry, authored).clear([0, 1, 1])).toBe(false);
  }
});

it('batches marks with content-owned ageing and count budget', () => {
  const registry = fixture();
  const compiled = compileTemplate(registry, { ...template(), decals: [decal(), { ...decal(), kind: 'paint' }] });
  const placements = [{ template: compiled, origin: [0, 0, 0] as [number, number, number], turn: 0 as Turn }];
  const fresh = new AuthoredDecals(placements, { seed: 1, blockSize: 0.5, ageGameSeconds: gameHours(0), limit: 1 });
  const old = new AuthoredDecals(placements, { seed: 1, blockSize: 0.5, ageGameSeconds: gameHours(96), limit: 1 });
  expect(fresh.mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
  expect(fresh.mesh.geometry.getAttribute('color').array).not.toEqual(old.mesh.geometry.getAttribute('color').array);
  expect(fresh.mesh.geometry.getAttribute('decalLook').getX(0)).toBeGreaterThan(
    old.mesh.geometry.getAttribute('decalLook').getX(0),
  );
  expect(fresh.mesh.material.vertexColors).toBe(true);
  expect(fresh.mesh.receiveShadow).toBe(true);
  const disabled = new AuthoredDecals(placements, { seed: 1, blockSize: 0.5, ageGameSeconds: gameHours(0), limit: 0 });
  expect(disabled.mesh.geometry.getAttribute('position').count).toBe(0);
  fresh.dispose();
  old.dispose();
  disabled.dispose();
});

it('keeps the ragged stain mask and per-mark opacity when adding scene fog', () => {
  const registry = fixture();
  const compiled = compileTemplate(registry, { ...template(), decals: [decal()] });
  const rendered = new AuthoredDecals([{ template: compiled, origin: [0, 0, 0], turn: 0 }], {
    seed: 1,
    blockSize: 0.5,
    ageGameSeconds: gameHours(0),
    limit: 1,
  });
  const shader = {
    uniforms: {},
    vertexShader: ShaderLib.lambert.vertexShader,
    fragmentShader: ShaderLib.lambert.fragmentShader,
  };
  rendered.mesh.material.onBeforeCompile(shader as never, null as never);
  expect(shader.fragmentShader).toContain('discard;');
  expect(shader.fragmentShader).toContain('diffuseColor.a *= vDecalLook.x');
  expect(shader.uniforms).toHaveProperty('uHeightFog');
  rendered.dispose();
});

it('a turned door mark appears with its loaded owner and follows the ordinary panel', () => {
  const registry = fixture();
  const source: TemplateDef = {
    ...template(),
    palette: { ...template().palette, D: { furniture: 'fixture_door' } },
    layers: [new Array(4).fill('####'), ...Array.from({ length: 4 }, () => ['#DD#', '#..#', '#..#', '####'])],
    decals: [{ ...decal(), kind: 'paint', at: [2, 2, 0.44], normal: 'n', door: [1, 1, 0] }],
  };
  const compiled = compileTemplate(registry, source);
  const placement = { template: compiled, origin: [10, 0, 20] as [number, number, number], turn: 1 as Turn };
  const mark = placedDecals(placement)[0]!;
  const entities = new BlockEntities(registry);
  const rendered = new AuthoredDecals([placement], {
    seed: 1,
    blockSize: 0.5,
    ageGameSeconds: gameHours(24),
    limit: 2,
  });
  rendered.sync(entities);
  expect(Array.from(rendered.mesh.geometry.getAttribute('position').array).every((v) => v === 0)).toBe(true);
  const entity = entities.add({ type: 'fixture_door', pos: mark.door!, size: [1, 4, 2], facing: 'e' })!;
  rendered.sync(entities);
  const before = Array.from(rendered.mesh.geometry.getAttribute('position').array);
  expect(entities.setOpen(entity, true)).toBeUndefined();
  rendered.sync(entities);
  const after = rendered.mesh.geometry.getAttribute('position');
  const panel = panelFor(entity, entities.defOf(entity), 0.5);
  const dx = before[0]! - panel.pivot[0];
  const dz = before[2]! - panel.pivot[2];
  expect(after.getX(0)).toBeCloseTo(panel.pivot[0] + dx * Math.cos(panel.rotationY) + dz * Math.sin(panel.rotationY));
  expect(after.getZ(0)).toBeCloseTo(panel.pivot[2] - dx * Math.sin(panel.rotationY) + dz * Math.cos(panel.rotationY));
  expect(Array.from(after.array)).not.toEqual(before);
  rendered.dispose();
});
