{
  meleeClasses: [
    { id: 'blunt', pose: 'blunt', damageVariance: 0.05, headDamageMultiplier: 1.7, limbDamageMultiplier: 1, speedMultiplier: 0.85 },
    { id: 'cut', pose: 'cut', damageVariance: 0.18, headDamageMultiplier: 1, limbDamageMultiplier: 2.5, speedMultiplier: 1 },
    { id: 'pierce', pose: 'pierce', damageVariance: 0.4, headDamageMultiplier: 1, limbDamageMultiplier: 1, speedMultiplier: 1.15 },
    {
      id: 'fists',
      capability: 'unarmed',
      pose: 'fists',
      damageVariance: 0,
      headDamageMultiplier: 1,
      limbDamageMultiplier: 1,
      speedMultiplier: 1,
      unarmed: { damageKind: 'blunt', swingSound: 'melee_swing', hitSound: 'melee_hit_fist', motion: 'swing', damage: 8, reach: 0.1, cooldownSimSeconds: 0.8, stamina: 4, impulse: 4, contactFraction: 0.4, windupCapSimSeconds: 0.25 },
    },
  ],
}
