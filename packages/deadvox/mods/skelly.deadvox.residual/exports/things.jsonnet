// A catalogue row may name its own grain in place of the item class's.
local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
local moved = std.set([
  recipe.source
  for recipe in (import 'packages/mods/skelly.body/exports/things.jsonnet')
                + (import 'packages/mods/skelly.materials/exports/things.jsonnet')
                + (import 'packages/mods/skelly.medicine/exports/things.jsonnet')
                + (import 'packages/mods/skelly.hand-tools/exports/things.jsonnet')
                + (import 'packages/mods/skelly.structures/exports/things.jsonnet')
                + (import 'packages/mods/skelly.basic-foods/exports/things.jsonnet')
                + (import 'packages/mods/skelly.packaged-foods/exports/things.jsonnet')
                + (import 'packages/mods/skelly.wearables/exports/things.jsonnet')
                + (import 'packages/mods/skelly.fuel/exports/things.jsonnet')
                + (import 'packages/mods/skelly.containers/exports/things.jsonnet')
                + (import 'packages/mods/skelly.flame-tools/exports/things.jsonnet')
                + (import 'packages/mods/skelly.light-sources/exports/things.jsonnet')
                + (import 'packages/mods/skelly.basic-recipes/exports/things.jsonnet')
                + (import 'packages/mods/skelly.melee/exports/things.jsonnet')
                + (import 'packages/mods/skelly.traps/exports/things.jsonnet')
                + (import 'packages/mods/skelly.explosives/exports/things.jsonnet')
                + (import 'packages/mods/skelly.electronics/exports/things.jsonnet')
                + (import 'packages/mods/skelly.electric-power/exports/things.jsonnet')
                + (import 'packages/mods/skelly.ground-vehicles/exports/things.jsonnet')
                + (import 'packages/mods/skelly.firearms/exports/things.jsonnet')
                + (import 'packages/deadvox/mods/skelly.deadvox.actors/exports/things.jsonnet')
                + (import 'packages/deadvox/mods/skelly.deadvox.camp/exports/things.jsonnet')
                + (import 'packages/deadvox/mods/skelly.deadvox.rural-sites/exports/things.jsonnet')
                + (import 'packages/deadvox/mods/skelly.deadvox.scenario.lock-test/exports/things.jsonnet')
]);
[
  {
    id: row.id,
    kind: 'item',
    source: row.id,
    voxel: voxel.of(voxel.item, row),
    options: { mass: row.exportMass },
  }
  for row in (import 'packages/thing-authoring-tool/items.jsonnet').items
  if !std.setMember(row.id, moved)
]
