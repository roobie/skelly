local neutral = import 'neutral.libsonnet';
{
  weathering: [neutral + { id: 'proper', capability: 'defaultWeathering' }],
}
