// Jsonnet is lazy: naming only ids, the loops and the pit climb skips manifesting the whole lab, which the base build
// already admits.
local administration = import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-lab-administration.libsonnet';
local entry = import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-lab-entry.libsonnet';
local lab = import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-lab.libsonnet';
local research = import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-lab-research.libsonnet';
local special = import 'packages/deadvox/mods/skelly.deadvox.scenario.gauntlet.city/gauntlet-lab-special.libsonnet';
{
  mapAssemblies: [assembly.id for assembly in lab.mapAssemblies],
  mapPieces: [piece.id for piece in lab.mapPieces],
  loops: [entry.loop, administration.loop, research.loop, special.loop],
  pitClimb: special.amalgam.climb,
}
