local content = import 'gauntlet.jsonnet';
local layout = import 'gauntlet-layout.libsonnet';
local lab = import 'gauntlet-lab.libsonnet';
local yard = import 'gauntlet-lab-yard.libsonnet';
local service = std.filter(function(t) t.id == 'gauntlet_service', content.mapAssemblies)[0];
local ground = lab.ground;
local hatch = lab.entry.hatch;
local ladder = lab.entry.ladder;
local sewer = import 'gauntlet-sewer.libsonnet';
local street = 12;
local pad = 2;
local block = std.max(service.size[0], service.size[2]) + 24;
local serviceCell = [-1, -1];
local serviceAt = [serviceCell[axis] * (street + block) + street + pad for axis in [0, 1]];
local intake = lab.anchors.storeys[0].standing[1];
local threshold = [lab.port.x + lab.port.width / 2, intake, lab.depth - 1];
{
  scenarios: [{
    id: 'gauntlet', kind: 'gauntlet',
    outbreakAgeGameHours: 24 * 120,
    decalLimit: 48,
    body: 'player', compression: 'player',
    serviceTemplate: service.id,
    composition: {
      start: (import 'gauntlet-start.libsonnet').start,
      fixedLoot: [{
        at: [lab.surfaceOffset + 9, ground + 1, lab.surfaceOffset + 18],
        items: [{ item: 'flashlight', placement: 'surface', key: true }],
      }, {
        at: [lab.surfaceOffset + 15, ground + 1, lab.surfaceOffset + 14],
        items: [{ item: 'gauntlet_maintenance_memo', placement: 'surface' }],
      }],
      leads: [
        { template: 'gauntlet_public_memo', lot: 'hq', at: [26, 0, 13], standing: [25, 1, 14], fixedLoot: [{ at: [0, 1, 0], items: [{ item: 'gauntlet_public_memo', placement: 'surface' }] }] },
        { template: 'gauntlet_public_directions', lot: 'police', at: [23, 0, 17], standing: [25, 1, 20], fixedLoot: [{ at: [0, 1, 0], items: [{ item: 'gauntlet_public_directions', placement: 'surface' }] }] },
      ],
      // The military reward is deliberately placed here, rather than linked to the substation.
      events: [{ template: 'gauntlet_special_ops_event', lot: 'substation', at: [16, 0, 15], fixedLoot: [{ at: [1, 1, 1], items: [{ item: 'rifle_assault', placement: 'surface', condition: 0.7, key: true }, { item: 'magazine_stanag_30', condition: 0.7 }] }] }],
      // The police station's locked armoury rack.
      stops: [
        { lot: 'police', fixedLoot: [{ at: [18, 1, 5], items: [{ item: 'pump_shotgun', condition: 0.7, key: true }] }] },
        { lot: 'hq', fixedLoot: [{ at: [7, 1, 33], items: [{ item: 'rifle_ak', condition: 0.7, key: true }] }] },
      ],
      landmarks: ['gauntlet_water_tank', 'gauntlet_loading_frame'],
      landmarkPositions: [[-16, 0, -82], [-34, 0, -24]],
      incidentalTemplates: ['gauntlet_incidental_bollard', 'gauntlet_incidental_cabinet', 'gauntlet_incidental_riser'],
      objective: lab.anchors.objective,
      objectiveFace: [lab.anchors.objective[0], lab.anchors.storeys[std.length(lab.anchors.storeys) - 1].standing[1], lab.anchors.objective[2] + 3],
      retreat: [lab.surfaceOffset + 12, ground + 1, lab.surfaceOffset + 8],
      resources: [{ at: [lab.surfaceOffset + 9, ground + 1, lab.surfaceOffset + 18], standing: [lab.surfaceOffset + 11, ground + 1, lab.surfaceOffset + 21] }],
      storeys: lab.anchors.storeys,
      descents: lab.anchors.descents,
      stairs: lab.anchors.stairs,
      seals: lab.anchors.seals,
    },
    portal: {
      hatch: hatch, ladder: ladder,
      upper: [hatch[0] + 4, ground + 1, hatch[2] + 1],
      lower: [hatch[0], ladder[1], hatch[2] + 1],
    },
    population: {
      settlementPressure: true, authoredMarkers: true,
      groupSize: 7, hordes: 1, roadsideOffset: 3, extraStragglers: 2,
      hordeAreas: [{ x0: 14, z0: -94, x1: 72, z1: -52 }],
    },
    city: {
      settlementKind: 'city',
      blocksX: 2, blocksZ: 2,
      bounds: layout.bounds, lots: layout.lots, paving: layout.paving, fillRows: false,
      // The sewer runs from the HQ yard to the lab's south wall, its guard room's doorway in line with the port.
      underground: [{
        id: 'hq_sewer', assembly: 'gauntlet_sewer',
        position: [serviceAt[0] + lab.port.x - sewer.door.x0, serviceAt[1] + lab.depth], turn: 0,
        mouths: [sewer.mouth],
        ports: [{ id: 'lab_south', outside: sewer.outside, threshold: threshold, inside: [threshold[0], intake, threshold[2] - 3] }],
      }],
      service: { cell: serviceCell, turn: 0, routes: yard.routes },
      street: street,
      blockX: block,
      blockZ: block,
      pad: pad, gap: 1, blend: 24,
      flatSurroundings: true,
      rows: 4,
      perimeter: {
        block: 'concrete', height: 12, thickness: 2,
        wire: { block: 'chain_link', height: 2 },
        lining: { assembly: 'gauntlet_perimeter_lining', pitch: 48 },
        gate: { assembly: 'gauntlet_perimeter_gate' },
      },
      streetProps: ['gauntlet_street_cars'],
      pool: 'gauntlet_city',
    },
  }],
  mapPools: [{
    id: 'gauntlet_city',
    choices: [
      { ref: { kind: 'assembly', id: row.id, style: style.id }, weight: row.weight * style.share }
      for row in [
        { id: 'gauntlet_city_1', weight: 36 },
        { id: 'gauntlet_city_2', weight: 30 },
        { id: 'gauntlet_city_3', weight: 18 },
        { id: 'gauntlet_city_cellar', weight: 12 },
      ]
      for style in [{ id: 'brick_townhouse', share: 0.75 }, { id: 'concrete_townhouse', share: 0.25 }]
    ] + [
      { ref: { kind: 'assembly', id: 'gauntlet_food_store' }, weight: 6, atMost: 3 },
      { ref: { kind: 'assembly', id: 'gauntlet_hardware_store' }, weight: 4, atMost: 2 },
      { ref: { kind: 'assembly', id: 'gauntlet_gun_store' }, weight: 1, atLeast: 1, atMost: 1 },
      { ref: { kind: 'assembly', id: 'gauntlet_city_cellar_secret', style: 'brick_townhouse' }, weight: 1, atLeast: 1, atMost: 1 },
    ],
  }],
}
