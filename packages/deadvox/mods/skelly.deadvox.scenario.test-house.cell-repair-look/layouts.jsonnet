local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
// The look's whole prop: a small brick alcove on the lot's open ground, its closed north wall beside the
// spawn. The start row damages one brick of that wall at eye height, so the reviewer only aims and mends.
local rows(block) = [std.join('', [block for _ in std.range(1, 5)]) for _ in std.range(1, 5)];
local ring = ['bbbbb', 'b...b', 'b...b', 'b...b', '.....'];
{
  templates: [{
    id: 'test_house_repair_alcove',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [5, 6, 5],
    palette: { '.': 'air', k: 'concrete', b: 'brick' },
    layers: [rows('k'), ring, ring, ring, ring, rows('b')],
  }],
  layouts: [layout + {
    id: 'testHouseCellRepairLook',
    buildings: layout.buildings + [
      { template: 'test_house_repair_alcove', position: [-12, 20.5, 14], rotation: 0 },
    ],
    // Standing inside the alcove, facing its north wall; an empty slot row lets the bearing apply.
    player: { position: [-10.75, 21, 14.75], bearing: 0 },
    showroom: layout.showroom + { slots: [] },
  }],
}
