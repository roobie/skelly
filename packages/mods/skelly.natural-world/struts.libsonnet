local landings = import 'packages/mods/skelly.audio.impact/landings.libsonnet';
local directions = [
  { rise: '+x', suffix: 'px', bearing: '-x' },
  { rise: '-x', suffix: 'nx', bearing: '+x' },
  { rise: '+z', suffix: 'pz', bearing: '-z' },
  { rise: '-z', suffix: 'nz', bearing: '+z' },
];
function(materials) [
  {
    id: row.id + '_strut_' + direction.suffix,
    material: row.material,
    name: row.name,
    color: row.color,
    solid: true,
    opaque: false,
    loadPath: { kind: 'strut', bearing: direction.bearing },
    strut: { rise: direction.rise, widthBlocks: row.widthBlocks },
    weatherable: false,
    cracks: false,
    fallsTo: { yields: row.yields },
    drops: { default: 'item_drop_wood' } + landings.forBlock(row.material),
    footsteps: { player: row.footstep },
  } + (if std.objectHas(row, 'burnsTo') then { burnsTo: row.burnsTo + '_strut_' + direction.suffix } else {})
  for row in materials
  for direction in directions
]
