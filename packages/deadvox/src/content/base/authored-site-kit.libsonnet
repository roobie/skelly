local style = 'gauntlet_authored_masonry';
local inBay(bays, x, y, z) = std.length([
  bay for bay in bays if x >= bay[0] && x < bay[0] + 2 && y >= bay[1] && y < bay[1] + 2 && z >= bay[2] && z < bay[2] + 2
]) > 0;
{
  style: style,
  piece(template, bays=[]):
    local rows = [[std.strReplace(row, 'c', '.') for row in layer] for layer in template.layers];
    assert std.length([
      1 for y in std.range(0, template.size[1] - 1)
      for z in std.range(0, template.size[2] - 1)
      for x in std.range(0, template.size[0] - 1)
      if inBay(bays, x, y, z) && rows[y][z][x] != '.'
    ]) == 0 : 'a furnishing bay overlaps authored structure or furniture';
    {
      id: 'gauntlet_' + template.id + '_body', size: template.size, style: style, lootContext: template.lootContext,
      palette: {
        [key]: if std.type(template.palette[key]) == 'string' then {
          role: if template.palette[key] == 'air' then 'opening' else 'shell', material: template.palette[key],
        } else template.palette[key]
        for key in std.objectFields(template.palette) if key != 'c'
      },
      layers: rows,
      ownership: { layers: [
        [std.join('', [
          if inBay(bays, x, y, z) then '.'
          else if std.type(template.palette[rows[y][z][x]]) == 'object' && std.objectHas(template.palette[rows[y][z][x]], 'groundLoot') then 'A'
          else if std.type(template.palette[rows[y][z][x]]) == 'object' && std.objectHas(template.palette[rows[y][z][x]], 'spawn') then 'R'
          else if std.type(template.palette[rows[y][z][x]]) == 'object' && std.get(template.palette[rows[y][z][x]], 'ground', false) then '.'
          else if rows[y][z][x] == '.' then 'R' else 'S'
          for x in std.range(0, template.size[0] - 1)
        ]) for z in std.range(0, template.size[2] - 1)] for y in std.range(0, template.size[1] - 1)
      ] },
      anchors: {}, ports: [],
    },
  slot(id, template, at, turn=0): {
    id: id, at: at, size: if turn % 2 == 0 then template.size else [template.size[2], template.size[1], template.size[0]], turn: turn,
    choices: [{ ref: { kind: 'piece', id: 'gauntlet_' + template.id + '_body' }, weight: 1 }],
  },
}
