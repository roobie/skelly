{
  buildingBriefs: [
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
          serves: ['cooking'],
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
  ],
}
