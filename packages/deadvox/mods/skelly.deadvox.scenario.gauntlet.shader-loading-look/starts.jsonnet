local prepare = (import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.shader-prepare-look/starts.jsonnet').starts[0];
// The same start, with this pack's graphics row compiling the main scene's post-chain shaders while loading.
{
  starts: [prepare + { id: 'gauntletshaderloadinglook' }],
}
