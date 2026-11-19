// A rural plot: the flat-roof house with its yard. The plots with and without an outhouse share this base and
// differ in their program, so a pool owns how many have one and each brief owns its fit.
local ruralPlot = {
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
  },
  references: [
    'Balkan and Greek village plots of the 1970s and 1980s: the house at the road, a walled or fenced yard behind ' +
    'it with a well, a woodshed, a hen house and the privy at the far end.',
    'Finnish and Swedish country houses of the same decades: the house by the road, a woodshed and outhouse ' +
    'across the yard, and a separate garage beside the house once the family had a car.',
  ],
  facade: 'The house\'s long rendered face to the road, a trodden path down one side to the yard, and in some ' +
          'plots a blockwork garage beside the house with its opening to the road.',
  cover: 'The outbuildings break the yard into cover and blind corners: the woodshed and the well hide a body, ' +
         'and a walk to the privy at night leaves the house\'s walls behind.',
};
{
  buildingBriefs: [
    ruralPlot + {
      id: 'rural_privy_plot',
      program+: { privy: { purpose: 'The household\'s toilet, at the far end of the yard.', serves: ['toilet'] } },
    },
    ruralPlot + { id: 'rural_plot' },
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
      },
      references: [
        'Post-war rural brick cottages: one or one-and-a-half storeys, a central or offset front door, two windows each side.',
        'Small farm workers\' houses of the 1950s to 1970s, rendered block over a concrete plinth, with a lean-to at the back.',
        'Roadside smallholdings: the house close to the road, a yard and outbuildings behind it.',
      ],
      facade: 'A plain, symmetrical street face: a door with a small canopy, regular window pairs, a plinth course ' +
              'and a coping at the roof line. The back is busier, with the kitchen door, a lean-to and a coal or log store.',
      cover: 'Few, small windows give a defender narrow views of the road and yard; the open plot round the house ' +
             'means no approach is hidden for long, and the back door is the weak point.',
    },
    {
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
      },
      references: [
        'Yugoslav rural houses of the 1970s and 1980s: owner-built rendered blockwork cubes under a flat concrete ' +
        'slab, a parapet round the roof and the slab edge left projecting as a plain cornice.',
        'Greek and Cypriot village houses of the same decades: reinforced-concrete frame and flat roof behind a ' +
        'low parapet, rendered walls, a shallow concrete band at the roof line.',
        'Finnish and Swedish flat-roofed detached houses of the 1960s and 1970s: low, white-rendered, with ' +
        'dark-stained timber boarding at the entrance and a broad fascia.',
      ],
      facade: 'A long, low rendered face to the road on a stone plinth course: a centred porch under the ' +
              'projecting slab, a window either side, and the parapet coping as one clean line along the top. ' +
              'Some houses clad the entrance bay in timber boards.',
      cover: 'The walls stop shots and the windows are few and small; the flat roof behind its parapet is a ' +
             'firing step for whoever gets up there. The porch has no door to close, so the back is the ' +
             'only door that holds.',
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
