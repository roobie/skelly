// Worn looks for catalogue items, one line each: a template from worn-fit.libsonnet, its options and the ground
// row's own finish, so the worn shells and the ground model share colours. The why is in
// `packages/deadvox/docs/decisions/0011-generated-worn-fit.md`, "Decision".
local fit = import 'packages/thing-authoring-tool/worn-fit.libsonnet';
local rows = import 'packages/thing-authoring-tool/catalogue/index.libsonnet';
local finish(model) = [r for r in rows if r.id == model][0].parts[0].finish;
local steel = { upper: 'steel-grey', toe: 'steel-grey', sole: 'leather-brown', collar: 'steel-bright', laces: 'leather-brown' };
local h = import 'packages/thing-authoring-tool/compound.libsonnet';
// Olive paint over parkerized fittings, brass rivets and a yellow chevron and edging.
local livery = { plate: 'paint-olive', trim: 'steel-parkerized', strap: 'webbing-olive-dark', rivet: 'brass', insignia: 'paint-crane-yellow' };
local gauntlet = livery + { hand: 'leather-black' };
local trooperBoot = { upper: 'leather-black', toe: 'paint-olive', sole: 'rubber-tread', collar: 'paint-crane-yellow', laces: 'webbing-olive-dark' };
// A worn template's own ground shells as the item's ground model.
local suit(id, massKg, worn) = worn + { rows: [h.compound(id, massKg, worn.ground, worn.rows[0].parts[0].finish) + { voxelGrain: 0.004 }] + worn.rows };
// The trooper helm, base at the neck and face towards +z, the wearer's front: a flared neck guard, a deep shell under
// a domed crown with a yellow crest, an amber visor slit under a brow bar, a wedge faceplate with grille slats and a
// filter canister on the left cheek.
local helmet = [
  h.box('skirt', 'trim', [-0.135, 0, -0.15], [0.135, 0.035, 0.15]),
  h.box('shell', 'plate', [-0.12, 0.03, -0.135], [0.12, 0.27, 0.135]),
  h.box('cap', 'plate', [-0.11, 0.265, -0.125], [0.11, 0.285, 0.125]),
  h.dome('crown', 'plate', 0.11, 0.06, 0.012, 'y', [0, 0.28, 0]),
  h.box('crest', 'insignia', [-0.012, 0.28, -0.125], [0.012, 0.35, 0.125]),
  h.box('brow', 'trim', [-0.125, 0.19, 0.12], [0.125, 0.215, 0.152]),
  h.box('visor', 'lens', [-0.095, 0.155, 0.125], [0.095, 0.19, 0.142]),
  h.prism('faceplate', 'plate', 'x', [[0.04, 0.13], [0.155, 0.13], [0.135, 0.168], [0.06, 0.174]], -0.065, 0.065),
] + [
  h.box('grille-%d' % i, 'grille', [-0.045, 0.07 + i * 0.02, 0.165], [0.045, 0.08 + i * 0.02, 0.181])
  for i in [0, 1, 2]
] + [
  h.box('bolt-%d' % i, 'rivet', [[-0.13, 0.12][i], 0.12, 0.02], [[-0.12, 0.13][i], 0.14, 0.04])
  for i in [0, 1]
] + [
  h.rod('filter', 'trim', 0.026, 0.115, 0.165, 0.08) + { origin: [-0.165, 0.08, 0.07] },
];
{
  jacket_leather: fit.torso('jacket_leather', finish('jacket_leather'), {
    collar: 'lapel', zipX: 0.035, belt: true, slots: { body: 'cloth', trim: 'cloth', fastener: 'zip' },
  }),
  cowboy_hat: fit.head('cowboy_hat', 0.14, [1.06, 1, 1.25]),
  gloves_leather: fit.hands('gloves_leather', finish('gloves_leather'), { cuff: 0.05, backRidges: 3 }),
  boots_combat: fit.feet('boots_combat', finish('boots_combat'),
                         { l: 0.3, w: 0.105, s: 0.026, toe: 0.06, instep: 0.085, top: 0.22, shaft: 0.12, laces: 6 }),

  armor_lc_plate: fit.plate('armor_lc_plate', finish('armor_lc_plate'), { lames: 2 }),
  helmet_plate: fit.head('helmet_plate', -0.09, [1.06, 1.2, 1.06]),
  gloves_plate: fit.hands('gloves_plate', finish('gloves_plate'), {
    layer: 'normal', cuff: 0.1, flare: 0.016, hem: 0.012, backRidges: 4,
    slots: { hand: 'plate', cuff: 'plate', hem: 'rivet', ridge: 'rivet' },
  }),
  sabaton: fit.feet('sabaton', steel, { l: 0.3, w: 0.11, s: 0.02, toe: 0.05, instep: 0.08, top: 0.16, shaft: 0.1, laces: 0 }),
  legguard_lightplate: fit.legs('legguard_lightplate', finish('legguard_lightplate')),

  // Heavy trooper armour in a painted field livery. Each piece's ground model is built from its own worn shells,
  // so the floor and the figure show the same armour.
  armor_trooper: suit('armor_trooper', 16.0, fit.trooper('armor_trooper', livery)),
  helmet_trooper: fit.head('helmet_trooper', -0.1) + {
    rows: [h.compound('helmet_trooper', 2.8, helmet, livery + { lens: 'glass-lens-amber', grille: 'rubber-black' }) + { voxelGrain: 0.004 }],
  },
  gloves_trooper: suit('gloves_trooper', 1.2, fit.hands('gloves_trooper', gauntlet, {
    layer: 'normal', cuff: 0.13, flare: 0.03, hem: 0.016, backRidges: 4,
    slots: { hand: 'hand', cuff: 'plate', hem: 'insignia', ridge: 'rivet' },
  })),
  boots_trooper: suit('boots_trooper', 2.6, fit.feet('boots_trooper', trooperBoot,
                                                    { l: 0.32, w: 0.125, s: 0.035, toe: 0.07, instep: 0.095, top: 0.27, shaft: 0.135, laces: 0 })),
  legguard_trooper: suit('legguard_trooper', 6.5, fit.trooperLegs('legguard_trooper', livery)),
}
