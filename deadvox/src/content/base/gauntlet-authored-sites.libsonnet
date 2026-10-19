local kit = import 'authored-site-kit.libsonnet';
local disorder = import 'aftermath.libsonnet';
local police = import 'rural-police.jsonnet';
local medical = import 'rural-medical.jsonnet';
local substation = import 'rural-substation.jsonnet';
local hq = import 'crisis-hq.jsonnet';
local find(templates, id) = std.filter(function(t) t.id == id, templates)[0];
local policeMain = police.templates[0] + {
  palette+: {
    U: { furniture: 'wood_door', lock: { id: 'gauntlet_police_armoury', locked: true } },
    C: { furniture: 'desk', loot: 'gauntlet_police_office_key' },
    Z: 'shop_blue',
    A: { furniture: 'shelf', loot: 'gauntlet_police_armoury_stock' },
  },
  layers: [
    [
      if y == 5 && z == 29 then '##ZZZZZZZZZZZZZZZZZZZZZZZZZZZZGGGGGG##'
      else if y == 6 && z == 29 then '##ZZZZZZZZZZZZZZZZZZZZZZZZZZZZ########'
      else std.strReplace(std.strReplace(row,
        '##########..#............##DD#..VVVV.#', '##########..#............##UU#..VVVV.#'),
        'O..WWW..WWW', 'O..CCC..WWW')
      for z in std.range(0, std.length(layer) - 1) for row in [layer[z]]
    ] for y in std.range(0, std.length(police.templates[0].layers) - 1) for layer in [police.templates[0].layers[y]]
  ],
};
local medicalMain = medical.templates[0] + {
  layers: [
    if y == 1 then [
      '########...##########', '#......#......#...bb#', '#.WWW..#.MM...#...bb#', '#.WWW..#F.....#LL.bb#',
      '#c.....#BB....#...bb#', '#c.....#BB....O.....E', '#c.....#BB....O.....E', '#c.....#BB....#.....#',
      '#AA....#......#.....#', '#......#......#.SC..#', '#......###..#########', '#......O.......O..TT#',
      '#......O.......O..TT#', '#########DD##########',
    ] else if y >= 2 && y <= 4 then ['########...##########'] + layer[1:] else layer
    for y in std.range(0, 7) for layer in [medical.templates[0].layers[y]]
  ],
};
local subMain = substation.templates[0];
local hqMain = hq.templates[0] + { access+: { entrance: [19, 1, 23] } };
local policeBays = [[3, 1, 13], [13, 1, 14], [18, 1, 14], [6, 1, 22], [16, 1, 27]];
local medicalBays = [[1, 1, 4], [1, 1, 6]];
local subBays = [[4, 1, 3]];
local hqBays = [[4, 1, 3], [7, 1, 3], [10, 1, 3], [17, 1, 4], [25, 1, 7], [9, 1, 9]];
local chairs = disorder.pieces('gauntlet_authored_chair', kit.style, { usage: [], tier: 'Tier1' });
local furnished(t, bays) = {
  id: 'gauntlet_' + t.id + '_furnished', size: t.size, lootContext: t.lootContext,
  slots: [kit.slot('body', t, [0, 0, 0])] + [
    disorder.slot('chair_' + i, 'gauntlet_authored_chair', bays[i]) for i in std.range(0, std.length(bays) - 1)
  ],
  joins: [], ports: [], anchors: {}, access: t.access,
};
local furnishedSlot(t, at, turn=0) = kit.slot('building', t, at, turn) + {
  choices: [{ ref: { kind: 'assembly', id: 'gauntlet_' + t.id + '_furnished' }, weight: 1 }],
};
local fence(t, row) = t + { layers: [t.layers[0]] + [[row] for y in std.range(1, t.size[1] - 1)] };
local policeLeft = fence(find(police.templates, 'rural_police_side_fence'), 'fffffffffffffffffffffff....ffffffffffffff') + { id: 'rural_police_east_breached' };
local policeRight = fence(find(police.templates, 'rural_police_side_fence'), 'ffffffffffffffffffffffffffffffffff...ffff') + { id: 'rural_police_west_breached' };
local policeFront = find(police.templates, 'rural_police_front_fence');
local policeBack = fence(find(police.templates, 'rural_police_back_fence'), 'ffffffffffffffffffff....ffffffffffffffffffffffffffffff');
local subYard = find(substation.templates, 'rural_substation_yard') + {
  layers: [
    substation.templates[1].layers[0],
  ] + [
    [
      'ffffffffff...fffffffffff',
      'f......................f',
      'f...RRR................f',
      '.........TTTTTT........f',
      '.........TTTTTT........f',
      '.........TTTTTT........f',
      'f........TTTTTT........f',
      'f........TTTTTT........f',
      'f......................f',
      'f......................f',
      'fffffffffffffffffff...ff',
    ] for y in std.range(1, 4)
  ] + [substation.templates[1].layers[5]],
};
local subPole = find(substation.templates, 'rural_substation_pole');
local subVan = find(substation.templates, 'rural_substation_van_spot');
local medicalGrounds = find(medical.templates, 'rural_medical_grounds') + { palette+: { '.': { ground: true } } };
local medicalFront = {
  id: 'medical_front_fence', size: [21, 6, 1], lootContext: medicalMain.lootContext,
  palette: { '.': { ground: true }, f: 'chain_link' },
  layers: [['.....................']] + [['ffffffff.....ffffffff'] for y in std.range(1, 5)],
};
local medicalEast = {
  id: 'medical_east_fence', size: [23, 6, 1], lootContext: medicalMain.lootContext,
  palette: { '.': { ground: true }, f: 'chain_link' },
  layers: [['.......................']] + [['ffffff...ffffffffffffff'] for y in std.range(1, 5)],
};
local medicalWest = medicalEast + {
  id: 'medical_west_fence',
  layers: [['.......................']] + [['ffffffffffffff...ffffff'] for y in std.range(1, 5)],
};
local hqBack = fence(find(hq.templates, 'crisis_hq_wall'), '########################################....################') + { id: 'crisis_hq_back_breached' };
local hqLeft = fence(find(hq.templates, 'crisis_hq_side'), '#########################################....#############') + { id: 'crisis_hq_left_breached' };
local hqRight = find(hq.templates, 'crisis_hq_side');
local hqFront = find(hq.templates, 'crisis_hq_front');
local hqShed = find(hq.templates, 'crisis_hq_generator_shed');
local hqGuard = find(hq.templates, 'crisis_hq_guard_post');
local hqParking = find(hq.templates, 'crisis_hq_parking');
local shellTemplates = [policeLeft, policeRight, policeFront, policeBack, subYard, subPole, subVan,
                        medicalGrounds, medicalFront, medicalEast, medicalWest, hqBack, hqLeft, hqRight, hqFront, hqShed, hqGuard, hqParking];
