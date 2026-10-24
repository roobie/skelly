// Jsonnet is lazy: naming only ids and the loops skips manifesting the whole lab, which the base build already admits.
local administration = import 'packages/deadvox/src/content/base/gauntlet-lab-administration.libsonnet';
local entry = import 'packages/deadvox/src/content/base/gauntlet-lab-entry.libsonnet';
local lab = import 'packages/deadvox/src/content/base/gauntlet-lab.libsonnet';
local research = import 'packages/deadvox/src/content/base/gauntlet-lab-research.libsonnet';
{
  mapAssemblies: [assembly.id for assembly in lab.mapAssemblies],
  mapPieces: [piece.id for piece in lab.mapPieces],
  loops: [entry.loop, administration.loop, research.loop],
}
