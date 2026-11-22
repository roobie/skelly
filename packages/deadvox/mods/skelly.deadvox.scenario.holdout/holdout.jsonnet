local site = import 'holdout-site.libsonnet';
{
  scenarios: [site.scenario(site.waveDay)],
  templates: site.stockpiles + [site.plant.plant, site.plant.stores],
  starts: [site.start],
}
