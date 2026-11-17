local neutral = import 'neutral.libsonnet';
{
  weathering: [neutral + {
    id: 'proper',
    capability: 'defaultWeathering',
    strength: 3.6,
    tintDarkness: 1.4,
  }],
}
