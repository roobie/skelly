local site = import 'holdout-site.libsonnet';
{
  scenarios: [site.scenario(site.waveDay)],
  templates: [site.shelter],
  starts: [site.start],
}
