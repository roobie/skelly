local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// The look's whole prop: a pad on the lot's open ground split into concrete, planks, sheet metal and dirt, the
// spawn on the corner where all four meet. A pistol throws its cases about a metre to the right, so turning on
// the spot drops them on each surface in turn.
local half = 4;
local row(left, right) = std.join('', std.repeat([left], half) + std.repeat([right], half));
local air = std.repeat([std.join('', std.repeat(['.'], 2 * half))], 2 * half);
{
  templates: [{
    id: 'test_house_case_landing_pad',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [2 * half, 3, 2 * half],
    palette: { '.': 'air', k: 'concrete', p: 'planks', g: 'galvanized', d: 'dirt' },
    layers: [
      std.repeat([row('k', 'p')], half) + std.repeat([row('d', 'g')], half),
      air,
      air,
    ],
  }],
  layouts: [layout + {
    id: 'testHouseCaseLandingLook',
    buildings: layout.buildings + [
      { template: 'test_house_case_landing_pad', position: [-12, 20.5, 14], rotation: 0 },
    ],
    // The building position is the pad's low corner and a pad cell is half a metre, so this is where the four
    // quadrants meet; an empty slot row lets the bearing apply.
    player: { position: [-12 + half / 2, 21, 14 + half / 2], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
