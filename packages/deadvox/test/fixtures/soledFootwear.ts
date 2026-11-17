import type { Registry } from '@skelly/engine/content';
import { baseRegistryWith } from '../baseRegistry.ts';

/** Fixture boots whose two worn pieces stand the wearer on soles of different heights. */
export const SOLED_BOOTS = 'fixture_soled_boots';
export const SOLE_LIFTS = { shaft: 0.03, foot: 0.07 } as const;

const piece = (model: string, frame: string) => ({ model, frame, pivot: [0, 0, 0], at: [0, 0, 0], turn: [0, 0, 0] });

export const soledFootwearRegistry = (): Registry =>
  baseRegistryWith([
    {
      source: 'fixture-soled-footwear',
      data: {
        models: [
          { id: 'fixture_sole_shaft', file: 'assets/models/fixture_sole_shaft.glb', soleLift: SOLE_LIFTS.shaft },
          { id: 'fixture_sole_foot', file: 'assets/models/fixture_sole_foot.glb', soleLift: SOLE_LIFTS.foot },
        ],
        items: [
          {
            id: SOLED_BOOTS,
            name: 'Soled boots',
            category: 'clothing',
            size: [2, 3],
            weight: 900,
            workInProgress: false,
            wearable: { slot: 'feet', encumbrance: 0 },
            figureModels: [
              piece('fixture_sole_shaft', 'left_hem'),
              piece('fixture_sole_foot', 'left_boot'),
              piece('fixture_sole_shaft', 'right_hem'),
              piece('fixture_sole_foot', 'right_boot'),
            ],
          },
        ],
      },
    },
  ]);
