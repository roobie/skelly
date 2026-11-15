local gauntlet = (import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.start/starts.jsonnet').starts[0];
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
// Shader preparation as the core graphics policy paces it: play shows first, the rest compiles in the background.
{
  starts: [gauntlet + kit.look + kit.notSiteDefault + {
    id: 'gauntletshaderpreparelook',
  }],
}
