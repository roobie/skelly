{
  buildingBriefs: [
    {
      id: 'small_factory',
      setting: 'modern_1980s',
      tags: ['late_modern', 'western_european', 'central_european'],
      eligibility: { settlementKinds: ['city'] },
      plot: { along: 36, depth: 28 },
      styles: ['gauntlet_authored_masonry', 'service_brick'],
      storeys: [1, 2],
      program: {
        shop_floor: { purpose: 'The open production hall: machines in bays, clear aisles between them.' },
        loading_bay: { purpose: 'Goods in and out through a wide door to the yard.' },
        office: { purpose: 'The front office and reception, facing the street, with a view of the yard gate.' },
        stores: { purpose: 'Raw material and finished stock, locked off the shop floor.' },
      },
      references: [
        'Light-industrial units on 1960s to 1980s town edges: a blockwork or brick office block in front of a steel-clad shed.',
        'Small engineering and joinery works: a single-storey hall with a north-light or low-pitched roof and a fenced yard.',
        'Municipal depots and substations of the same era: fenced compounds, a plain masonry building and yard plant.',
      ],
      facade: 'A two-part front: a small masonry office with ordinary windows and the entrance, beside a taller, ' +
              'mostly blank hall wall broken only by the loading door and a high band of windows. Signage on the office.',
      cover: 'The hall is open and long, so sightlines inside are wide and machines are the only cover; the yard ' +
             'fence and parked vehicles screen the approach, and the loading door is a second, wide way in.',
    },
    {
      id: 'detached_town_house',
      setting: 'modern_1980s',
      tags: ['late_modern', 'central_european'],
      eligibility: { settlementKinds: ['city'] },
      plot: { along: 18, depth: 16 },
      styles: ['villa_brick', 'villa_rendered'],
      storeys: [2, 2],
      program: {
        living_room: { purpose: 'The front room off the hall, where the family sat; the stair rises along its side wall.' },
        kitchen: {
          purpose: 'A kitchen at the side with a table under the street window, the sink and cooker along the outer ' +
                   'wall, and at the back the boiler that heats the house through its radiators.',
          serves: ['cooking', 'washing', 'heating'],
        },
        bathroom: {
          purpose: 'An indoor bathroom off the landing, as a town house of the era had: toilet, washbasin, shower ' +
                   'and a cabinet on the wall.',
          serves: ['toilet', 'washing', 'bathing'],
        },
        front_bedroom: { purpose: 'The parents\' room over the street, the largest upstairs.' },
        back_bedroom: { purpose: 'A child\'s room over the back garden, with a desk under the window.' },
      },
      references: [
        'Detached two-storey brick houses on 1960s to 1980s inner suburbs of European towns: a plain box with a flat roof, the stair inside the front wall.',
        'Rendered villas of the same era, the brick plastered over in pale render, with steel-framed casement windows in a regular grid.',
        'A small front garden between the pavement and the door: a lawn, a paved path, sometimes a privet hedge or a low fence.',
      ],
      facade: 'A symmetrical street front: the door in the middle, a window either side of it and two above. Brick ' +
              'or render throughout, the roof flush with the walls, sometimes a low parapet at its street edge.',
      cover: 'Windows on every side give the house sightlines but no hard cover; inside, the partition walls break ' +
             'line of sight between hall, kitchen and stair, and the hedge screens the front garden from the street.',
    },
    {
      id: 'city_townhouse',
      setting: 'modern_1980s',
      tags: ['late_modern', 'central_european'],
      eligibility: { settlementKinds: ['city'] },
      plot: { along: 18, depth: 16 },
      styles: ['brick_townhouse', 'concrete_townhouse'],
      storeys: [1, 3],
      program: {
        living_room: {
          purpose: 'The room the street door opens into, the stair rising along its front wall; upper storeys repeat it as ' +
                   'bedrooms.',
        },
        kitchen: {
          purpose: 'A kitchen corner at the back of the storey a body enters by: the sink on the side wall and the ' +
                   'cooker against the bathroom.',
          serves: ['cooking', 'washing'],
        },
        bathroom: {
          purpose: 'A small bathroom behind the kitchen, off its back wall: toilet, washbasin and a cabinet over it.',
          serves: ['toilet', 'washing'],
        },
        cellar: {
          purpose: 'A house built over a cellar keeps its plant and stores there: the boiler and its coal in the back ' +
                   'corner under the kitchen, shelves of food put by, a drain in the floor and a bare bulb over it.',
          serves: ['heating', 'storage', 'drainage', 'lighting'],
          cellar: true,
        },
      },
      references: [
        'Terraced and semi-detached town houses on 1960s to 1980s city streets in Central Europe: a narrow flat-roofed box ' +
        'of one to three storeys, brick or cast concrete, its stair just inside the front wall.',
        'Houses of the same era built over a full cellar, the street door at pavement level above it.',
      ],
      facade: 'A plain street front: the door in the middle between two casements, a pair of casements on each storey above, ' +
              'brick or bare concrete throughout, the flat roof flush with the walls or behind a low parapet.',
      cover: 'The rooms are open plan, so furniture is the only cover and the stair breaks the sightline from the door; ' +
             'the bathroom is the one closed room, and the roof ladder on the side wall is a second way in.',
    },
  ],
}
