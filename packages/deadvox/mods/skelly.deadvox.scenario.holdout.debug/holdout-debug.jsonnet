local site = import '../skelly.deadvox.scenario.holdout/holdout-site.libsonnet';
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// The debug look at the same site and wave: a fixture start with every skill at 10 (`tools/jsonnet/lib/start-kit.libsonnet`,
// `fixture`), and the wave's day shortened so it fires within a minute of real time. The scenario entry replaces the
// Holdout pack's own, so the arrival point and horde stay the one authored value.
{
  scenarios: [site.scenario(site.debugWaveDay)],
  starts: [std.objectRemoveKey(kit.fixture + { id: 'holdout_debug', site: 'holdout' }, 'defaultForSite')],
}
