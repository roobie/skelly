local neutral = import 'packages/mods/skelly.weathering/neutral.libsonnet';
{
  weathering: [
    neutral + { id: 'bench', strength: 4, tintDarkness: 1 },
    neutral + {
      id: 'overgrown',
      strength: 2.2,
      tintColor: '#5e5c64',
      tintDarkness: 0.37,
      streakColor: '#2ec27e',
      streakStrength: 0.26,
      streakLengthMetres: 4.32,
      mossColor: '#d1d391',
      mossStrength: 1.02,
      variationScaleMetres: 29.1,
    },
  ],
}