local allTemplates = [policeMain, medicalMain, subMain, hqMain] + shellTemplates;
local blockIds = std.set([t.palette[key] for t in allTemplates for key in std.objectFields(t.palette) if std.type(t.palette[key]) == 'string']);
local compound(id, size, context, slots, entrance) = {
  id: id, size: size, lootContext: context, eligibility: { settlementKinds: ['city'] },
  slots: slots, joins: [], ports: [], anchors: {},
  access: { ground: 'ground', entrance: entrance, storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
};
{
  mapStyles: [{ id: kit.style, bindings: {
    [block]: { role: if block == 'air' then 'opening' else 'shell', block: block } for block in blockIds
  } + { opening: { role: 'opening', block: 'air' } } }],
  mapPieces: [kit.piece(policeMain, policeBays), kit.piece(medicalMain, medicalBays), kit.piece(subMain, subBays), kit.piece(hqMain, hqBays)] +
             [kit.piece(t) for t in shellTemplates] + chairs,
  mapAssemblies: [furnished(policeMain, policeBays), furnished(medicalMain, medicalBays), furnished(subMain, subBays), furnished(hqMain, hqBays)] + [
    compound('gauntlet_rural_police', [54, 8, 43], policeMain.lootContext, [
      furnishedSlot(policeMain, [8, 0, 4], 2),
      kit.slot('front_fence', policeFront, [0, 0, 0]), kit.slot('back_fence', policeBack, [0, 0, 42]),
      kit.slot('east_fence', policeLeft, [0, 0, 1], 1), kit.slot('west_fence', policeRight, [53, 0, 1], 1),
    ], [36, 1, 6]),
    compound('gauntlet_rural_medical', [21, 8, 38], medicalMain.lootContext, [
      furnishedSlot(medicalMain, [0, 0, 0]), kit.slot('grounds', medicalGrounds, [0, 0, 14]),
      kit.slot('front_fence', medicalFront, [0, 0, 37]), kit.slot('east_fence', medicalEast, [0, 0, 14], 1),
      kit.slot('west_fence', medicalWest, [20, 0, 14], 1),
    ], [9, 1, 12]),
    compound('gauntlet_rural_substation', [34, 15, 26], subMain.lootContext, [
      furnishedSlot(subMain, [4, 0, 0]), kit.slot('yard', subYard, [4, 0, 15]),
      kit.slot('pole', subPole, [0, 0, 19]), kit.slot('van', subVan, [30, 0, 15]),
    ], [7, 1, 10]),
    compound('gauntlet_crisis_hq', [60, 10, 60], hqMain.lootContext, [
      furnishedSlot(hqMain, [6, 0, 6]), kit.slot('back_wall', hqBack, [0, 0, 0]),
      kit.slot('left_wall', hqLeft, [0, 0, 1], 1), kit.slot('right_wall', hqRight, [59, 0, 1], 1),
      kit.slot('front_wall', hqFront, [0, 0, 59]), kit.slot('shed', hqShed, [46, 0, 6]),
      kit.slot('guard', hqGuard, [4, 0, 50]), kit.slot('parking_a', hqParking, [47, 0, 22]), kit.slot('parking_b', hqParking, [47, 0, 36]),
    ], [25, 1, 29]),
  ],
  loot: [{ id: 'gauntlet_police_armoury_stock', rolls: [2, 3], entries: [
    { table: 'gauntlet_police_sidearms', weight: 1 }, { table: 'gauntlet_police_ammunition', weight: 2 },
  ] }],
}
