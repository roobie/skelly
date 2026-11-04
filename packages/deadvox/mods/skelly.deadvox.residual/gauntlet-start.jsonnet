local start = import 'gauntlet-start.libsonnet';
{
  loot: start.loot,
  furniture: (import 'furniture-breach.libsonnet').breakable(start.furniture),
  mapPieces: start.mapPieces,
  mapAssemblies: start.mapAssemblies,
}
