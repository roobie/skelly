import type { BlockMaterialDef } from '@skelly/engine/internal/core/schema.ts';
import { fixtureDamageContent } from './fixtures/damageKinds.ts';

export const fixtureBlockMaterial = (fallsTo: string): BlockMaterialDef => ({
  id: 'fixture_material',
  minimumStrength: 2,
  durability: 20,
  massKg: 10,
  span: 1,
  resistance: { blunt: 0, cut: 0.5, pierce: 1, blast: 0, fragment: 0.25, breach: 0, crush: 0, acid: 0 },
  fallsTo,
  breakable: false,
  rubble: [],
  blowSound: 'fixture_blow',
  broken: { tint: '#555555', strength: 0.5 },
  cracks: {
    color: '#222222',
    opacity: 1,
    widthBlocks: 0.05,
    strands: 2,
    segments: 2,
    jitterRadians: 0,
    branchChance: 0,
    rootSpreadBlocks: 0,
    strandLengthBlocks: 0.5,
    branchSwingRadians: 0,
    branchStepFactor: 0.5,
    tipWidthFactor: 1,
    strandSpacingJitter: 0,
    branchSegmentShare: 0.5,
    steps: [{ from: 0.5, reach: 1 }],
  },
});

/** Explicit fixture content, independent of base material tuning and identifiers. */
export const blockMaterialFixture = (fallsTo: string) => ({
  ...fixtureDamageContent(),
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
