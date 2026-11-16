local site = import 'holdout-site.libsonnet';
{
  scenarios: [site.scenario(site.waveDay)],
  templates: [site.shelter] + site.stockpiles,
  starts: [site.start],
}
