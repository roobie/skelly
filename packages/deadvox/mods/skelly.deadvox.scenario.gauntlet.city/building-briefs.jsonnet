{
  buildingBriefs: [
    {
      id: 'small_factory',
      setting: 'modern_1980s',
      eligibility: { settlementKinds: ['city'] },
      plot: { along: 36, depth: 28 },
      styles: ['gauntlet_authored_masonry', 'service_brick'],
      storeys: [1, 2],
      program: {
        shop_floor: 'The open production hall: machines in bays, clear aisles between them.',
        loading_bay: 'Goods in and out through a wide door to the yard.',
        office: 'The front office and reception, facing the street, with a view of the yard gate.',
        stores: 'Raw material and finished stock, locked off the shop floor.',
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
      eligibility: { settlementKinds: ['city'] },
      plot: { along: 18, depth: 16 },
      styles: ['villa_brick', 'villa_rendered'],
      storeys: [2, 2],
      program: {
        living_room: 'The front room off the hall, where the family sat; the stair rises along its side wall.',
        kitchen: 'A galley kitchen at the side, fitted counters and cupboards along the outer wall.',
        front_bedroom: 'The parents\' room over the street, the largest upstairs.',
        back_bedroom: 'A child\'s room over the back garden, with a desk under the window.',
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
  ],
}
