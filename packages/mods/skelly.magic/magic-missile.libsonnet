// The magic missile's power curve. The cap is whole missile steps above the novice level, so the count never stops
// short of a step at the top; both levels are exported so a look fixture casts at the ends of the curve.
local levelsPerMissile = 2;
local missileSteps = 4;
local novice = 1;
local noviceMissiles = 2;
local master = novice + missileSteps * levelsPerMissile;
{
  levels: { novice: novice, master: master },
  ability: {
    id: 'magic_missile',
    name: 'Magic missile',
    rule: 'magic_missile',
    targeting: 'aimed',
    preparationSimSeconds: 0.6,
    cost: { pool: 'mana', amount: '2.0 + 0.5 * double(abilityLevel)' },
    projectile: {
      core: { color: '#f2f6ff', radiusMetres: 0.035 },
      halo: { color: '#5f8cff', radiusMetres: 0.13 },
      light: { color: '#8fb0ff', intensity: 2.4, radiusMetres: 5 },
      trail: {
        color: '#86a8ff',
        spacingMetres: 0.2,
        sizeMetres: 0.04,
        lifeRealSeconds: 0.4,
        driftMetresPerRealSecond: 0.3,
      },
      impact: { color: '#c8d8ff', radiusMetres: 0.4, lifeRealSeconds: 0.25 },
    },
    progression: { maximumLevel: master, practicePerCast: 1, practicePerLevel: 5 },
  },
  rule: {
    id: 'magic_missile',
    trigger: { event: 'cast' },
    effects: [{
      verb: 'projectileVolley',
      count: std.format('%d + (abilityLevel - %d) / %d', [noviceMissiles, novice, levelsPerMissile]),
      damage: '5.0 + 1.5 * double(abilityLevel)',
      intervalSimSeconds: '0.12',
      speedMetresPerSimSecond: '30.0',
      rangeMetres: '40.0',
      // Why not an elemental kind: `packages/deadvox/docs/magic-mod.md`, "7. Open damage kinds".
      damageKind: 'blunt',
    }],
  },
}
