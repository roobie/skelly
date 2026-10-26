import type { PartFamily } from '@skelly/engine/assembly/schema.ts';
import { fullProduct } from './coveringArray.ts';
import { runSweeps } from './sweeps.ts';

/**
 * Keys of `FAMILIES` (not family names: `ak-receiver` is also named `receiver`) whose default-run cases are a 3-wise covering array instead of the full product. Any
 * family not listed here (including every family added later) gets the full product.
 *
 * Why these: they are the families whose full products dominate the default run (`receiver` alone is
 * most of the combinations). For `receiver`, `barrel` and `handguard`, on a sample of `parts.ts`
 * mutants the array killed every mutant the full product killed, where 2-wise missed one. The
 * other sampled families were not measured; they are sampled for run time and the sweep keeps their
 * full products.
 * `lower` stays a full product: the 3-wise array misses its `magazineOrientation=tilt` classes.
 * `magazine` stays a full product: `acceptedCases` drops invalid length/profile rows, and filtering
 * an array after generation would leave valid triples uncovered.
 * `sight` is sampled as an array so future optic parameters compose without making its full product
 * the default; the optic contract tests explicitly cover every stable catalog type. The full product
 * of these families runs in `test/partSweep*.test.ts` when `CI` or `GUNGEN_SWEEPS` enables sweeps.
 * `handleStyle` is deliberately excluded from these unconstrained products: arbitrary combinations
 * create invalid owner/pattern pairings. The compatible style × pattern × owner matrix below tests it.
 */
export const ARRAY_SAMPLED_KEYS = [
  'receiver',
  'barrel',
  'handguard',
  'sight',
  'bolt-carrier',
  'bolt-handle-arm',
  'bolt-handle-knob',
] as const;

// Sporter joints/support and cartridge-driven motion/export have dedicated contract tests;
// multiplying their look controls through unrelated mechanisms only repeats geometry classes.
export const withoutHandleStyle = (family: PartFamily) =>
  Object.fromEntries(
    Object.entries(family.params).filter(
      ([name]) =>
        !(
          [
            'handleStyle',
            'boltCalibre',
            'stockStyle',
            'combDegrees',
            'muzzleInsetRatio',
            'frontSightMuzzleInsetRatio',
            'wellBody',
          ].includes(name) ||
          (name === 'section' && ['lower', 'stock', 'front-sight'].includes(family.name))
        ),
    ),
  );

// Straight STANAG only accepts M; the rejected lengths have a dedicated contract test.
export const acceptedCases = (key: string, cases: Record<string, string>[]): Record<string, string>[] =>
  key === 'magazine'
    ? cases.filter(({ profile, length: lengthClass }) => profile !== 'stanag-straight' || lengthClass === 'M')
    : cases;

export const sweepCases = (_key: string, family: PartFamily): Record<string, string>[] =>
  runSweeps ? fullProduct(withoutHandleStyle(family)) : [];
