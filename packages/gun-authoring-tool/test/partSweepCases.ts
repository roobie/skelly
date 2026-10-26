import type { PartFamily } from '@skelly/engine/assembly/schema.ts';
import { fullProduct } from './coveringArray.ts';

export const ARRAY_SAMPLED_KEYS = [
  'receiver',
  'barrel',
  'handguard',
  'sight',
  'bolt-carrier',
  'bolt-handle-arm',
  'bolt-handle-knob',
] as const;

const withoutHandleStyle = (family: PartFamily) =>
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

const acceptedCases = (key: string, cases: Record<string, string>[]): Record<string, string>[] =>
  key === 'magazine'
    ? cases.filter(({ profile, length: lengthClass }) => profile !== 'stanag-straight' || lengthClass === 'M')
    : cases;

export const sweepCases = (key: string, family: PartFamily): Record<string, string>[] =>
  acceptedCases(key, fullProduct(withoutHandleStyle(family)));
