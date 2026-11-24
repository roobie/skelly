local site = import 'holdout-site.libsonnet';
{
  scenarios: [site.scenario(site.waveDay)],
  templates: site.stockpiles + [site.plant.plant],
  mapPieces: [site.plant.storesRacking],
  mapAssemblies: [site.plant.stores],
  starts: [site.start],
}
