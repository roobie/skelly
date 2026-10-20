// Jsonnet is lazy: naming only ids and the loop skips manifesting the whole lab, which the base build already admits.
local entry = import 'deadvox/src/content/base/gauntlet-lab-entry.libsonnet';
local lab = import 'deadvox/src/content/base/gauntlet-lab.libsonnet';

{
  mapAssemblies: [assembly.id for assembly in lab.mapAssemblies],
  mapPieces: [piece.id for piece in lab.mapPieces],
  loop: entry.loop,
}
