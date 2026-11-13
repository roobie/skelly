local site = import '../skelly.deadvox.scenario.holdout/holdout-site.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The debug look at the same site and wave, with the wave's day shortened so it fires within a minute of real time.
// The scenario entry replaces the Holdout pack's own, so the arrival point and horde stay the one authored value.
{
  scenarios: [site.scenario(site.debugWaveDay)],
  starts: [kit.fixture + kit.notSiteDefault + { id: 'holdout_debug', site: 'holdout' }],
}
