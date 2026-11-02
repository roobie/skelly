import type { BodyTuningDef } from '../../src/core/schema.ts';
import { simSeconds } from '../../src/core/time.ts';

const meleeKinds = ['blunt', 'cut', 'pierce'] as const;

export const fixtureDamageContent = () => ({
  damageKinds: [
    ...meleeKinds.map((id) => ({ id, class: 'melee' as const })),
    ...['acid', 'blast', 'fragment', 'breach', 'crush'].map((id) => ({ id, class: 'non-melee' as const })),
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
