local items = std.flattenArrays([
  (import 'items-other.jsonnet').items,
  (import 'items-ammunition.jsonnet').items,
  (import 'items-pistol.jsonnet').items,
  (import 'items-revolver.jsonnet').items,
]);
local item(id) = std.filter(function(entry) entry.id == id, items)[0];
local hand(id, type) = { id: id, item: type, destination: { kind: 'hand', role: 'dominant' } };
local packed(id, type, count=1) = {
  id: id, item: type, count: count,
  destination: { kind: 'pocket', parent: 'backpack', pocket: 0 },
};
local backpack = { id: 'backpack', item: 'hiking_backpack', destination: { kind: 'worn' } };
local magazine(id, type, round, capacity, destination) = {
  id: id, item: type, cartridges: std.repeat([round], capacity), destination: destination,
};
local rifle(gun, mag, round, box, capacity) = [
  hand('firearm', gun),
  magazine('fitted_magazine', mag, round, capacity, { kind: 'slot', parent: 'firearm', slot: 'magazine' }),
  magazine('spare_magazine', mag, round, capacity, { kind: 'pocket', parent: 'backpack', pocket: 0 }),
  packed('box', box),
];
local revolver(open) =
  local chambers = (import 'gungen/revolver.model.json').gun.revolver.chambers;
  [
  hand('firearm', 'revolver_357') + {
    cylinder: {
      chambers: [
        if !open || (index > 0 && index <= std.ceil(chambers / 2))
        then { state: 'round', roundType: 'cartridge_357_h_magnum' }
        else { state: 'empty' }
        for index in std.range(0, chambers - 1)
      ],
      aligned: 0, open: open, cocked: false,
    },
  },
  packed('rounds', 'cartridge_357_h_magnum', item('cartridge_357_h_magnum').stack),
];
local kits = {
  backpack: [],
  pistol: [
    hand('firearm', 'pistol_service'),
    magazine('fitted_magazine', 'magazine_pistol_9', 'cartridge_9x19', (import 'gungen/magazine_pistol_9.model.json').gun.capacity,
             { kind: 'slot', parent: 'firearm', slot: 'magazine' }),
    packed('rounds', 'cartridge_9x19', item('cartridge_9x19').stack),
  ],
  ar: rifle('rifle_assault', 'magazine_stanag_30', 'cartridge_5_d_56x45', 'cartridge_box_5_d_56x45',
            (import 'gungen/magazine_stanag_30.model.json').gun.capacity),
  ak: rifle('rifle_ak', 'magazine_akm_30', 'cartridge_7_d_62x39', 'cartridge_box_7_d_62x39',
            (import 'gungen/magazine_akm_30.model.json').gun.capacity),
  pump: [
    hand('firearm', 'pump_shotgun'), packed('box', 'shotshell_box'),
    packed('rounds', item('shotshell_box').unpack.item, 20),
  ],
  hunting: [
    hand('firearm', 'rifle_hunting'), packed('box', 'cartridge_box_308_h_winchester'),
    packed('rounds', item('cartridge_box_308_h_winchester').unpack.item,
           item(item('cartridge_box_308_h_winchester').unpack.item).stack),
  ],
  magazine: [
    hand('magazine', 'magazine_stanag_30'),
    packed('rounds', 'cartridge_5_d_56x45', item('cartridge_5_d_56x45').stack),
    packed('more_rounds', 'cartridge_5_d_56x45', item('cartridge_5_d_56x45').stack),
  ],
  grenade: [hand('grenade', 'frag_grenade'), packed('spare_grenade', 'frag_grenade'), packed('another_grenade', 'frag_grenade')],
  revolver: revolver(false),
  revolver_open: revolver(true),
  riot_helmet: [{ id: 'helmet', item: 'riot_helmet', destination: { kind: 'worn' } }],
  compass: [hand('compass', 'compass')],
};
local presets = [{ id: id, kit: [backpack] + kits[id] } for id in std.objectFields(kits)] + [
  { id: 'wound_' + tier.id, kit: [backpack], wounds: [{ region: 'leftLeg', bleeding: tier.id }] }
  for tier in (import 'body.jsonnet').body[0].bleeding.tiers
] + std.flattenArrays([
  [
    { id: skill.id + '_' + level, kit: [backpack], skills: { [skill.id]: level } }
    for level in std.range(0, 11)
  ]
  for capability in ['firearmsCombat', 'inventoryManagement']
  for skill in (import 'recipes.libsonnet').skills
  if std.objectHas(skill, 'capability') && skill.capability == capability
]);
function(normalStarts) [
  { [key]: start[key] for key in std.objectFields(start) if key != 'defaultForSite' } + preset {
    id: start.id + '_debug_' + preset.id,
    debugOnly: true,
    kit: start.kit + preset.kit,
  }
  for start in normalStarts
  for preset in presets
]
