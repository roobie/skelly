local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
local owned = std.set([
  'ammo_can', 'cartridge_box_308_h_winchester', 'cartridge_box_357_h_magnum', 'cartridge_box_5_d_56x45',
  'cartridge_box_7_d_62x39', 'scrap_foregrip', 'shotshell_box', 'taped_flashlight_mount', 'weapon_sling',
  'weapon_sling_worn', 'weapon_sling_worn_jacket',
]);
[
  {
    id: row.id,
    kind: 'item',
    source: row.id,
    voxel: voxel.of(voxel.item, row),
    options: { mass: row.exportMass },
  }
  for row in (import 'packages/skelly-assets/tools/packages/thing-authoring-tool/items.jsonnet').items
  if std.setMember(row.id, owned)
]
