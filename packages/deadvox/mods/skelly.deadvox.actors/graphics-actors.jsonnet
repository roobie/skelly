// Flesh chunks are this pack's models, so core graphics cannot name them. An override replaces the whole row,
// so this one starts from core's.
local core = (import '../../../mods/skelly.graphics/graphics.jsonnet').graphics[0];
{
  graphics: [core + {
    gore+: {
      chunks: {
        models: ['flesh_chunk_small', 'flesh_chunk_medium', 'flesh_chunk_large', 'flesh_chunk_strip'],
        cap: 48,
        perThrow: [2, 4],
        hardHitDamage: 60,
        speedMetresPerRealSecond: { min: 1.5, max: 4 },
        spreadFraction: 0.6,
        spinRadiansPerRealSecond: { min: 4, max: 14 },
        scale: { min: 0.8, max: 1.3 },
        lifetimeRealSeconds: 20,
        fadeRealSeconds: 4,
      },
    },
  }],
}
