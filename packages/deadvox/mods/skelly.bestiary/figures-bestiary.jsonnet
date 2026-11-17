local built = import 'tools/jsonnet/lib/built-pack.libsonnet';
// The bestiary build keys a mob's row by its id alone, while a figure row is keyed by type and seed
// (`packages/engine/src/core/schema/actors.ts`, `actorFigureKey`), so the seed comes from the baked body.
local seed = (import 'packages/skelly-assets/built/skelly.bestiary/actors/leaper.body.json').seed;
{
  actorFigures: [row + { id: row.id + '.' + seed } for row in built.figures('skelly.bestiary') if row.id == 'leaper'],
}
