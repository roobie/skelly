// A country house built over a cellar keeps its plant and stores there, reached from the yard. The room is asked
// only of an answer with a cellar storey, so every brief whose house may stand over one carries it.
local cellar = {
  purpose: 'A house built over a cellar keeps its plant and stores there, down an outside stair from the yard: ' +
           'the boiler and its coal in the back corner, shelves of food put by, a drain in the floor and a bare bulb.',
  serves: ['heating', 'storage', 'drainage', 'lighting'],
  cellar: true,
};
local cellarReference = 'Balkan and Nordic country houses of the same decades raised over a stone cellar, entered by ' +
                        'an outside stair sunk beside the back wall, where the boiler, the coal and the winter stores were kept.';
// A rural plot: a flat-roof house with its yard. Every plot answers it, so its toilet room holds each of them to
// one, whether the privy in the yard or the WC of a modernised house; see
// `packages/deadvox/docs/building-pathway.md`, "Worked example: rural plot".
local ruralPlot = {
  id: 'rural_plot',
  setting: 'modern_1980s',
  tags: ['late_modern', 'balkan', 'mediterranean', 'nordic'],
  eligibility: { settlementKinds: ['rural'] },
  plot: { along: 32, depth: 36 },
  styles: ['rural_render', 'rural_render_boarded', 'rural_outbuilding'],
  storeys: [1, 1],
  program: {
    living_room: {
      purpose: 'The house\'s front room across the road side, warmed by a wood stove.',
      serves: ['heating'],
    },
    kitchen: { purpose: 'Cooking and eating at the back of the house.', serves: ['cooking'] },
    bedroom: { purpose: 'Sleeping, at the back of the house, away from the road.' },
    woodshed: { purpose: 'The stove\'s firewood, stacked dry under a roof across the yard from the back door.' },
    toilet: {
      purpose: 'The household\'s toilet: the privy at the far end of the yard, or the WC of a modernised house.',
      serves: ['toilet'],
    },
    cellar: cellar,
  },
  references: [
    'Balkan and Greek village plots of the 1970s and 1980s: the house at the road, a walled or fenced yard behind ' +
    'it with a well, a woodshed, a hen house and the privy at the far end.',
    'Finnish and Swedish country houses of the same decades: the house by the road, a woodshed and outhouse ' +
    'across the yard, and a separate garage beside the house once the family had a car.',
    cellarReference,
  ],
  facade: 'The house\'s long rendered face to the road, a trodden path down one side to the yard, and in some ' +
          'plots a blockwork garage beside the house with its opening to the road.',
  cover: 'The outbuildings break the yard into cover and blind corners: the woodshed and the well hide a body, ' +
         'and a walk to the privy at night leaves the house\'s walls behind.',
};
// The rural flat-roof house, as built and as modernised with a WC; each is the brief of one house.
local flatRoofHouse = {
  id: 'rural_flat_roof_house',
  setting: 'modern_1980s',
  tags: ['late_modern', 'balkan', 'mediterranean', 'nordic'],
  eligibility: { settlementKinds: ['rural'] },
  plot: { along: 20, depth: 16 },
  styles: ['rural_render', 'rural_render_boarded'],
  storeys: [1, 1],
  program: {
    living_room: {
      purpose: 'The front room across the road side, entered straight from the porch and warmed by a wood stove.',
      serves: ['heating'],
    },
    kitchen: {
      purpose: 'Cooking and eating at the back; the back door to the yard opens from it.',
      serves: ['cooking', 'washing'],
    },
    bedroom: { purpose: 'Sleeping, at the back, away from the road.' },
    cellar: cellar,
  },
  references: [
    'Yugoslav rural houses of the 1970s and 1980s: owner-built rendered blockwork cubes under a flat concrete ' +
    'slab, a parapet round the roof and the slab edge left projecting as a plain cornice.',
    'Greek and Cypriot village houses of the same decades: reinforced-concrete frame and flat roof behind a ' +
    'low parapet, rendered walls, a shallow concrete band at the roof line.',
    'Finnish and Swedish flat-roofed detached houses of the 1960s and 1970s: low, white-rendered, with ' +
    'dark-stained timber boarding at the entrance and a broad fascia.',
    cellarReference,
  ],
  facade: 'A long, low rendered face to the road on a stone plinth course: a centred porch under the ' +
          'projecting slab, a window either side, and the parapet coping as one clean line along the top. ' +
          'Some houses clad the entrance bay in timber boards.',
  cover: 'The walls stop shots and the windows are few and small; the flat roof behind its parapet is a ' +
         'firing step for whoever gets up there. The porch has no door to close, so the back is the ' +
         'only door that holds.',
};
{
  buildingBriefs: [
    ruralPlot,
    {
      id: 'rural_cottage',
      setting: 'modern_1980s',
      tags: ['postwar', 'western_european'],
      eligibility: { settlementKinds: ['rural'] },
      plot: { along: 18, depth: 16 },
      styles: ['brick_townhouse', 'concrete_townhouse'],
      storeys: [1, 2],
      program: {
        kitchen: {
          purpose: 'Cooking and eating; the back door to the yard opens from it.',
          serves: ['cooking', 'washing'],
        },
        living_room: { purpose: 'The front room, facing the road.', serves: ['heating'] },
        bedroom: { purpose: 'Sleeping; upstairs when the cottage has a second storey.' },
        cellar: cellar,
      },
      references: [
        'Post-war rural brick cottages: one or one-and-a-half storeys, a central or offset front door, two windows each side.',
        'Small farm workers\' houses of the 1950s to 1970s, rendered block over a concrete plinth, with a lean-to at the back.',
        'Roadside smallholdings: the house close to the road, a yard and outbuildings behind it.',
        cellarReference,
      ],
      facade: 'A plain, symmetrical street face: a door with a small canopy, regular window pairs, a plinth course ' +
              'and a coping at the roof line. The back is busier, with the kitchen door, a lean-to and a coal or log store.',
      cover: 'Few, small windows give a defender narrow views of the road and yard; the open plot round the house ' +
             'means no approach is hidden for long, and the back door is the weak point.',
    },
    flatRoofHouse,
    flatRoofHouse + {
      id: 'rural_flat_roof_house_wc',
      program+: {
        kitchen+: { purpose: 'Cooking at the back; the back door to the yard opens from it.' },
        wc: { purpose: 'A small WC off the front room, plumbed in when the house was modernised.', serves: ['toilet', 'washing'] },
      },
      references+: [
        'Village houses modernised in the 1970s and 1980s: a WC and basin partitioned off the back rooms once a ' +
        'water main or a septic tank reached the house, the old privy left in the yard or pulled down.',
      ],
    },
    // A garage any country plot can set beside its house; its shelf and crate hold a household's odds and ends.
    {
      id: 'rural_garage',
      setting: 'modern_1980s',
      tags: ['late_modern', 'nordic', 'balkan'],
      eligibility: { settlementKinds: ['rural'] },
      plot: { along: 10, depth: 14 },
      styles: ['rural_outbuilding'],
      storeys: [1, 1],
      program: {
        garage: {
          purpose: 'One car\'s bay open to the road, with a shelf and a crate of tools, tins and spares at the back.',
          serves: ['storage'],
        },
      },
      references: [
        'Finnish and Swedish country houses of the 1960s to 1980s: a separate single garage of blockwork beside the ' +
        'house once the family had a car, under a shallow sheet roof.',
        'Yugoslav village plots of the same decades: an owner-built blockwork garage at the road frontage, often ' +
        'with no door hung, its back wall lined with a shelf of jars, tins and tools.',
      ],
      facade: 'A plain blockwork box end-on to the road: one open bay under a lintel and a thin sheet roof.',
      cover: 'Blockwork stops shots, and the open bay shows the whole inside from the road; the crate at the back ' +
             'is the only thing to crouch behind.',
    },
    // A woodshed any country yard can set across from its house's back door; its room asks for the firewood it keeps.
    {
      id: 'rural_woodshed',
      setting: 'modern_1980s',
      tags: ['late_modern', 'postwar', 'nordic', 'balkan', 'central_european'],
      eligibility: { settlementKinds: ['rural'] },
      plot: { along: 10, depth: 7 },
      styles: ['rural_outbuilding'],
      storeys: [1, 1],
      program: {
        woodshed: {
          purpose: 'The stove\'s firewood, split and stacked dry against the back wall under the roof.',
          serves: ['firewood'],
        },
      },
      references: [
        'Finnish and Swedish country yards of the 1950s to 1980s: an open-fronted board lean-to across the yard ' +
        'from the house, the winter\'s split logs stacked to the roof along its back.',
        'Balkan and Austrian village yards of the same decades: a plank shed under a sheet roof beside the house, ' +
        'open to the yard so the wood dries, with the chopping block in front.',
      ],
      facade: 'An open front of boards on two end walls under a sheet roof, the cut ends of the stacked logs showing.',
      cover: 'The log stacks stop shots and hide a crouching body; the open front gives no way to shut anyone out.',
    },
    // A privy any country yard can set at its far end, for a house with no indoor WC.
    {
      id: 'rural_privy',
      setting: 'modern_1980s',
      tags: ['late_modern', 'postwar', 'nordic', 'balkan', 'mediterranean', 'central_european'],
      eligibility: { settlementKinds: ['rural'] },
      plot: { along: 6, depth: 8 },
      styles: ['rural_outbuilding'],
      storeys: [1, 1],
      program: {
        toilet: {
          purpose: 'The household\'s toilet: a plank seat over the pit, reached from the trodden ground at its door.',
          serves: ['toilet'],
        },
      },
      references: [
        'Balkan and Greek village yards of the 1950s to 1980s: a plank privy over a dug pit at the far end of the ' +
        'yard, its door facing the house.',
        'Finnish and Swedish country outhouses of the same decades: a narrow board hut under a sheet roof, one seat ' +
        'and a hinged plank door, kept on after many houses had a WC.',
      ],
      facade: 'A narrow plank hut, a little taller than a man, with one plank door under a sheet roof.',
      cover: 'Thin boards hide a body but stop little; the one door leaves whoever is inside nowhere else to go.',
    },
    // A works stores holds whatever the works it stands beside keeps in stock; what that is belongs to the answer's
    // racking, not to the brief. See `packages/deadvox/docs/building-pathway.md`, "Worked example: works stores".
    {
      id: 'works_stores',
      setting: 'modern_1980s',
      tags: ['postwar', 'late_modern', 'nordic', 'balkan', 'central_european'],
      eligibility: { settlementKinds: ['rural'] },
      plot: { along: 14, depth: 13 },
      styles: ['works_brick'],
      storeys: [1, 1],
      program: {
        service_aisle: {
          purpose: 'The clear way in from the door between the racks, wide enough to carry a part or a crate out.',
        },
        stores_room: {
          purpose: 'The racked floor where the works keeps its spares, fittings and consumables, on shelves along ' +
                   'the walls and in crates on the floor.',
          serves: ['storage'],
        },
      },
      references: [
        'Stores sheds beside rural electricity works, pumping stations and small hydro stations of the 1950s to ' +
        '1980s: a one-storey brick or blockwork box under a flat concrete roof, one solid door at the end facing ' +
        'the works, no windows at eye height.',
        'Spares stores of municipal and co-operative works yards of the same decades in Finland, Yugoslavia and ' +
        'Austria: shelving along the walls for spare parts and fittings, crates of consumables on the floor and a ' +
        'clear aisle from the door.',
      ],
      facade: 'A plain brick end to the works: one solid timber door in the middle, no windows, and the felt-covered roof slab as a thin dark line along the top.',
      cover: 'Brick walls stop shots and the one door is the only way in, so whoever is inside is as easily shut ' +
             'in as kept safe; the racks along the walls break the sightline from the door to the back corners.',
    },
    {
      id: 'village_shop',
      setting: 'modern_1980s',
      tags: ['late_modern', 'western_european', 'central_european'],
      eligibility: { settlementKinds: ['rural'] },
      plot: { along: 22, depth: 20 },
      styles: ['village_shop_render', 'village_shop_brick'],
      storeys: [2, 2],
      program: {
        shop: { purpose: 'The village\'s one general store: groceries on wall shelves, a chilled cabinet, and the counter where the till stood.' },
        store_room: { purpose: 'Stock behind the shop, between the counter and the back door that deliveries came in by.' },
        living_room: {
          purpose: 'The flat\'s front room over the shop, warmed by a wood stove.',
          serves: ['heating'],
        },
        kitchen: { purpose: 'The flat\'s kitchen over the shop, facing the road.', serves: ['cooking', 'washing'] },
        bathroom: { purpose: 'A small bathroom at the back of the flat.', serves: ['toilet', 'washing'] },
        bedroom: { purpose: 'The shopkeeper\'s bedroom at the back, away from the road.' },
      },
      references: [
        'British and Dutch village shops of the 1960s to 1980s: a two-storey rendered or brick house with a shopfront ' +
        'on the ground floor, a painted fascia board over it and the shopkeeper\'s flat upstairs.',
        'German and Austrian village grocers of the same decades: the shop door and the house door side by side on the ' +
        'street, a store room at the back and a yard door for deliveries.',
      ],
      facade: 'A plain two-storey face to the road: on the ground floor a broad display window and the shop door under ' +
              'a fascia board, and beside them the flat\'s own front door; two windows above, and a flat roof.',
      cover: 'The display window is a weak, wide opening onto the counter; the flat upstairs has small windows over ' +
             'the road and one stair, so whoever holds the landing holds the flat. The back door through the store room ' +
             'is the quiet way in.',
    },
  ],
}
