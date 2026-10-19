local fullStrips = ['N', 'Nm', 'Sm', 'S'];
local strip = {
  N: { z: 2, turn: 0 }, Nm: { z: 26, turn: 2 }, Sm: { z: 54, turn: 0 }, S: { z: 78, turn: 2 },
};
local house(id, x, z, turn, pool='gauntlet_city') = {
  id: std.asciiLower(std.strReplace(id, '-', 'm')), position: [x, z], turn: turn,
  size: if turn % 2 == 0 then [18, 16] else [16, 18], source: { kind: 'pool', id: pool },
};
local fullBlocks = [[-204, -96]];
local rows(block, strips, xs=[2, 26, 50, 74]) = [
  house('lot_' + block[0] + '_' + block[1] + '_' + s + '_' + x,
        block[0] + x, block[1] + strip[s].z, strip[s].turn)
  for s in strips for x in xs
];
local column(block, side, zs=[2, 26, 50, 74]) = [
  house('lot_' + block[0] + '_' + block[1] + '_' + side + '_' + z,
        block[0] + (if side == 'E' then 78 else 2), block[1] + z, if side == 'E' then 1 else 3)
  for z in zs
];
local building(id, position, size, turn, assembly, routes) = {
  id: id, position: position, size: size, turn: turn, source: { kind: 'assembly', id: assembly }, routes: routes,
};
local lots = [
  building('police', [14, -45], [54, 43], 2, 'gauntlet_rural_police', [
    { id: 'p1', inside: [2, 1, 26], outside: [-2, 1, 26] },
    { id: 'p2', inside: [51, 1, 36.5], outside: [56, 1, 36.5] },
    { id: 'gate', inside: [35, 1, 2], outside: [35, 1, -2] },
    { id: 'p3', inside: [22, 1, 40], outside: [22, 1, 45] },
  ]),
  building('medical', [64, 14], [21, 38], 2, 'gauntlet_rural_medical', [
    { id: 'm1', inside: [9.5, 1, 1], outside: [9.5, 1, -2] },
    { id: 'm2', inside: [2, 1, 21.5], outside: [-2, 1, 21.5] },
    { id: 'm3', inside: [18, 1, 29.5], outside: [23, 1, 29.5] },
    { id: 'gate', inside: [10.5, 1, 35], outside: [10.5, 1, 40] },
  ]),
  building('hq', [-62, 24], [60, 60], 3, 'gauntlet_crisis_hq', [
    { id: 'h1', inside: [42, 1, 2], outside: [42, 1, -2] },
    { id: 'h2', inside: [2, 1, 44], outside: [-2, 1, 44] },
    { id: 'gate', inside: [25, 1, 57], outside: [25, 1, 62] },
  ]),
  building('substation', [-204, 40], [34, 26], 0, 'gauntlet_rural_substation', [
    { id: 's1', inside: [6, 1, 19.5], outside: [3, 1, 19.5] },
    { id: 's2', inside: [15.5, 1, 17], outside: [15.5, 1, 13] },
    { id: 'gate', inside: [25, 1, 23], outside: [25, 1, 28] },
  ]),
  { id: 'horde_field', position: [14, -94], size: [58, 42], turn: 0 },
  { id: 'campus_sightline', position: [-94, -28], size: [66, 26], turn: 0 },
] + std.flattenArrays([rows(block, fullStrips) for block in fullBlocks]) +
    column([12, -96], 'E') + rows([12, 12], ['Sm', 'S']) + column([12, 12], 'E', [2, 26]) +
    column([-96, 12], 'W') + rows([-96, 12], ['S'], [26, 50, 74]) +
    rows([-204, 12], ['N', 'S']) + rows([-204, 12], ['Nm', 'Sm'], [50, 74]);
local alley(block, start=0) = { x0: block[0] + start, z0: block[1] + 44, x1: block[0] + 96, z1: block[1] + 52 };
{
  bounds: { x0: -216, z0: -108, x1: 120, z1: 120 },
  lots: lots,
  paving: [
    { x0: street, z0: -108, x1: street + 12, z1: 120 } for street in [-216, -108, 108]
  ] + [
    { x0: -216, z0: street, x1: 120, z1: street + 12 } for street in [-108, 108]
  ] + [
    { x0: 0, z0: -108, x1: 12, z1: 120 }, { x0: -216, z0: 0, x1: 120, z1: 12 },
    { x0: -22, z0: -50, x1: 0, z1: -42 },
    { x0: -10, z0: 55, x1: 2, z1: 63 },
    { x0: -14, z0: 30, x1: -6, z1: 63 },
    { x0: -44, z0: 30, x1: -10, z1: 38 },
  ] + [alley(block) for block in fullBlocks] + [alley([-204, 12], 34)],
}
