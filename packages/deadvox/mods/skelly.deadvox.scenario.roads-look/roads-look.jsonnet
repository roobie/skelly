// The roads look: two compounds joined by one matched, walkable dirt road, so one walk checks the gate mate,
// the corner transition's real rotation and the bent route between the gates.
local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
local context = { usage: ['Residential'], tier: 'Tier1' };
{
  scenarios: [{
    id: 'roads_look',
    kind: 'composedSite',
    outbreakAgeGameHours: 24 * 120,
    decalLimit: 48,
    body: 'player',
    compression: 'player',
    bounds: { x0: -48, z0: -48, x1: 48, z1: 48 },
    ground: 21,
    lootContext: context,
    settlementKind: 'rural',
    start: { ask: 'homestead' },
    placement: { apronMetres: 2, attempts: 400 },
    asks: [
      { kind: 'place', id: 'homestead', template: 'roads_homestead' },
      {
        kind: 'place', id: 'barn', template: 'roads_barn',
        distance: { from: 'homestead', curve: [[0, 0], [12, 4], [28, 4], [44, 0]] },
      },
    ],
    links: [{
      id: 'lane',
      from: { ask: 'homestead', port: 'gate' },
      to: { ask: 'barn', port: 'gate' },
      transition: { assembly: 'roads_corner', gate: 'gate', outward: 'outward' },
    }],
    guarantee: {},
    population: { authoredMarkers: false },
    anchors: [],
    eventRules: [],
  }],
  starts: [kit.fixture + kit.notSiteDefault + {
    id: 'roadslook',
    site: 'roads_look',
    startTimeGameTimeOfDay: kit.day.noonGameTimeOfDay,
  }],
}
