local landings = import 'packages/mods/skelly.audio.impact/landings.libsonnet';
function(materials) [
  {
    id: row.id + '_beam_' + axis,
    material: row.material,
    name: row.name,
    color: row.color,
    solid: true,
    loadPath: { kind: 'beam', axis: axis } + (if std.objectHas(row, 'span') then { span: row.span } else {}),
    weatherable: false,
    drops: { default: 'item_drop_wood' } + landings.forBlock(row.material),
    footsteps: { player: row.footstep },
  } + (if std.objectHas(row, 'burnsTo') then { burnsTo: row.burnsTo } else {})
  for row in materials
  for axis in ['x', 'z']
]
