// Every class's strike carries the striker's strength in proportion.
local strength = { impulse: { strength: { exponent: 1 } } };
{
  meleeClasses: [
    { id: 'blunt', pose: 'blunt', damageVariance: 0.05, headDamageMultiplier: 1.7, limbDamageMultiplier: 1, speedMultiplier: 0.85, attributes: strength },
    { id: 'cut', pose: 'cut', damageVariance: 0.18, headDamageMultiplier: 1, limbDamageMultiplier: 2.5, speedMultiplier: 1, attributes: strength },
    { id: 'pierce', pose: 'pierce', damageVariance: 0.4, headDamageMultiplier: 1, limbDamageMultiplier: 1, speedMultiplier: 1.15, attributes: strength },
    {
      id: 'fists',
      capability: 'unarmed',
      pose: 'fists',
      damageVariance: 0,
      headDamageMultiplier: 1,
      limbDamageMultiplier: 1,
      speedMultiplier: 1,
      attributes: strength,
      unarmed: { damageKind: 'blunt', swingSound: 'melee_swing', hitSound: 'melee_hit_fist', motion: 'swing', damage: 8, reach: 0.1, cooldownSimSeconds: 0.8, stamina: 4, impulse: 4, contactFraction: 0.4, windupCapSimSeconds: 0.25 },
    },
  ],
}
