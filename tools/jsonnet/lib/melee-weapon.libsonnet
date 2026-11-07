// Shared so a melee weapon's defaults stay one authored value in whichever mod holds the weapon.
{
  melee(type, motion, damage, reach, cooldownSimSeconds, stamina, impulse, wearPerHit):: {
    melee: {
      swingSound: 'melee_swing', hitSound: 'melee_hit',
      damage: damage,
      reach: reach,
      cooldownSimSeconds: cooldownSimSeconds,
      stamina: stamina,
      impulse: impulse,
      wearPerHit: wearPerHit,
      contactFraction: 0.4,
      windupCapSimSeconds: 0.25,
      type: type,
      motion: motion,
      // Provisional until #276 is tuned: a full charge costs one more swing's stamina.
      charge: {
        fullSimSeconds: 1,
        curveExponent: 1,
        damageMultiplier: 1.6,
        impulseMultiplier: 2,
        stamina: stamina,
      },
    },
  },
  // These selections specialize the authored shared presentation (`packages/deadvox/DESIGN.md`, "Weapon sounds").
  lightSwing:: { melee+: { swingSound: 'melee_swing_light' } },
  heavySwing:: { melee+: { swingSound: 'melee_swing_heavy' } },
  metalRing:: { melee+: { hitLayerSound: 'melee_hit_metal' } },
}
