local context = { usage: [], tier: 'Tier1' };
local palette = { p: { role: 'interior_floor', material: 'floor' }, '=': { role: 'shell', material: 'concrete' }, '.': { role: 'opening', material: 'air' } };
local full = 'pppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppppp';
local air = '=......................................................................=';
local solid = 'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS';
local clear = 'SRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRS';
local boundary = '========================================================================';
local floor4 = [full, full, full, full];
local claims4 = [solid, solid, solid, solid];
local north = [boundary, air, air, air];
local northClaims = [solid, clear, clear, clear];
local floor5 = [full, full, full, full, full];
local claims5 = [solid, solid, solid, solid, solid];
local middle = [air, air, air, air, air];
local middleClaims = [clear, clear, clear, clear, clear];
local entry = middle;
local entryClaims = [clear, clear, 'SRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR...RRRRRRRRRRRRRRRRRRRRRRRRRRS', 'SRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR...RRRRRRRRRRRRRRRRRRRRRRRRRRS', clear];
local floor8 = [full, full, full, full, full, full, full, full];
local claims8 = [solid, solid, solid, solid, solid, solid, solid, solid];
local south = [air, air, air, air, air, air, air, boundary];
local southClaims = [clear, clear, clear, clear, clear, clear, clear, solid];
// The sewer port: a gap in the south boundary, `width` cells from `x`, open for the bottom `height` air layers.
local port = { x: 49, width: 4, height: 5 };
local gap = function(wall, open) std.join('', [if x >= port.x && x < port.x + port.width then open else wall[x] for x in std.range(0, std.length(wall) - 1)]);
local southPort = [air, air, air, air, air, air, air, gap(boundary, '.')];
local southPortClaims = [clear, clear, clear, clear, clear, clear, clear, gap(solid, 'R')];
local portLayers = [floor8] + [if y <= port.height then southPort else south for y in std.range(1, 7)];
local portClaims = [claims8] + [if y <= port.height then southPortClaims else southClaims for y in std.range(1, 7)];
local westFloor = ['pppp', 'pppp', 'pppp', 'pppp', 'pppp', 'pppp', 'pppp', 'pppp', 'pppp', 'pppp', 'pppp', 'pppp', 'pppp', 'pppp'];
local westAir = ['=...', '=...', '=...', '=...', '=...', '=...', '=...', '=...', '=...', '=...', '=...', '=...', '=...', '=...'];
local westSolid = ['SSSS', 'SSSS', 'SSSS', 'SSSS', 'SSSS', 'SSSS', 'SSSS', 'SSSS', 'SSSS', 'SSSS', 'SSSS', 'SSSS', 'SSSS', 'SSSS'];
local westClear = ['SRRR', 'SRRR', 'SRRR', 'SRRR', 'SRRR', 'SRRR', 'SRRR', 'SRRR', 'SRRR', 'SRRR', 'SRRR', 'SRRR', 'SRRR', 'SRRR'];
local eastAir = ['...=', '...=', '...=', '...=', '...=', '...=', '...=', '...=', '...=', '...=', '...=', '...=', '...=', '...='];
local eastClear = ['RRRS', 'RRRS', 'RRRS', 'RRRS', 'RRRS', 'RRRS', 'RRRS', 'RRRS', 'RRRS', 'RRRS', 'RRRS', 'RRRS', 'RRRS', 'RRRS'];
local alleyFloor = ['ppppp', 'ppppp', 'ppppp', 'ppppp', 'ppppp', 'ppppp', 'ppppp', 'ppppp', 'ppppp', 'ppppp', 'ppppp', 'ppppp', 'ppppp', 'ppppp'];
local alleyAir = ['.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....', '.....'];
local alleySolid = ['SSSSS', 'SSSSS', 'SSSSS', 'SSSSS', 'SSSSS', 'SSSSS', 'SSSSS', 'SSSSS', 'SSSSS', 'SSSSS', 'SSSSS', 'SSSSS', 'SSSSS', 'SSSSS'];
local alleyClear = ['RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR'];
local piece = function(id, size, layers, claims) {
  id: id, size: size, style: 'concrete_lab', lootContext: context, palette: palette,
  layers: layers, ownership: { layers: claims }, anchors: {}, ports: [],
};
local slot = function(id, ref, at, size) { id: id, at: at, size: size, turn: 0, choices: [{ ref: { kind: 'piece', id: ref }, weight: 1 }] };
{
  port: port,
  mapPieces: [
    piece('gauntlet_lab_north', [72, 8, 4], [floor4, north, north, north, north, north, north, north], [claims4, northClaims, northClaims, northClaims, northClaims, northClaims, northClaims, northClaims]),
    piece('gauntlet_lab_cross', [72, 8, 5], [floor5, middle, middle, middle, middle, middle, middle, middle], [claims5, middleClaims, middleClaims, middleClaims, middleClaims, middleClaims, middleClaims, middleClaims]),
    piece('gauntlet_lab_entry_cross', [72, 8, 5], [floor5, entry, entry, entry, entry, entry, entry, entry], [claims5, entryClaims, entryClaims, entryClaims, entryClaims, entryClaims, entryClaims, entryClaims]),
    piece('gauntlet_lab_south', [72, 8, 8], [floor8, south, south, south, south, south, south, south], [claims8, southClaims, southClaims, southClaims, southClaims, southClaims, southClaims, southClaims]),
    piece('gauntlet_lab_west', [4, 8, 14], [westFloor, westAir, westAir, westAir, westAir, westAir, westAir, westAir], [westSolid, westClear, westClear, westClear, westClear, westClear, westClear, westClear]),
    piece('gauntlet_lab_east', [4, 8, 14], [westFloor, eastAir, eastAir, eastAir, eastAir, eastAir, eastAir, eastAir], [westSolid, eastClear, eastClear, eastClear, eastClear, eastClear, eastClear, eastClear]),
    piece('gauntlet_lab_alley', [5, 8, 14], [alleyFloor, alleyAir, alleyAir, alleyAir, alleyAir, alleyAir, alleyAir, alleyAir], [alleySolid, alleyClear, alleyClear, alleyClear, alleyClear, alleyClear, alleyClear, alleyClear]),
    piece('gauntlet_lab_south_port', [72, 8, 8], portLayers, portClaims),
  ],
  slots: [
    slot('north', 'gauntlet_lab_north', [0, 0, 0], [72, 8, 4]),
    slot('cross_north', 'gauntlet_lab_cross', [0, 0, 18], [72, 8, 5]),
    slot('cross_south', 'gauntlet_lab_cross', [0, 0, 37], [72, 8, 5]),
    slot('south', 'gauntlet_lab_south', [0, 0, 56], [72, 8, 8]),
    slot('west_north', 'gauntlet_lab_west', [0, 0, 4], [4, 8, 14]),
    slot('west_middle', 'gauntlet_lab_west', [0, 0, 23], [4, 8, 14]),
    slot('west_south', 'gauntlet_lab_west', [0, 0, 42], [4, 8, 14]),
    slot('alley_west_north', 'gauntlet_lab_alley', [22, 0, 4], [5, 8, 14]),
    slot('alley_west_middle', 'gauntlet_lab_alley', [22, 0, 23], [5, 8, 14]),
    slot('alley_west_south', 'gauntlet_lab_alley', [22, 0, 42], [5, 8, 14]),
    slot('alley_east_north', 'gauntlet_lab_alley', [45, 0, 4], [5, 8, 14]),
    slot('alley_east_middle', 'gauntlet_lab_alley', [45, 0, 23], [5, 8, 14]),
    slot('alley_east_south', 'gauntlet_lab_alley', [45, 0, 42], [5, 8, 14]),
    slot('east_north', 'gauntlet_lab_east', [68, 0, 4], [4, 8, 14]),
    slot('east_middle', 'gauntlet_lab_east', [68, 0, 23], [4, 8, 14]),
    slot('east_south', 'gauntlet_lab_east', [68, 0, 42], [4, 8, 14]),
  ],
}
