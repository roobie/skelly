local prepare = (import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.shader-prepare-look/starts.jsonnet').starts[0];
// The same start, with this pack's graphics row spacing the background shader batches apart.
{
  starts: [prepare + { id: 'gauntletshadergaplook' }],
}
