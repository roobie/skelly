import type { BlockMaterialDef } from '../src/core/schema.ts';

export const fixtureBlockMaterial = (fallsTo: string): BlockMaterialDef => ({
  id: 'fixture_material',
  minimumStrength: 2,
  durability: 20,
  massKg: 10,
  span: 1,
  resistance: { blunt: 0, cut: 0.5, pierce: 1, blast: 0, fragment: 0.25, breach: 0, crush: 0 },
  fallsTo,
  rubble: [],
  blowSound: 'fixture_blow',
  broken: { tint: '#555555', strength: 0.5 },
  damaged: [{ from: 0.5, tint: '#777777', strength: 0.25 }],
});

/** Explicit fixture content, independent of base material tuning and identifiers. */
export const blockMaterialFixture = (fallsTo: string) => ({
  blockMaterials: [fixtureBlockMaterial(fallsTo)],
  sounds: [
    {
      id: 'fixture_blow',
      description: 'Fixture blow',
      variants: ['assets/audio/fixture.ogg'],
      gain: 1,
      pitchJitter: [1, 1],
      gainJitter: [1, 1],
      minIntervalSimSeconds: 0,
      category: 'world',
      noise: { enabled: true, radiusMetres: 1 },
    },
  ],
});
