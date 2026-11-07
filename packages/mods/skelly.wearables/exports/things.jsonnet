local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
local owned = std.set([
  'cargo_pants', 'fanny_pack', 'fanny_pack_worn', 'fanny_pack_worn_jacket', 'hiking_backpack', 'hiking_backpack_worn',
  'hiking_backpack_worn_jacket', 'hoodie', 'jacket', 'jeans', 'riot_helmet', 'rubber_boots', 'school_backpack',
  'school_backpack_worn', 'school_backpack_worn_jacket', 'sneakers', 'stab_vest_worn', 'stab_vest_worn_jacket',
  'utility_vest', 'utility_vest_worn', 'utility_vest_worn_jacket', 'worn_boot_foot', 'worn_boot_shaft',
  'worn_hoodie_body', 'worn_hoodie_fore', 'worn_hoodie_upper', 'worn_jacket_body', 'worn_jacket_fore',
  'worn_jacket_upper', 'worn_sneaker_foot', 'worn_trousers_pelvis', 'worn_trousers_shin', 'worn_trousers_thigh',
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
  if std.setMember(row.id, owned)
]
