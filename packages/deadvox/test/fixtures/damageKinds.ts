import type { BodyTuningDef } from '@skelly/engine/content';
import { simSeconds } from '@skelly/engine/internal/core/time.ts';

const meleeKinds = ['blunt', 'cut', 'pierce'] as const;
const nonMeleeKinds = ['acid', 'blast', 'fragment', 'breach', 'crush', 'heat'] as const;

/** A material that takes every fixture damage kind whole, for fixtures whose resistance no test reads. */
export const fixtureResistance = (): Record<string, number> =>
  Object.fromEntries([...meleeKinds, ...nonMeleeKinds].map((kind) => [kind, 0]));

export const fixtureDamageContent = () => ({
  damageKinds: [
    ...meleeKinds.map((id) => ({ id, class: 'melee' as const })),
    ...nonMeleeKinds.map((id) => ({ id, class: 'non-melee' as const })),
  ],
  meleeClasses: meleeKinds.map((id) => ({
    id,
    pose: id,
    damageVariance: 0,
    headDamageMultiplier: 1,
    limbDamageMultiplier: 1,
    speedMultiplier: 1,
  })),
});

export const bodyWithFixtureKind = (body: BodyTuningDef, kind: string): BodyTuningDef => ({
  ...body,
  shockPerDamage: { ...body.shockPerDamage, [kind]: 1 },
  outerWearMultiplier: { ...body.outerWearMultiplier, [kind]: 1 },
  pain: { ...body.pain, perDamage: { ...body.pain.perDamage, [kind]: 1 } },
  bleeding: {
    ...body.bleeding,
    tiers: body.bleeding.tiers.map((tier) => ({ ...tier, chancePerDamage: { ...tier.chancePerDamage, [kind]: 0 } })),
  },
  linger: { ...body.linger, [kind]: { simSeconds: simSeconds(1) } },
});
