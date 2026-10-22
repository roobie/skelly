local level = import 'gauntlet-lab-level.libsonnet';
local entry = import 'gauntlet-lab-entry.libsonnet';
local administration = import 'gauntlet-lab-administration.libsonnet';
local circulation = import 'gauntlet-lab-circulation.libsonnet';
local equipment = import 'gauntlet-lab-equipment.libsonnet';
local descents = import 'gauntlet-lab-descents.libsonnet';
local threat = import 'gauntlet-lab-threat.libsonnet';
local context = { usage: ['Industrial', 'Medical'], tier: 'Tier1' };
local slot = function(id, kind, ref, at, size) { id: id, at: at, size: size, turn: 0, choices: [{ ref: { kind: kind, id: ref }, weight: 1 }] };
local room = function(id, shell, first, second) equipment.room('gauntlet_lab_' + id, 'gauntlet_lab_shell' + shell, first, second);
local placedRoom = function(id, ref, at) slot(id, 'assembly', 'gauntlet_lab_' + ref, at, [18, 8, 14]);
local storey = function(id, rooms) {
  id: 'gauntlet_lab_storey_' + id, size: [72, 8, 64], lootContext: context,
  slots: circulation.slots + rooms + threat.slots(id, [r for r in rooms if r.choices[0].ref.id != 'gauntlet_lab_culture_stair_join']),
  joins: [], ports: [], anchors: {},
};
// Where level two hands over to the grid below, in one place so level three's round rewrites only this.
local join = {
  landings: { middle_middle: 'culture_stair_join', north_east: 'cold_store_incoming_east', south_west: 'breach' },
  standing: [35, 17, 33],
  descent: { ladder: [59, 17, 10], upper: [58, 25, 11], lower: [58, 17, 11] },
  slots: [
    slot('administration_stair', 'piece', level.stair.id, administration.stairAt, level.stair.size),
    slot('administration_shaft', 'piece', descents.mapPieces[3].id, [58, 17, 10], [3, 8, 2]),
  ],
};
local cabinetShape = [
  { position: [0, 0, 0], size: [4, 0.3, 2] }, { position: [0, 0.3, 0], size: [0.3, 4.7, 2] },
  { position: [3.7, 0.3, 0], size: [0.3, 4.7, 2] }, { position: [0.3, 4.7, 0], size: [3.4, 0.3, 2] },
];
{
  width: std.max(72, entry.size[0]), depth: std.max(64, entry.size[2]), ground: 40, surfaceOffset: 24,
  entry: { hatch: entry.hatch, ladder: [entry.hatch[0] + 1, 33, entry.hatch[2]] },
  port: entry.port,
  anchors: {
    storeys: [
      { id: 'entry', standing: entry.standing }, { id: 'administration', standing: administration.standing },
      { id: 'containment', standing: join.standing }, { id: 'failure', standing: [35, 9, 29] },
      { id: 'bottom', standing: [35, 1, 29] },
    ],
    descents: [
      entry.shaft,
      join.descent,
      { ladder: [35, 9, 10], upper: [34, 17, 11], lower: [34, 9, 11] },
      { ladder: [35, 9, 48], upper: [34, 17, 49], lower: [34, 9, 49] },
      { ladder: [12, 1, 29], upper: [11, 9, 30], lower: [11, 1, 30] },
      { ladder: [59, 1, 29], upper: [58, 9, 30], lower: [58, 1, 30] },
    ],
    stairs: [entry.stair, administration.stair],
    seals: [entry.seal, administration.seal],
    objective: [30, 3, 26],
  },
  fixedLoot: entry.fixedLoot + administration.fixedLoot,
  loot: entry.loot + administration.loot,
  items: entry.items + administration.items,
  furniture: [
    { id: 'gauntlet_lab_bulkhead', name: 'Steel bulkhead door', size: [4, 5, 2], color: '#68767b',
      door: { material: 'steel', methods: {}, handlingSimSeconds: 1.2 },
      shape: [
        { position: [0, 0, 0.6], size: [4, 5, 0.8] },
        { position: [0.2, 0.2, 0.4], size: [3.6, 0.3, 1.2] },
        { position: [0.2, 4.5, 0.4], size: [3.6, 0.3, 1.2] },
        { position: [0.3, 0.5, 0.4], size: [0.3, 4, 1.2] },
        { position: [3.4, 0.5, 0.4], size: [0.3, 4, 1.2] },
        { position: [2.6, 2, 0.2], size: [0.7, 0.7, 0.3] },
      ] },
    { id: 'gauntlet_lab_dead_lift', name: 'Freight lift', size: [4, 5, 2], color: '#62696c', shape: [
      { position: [0, 0, 0], size: [4, 0.3, 2] }, { position: [0, 0, 0], size: [0.3, 5, 2] },
      { position: [3.7, 0, 0], size: [0.3, 5, 2] }, { position: [0, 4.7, 0], size: [4, 0.3, 2] },
      { position: [1.8, 0, 0], size: [0.4, 5, 0.3] },
    ] },
    { id: 'gauntlet_lab_fixture', name: 'Strip light', size: [2, 1, 1], color: '#a5b8ba', solid: false,
      shape: [{ position: [0, 0.7, 0], size: [2, 0.3, 1] }] },
    { id: 'gauntlet_lab_fixture_broken', name: 'Broken strip light', size: [2, 1, 1], color: '#555c61', solid: false,
      shape: [{ position: [0, 0.7, 0], size: [2, 0.3, 1] }, { position: [0.2, 0, 0.3], size: [0.2, 0.7, 0.2] }] },
    { id: 'gauntlet_look_archive', name: 'Prototype archive shelves', size: [4, 5, 2], color: '#a0a6a0', shape: cabinetShape + [{ position: [0.3, 2.3, 0], size: [3.4, 0.3, 2] }] },
    { id: 'gauntlet_look_cold_store', name: 'Prototype cold specimen bank', size: [4, 5, 2], color: '#90b0b5', shape: [{ position: [0, 0, 0], size: [4, 5, 2] }] },
    { id: 'gauntlet_look_exam', name: 'Prototype examination slab', size: [4, 2, 2], color: '#c7cfc7', shape: [{ position: [0, 1.5, 0], size: [4, 0.5, 2] }, { position: [0.5, 0, 0.5], size: [3, 1.5, 1] }] },
    { id: 'gauntlet_look_pump', name: 'Prototype pressure plant', size: [4, 4, 3], color: '#738981', shape: [{ position: [0, 0, 0], size: [4, 0.4, 3] }, { position: [0.3, 0.4, 0.3], size: [1.2, 3.6, 2.4] }, { position: [2.5, 0.4, 0.3], size: [1.2, 3.6, 2.4] }] },
    { id: 'gauntlet_look_culture', name: 'Prototype culture apparatus', size: [4, 4, 2], color: '#91a978', shape: [{ position: [0, 0, 0], size: [4, 0.4, 2] }, { position: [0.2, 0.4, 0.2], size: [0.6, 3.6, 1.6] }, { position: [1.7, 0.4, 0.2], size: [0.6, 3.6, 1.6] }, { position: [3.2, 0.4, 0.2], size: [0.6, 3.6, 1.6] }] },
  ],
  mapPieces: circulation.mapPieces + equipment.mapPieces + threat.mapPieces + [level.stair] + entry.mapPieces + administration.mapPieces,
  mapAssemblies: entry.mapAssemblies + administration.mapAssemblies + [
    room('culture_stair_join', '_stair_join', 'culture', 'bench'),
    room('intake_outgoing', '_outgoing', 'bench', 'bench'), room('records', '', 'archive', 'archive'), room('clinic', '', 'exam', 'bench'),
    room('cold_store', '', 'cold_store', 'cold_store'), room('workshop', '', 'bench', 'pump'), room('utilities', '', 'pump', 'pump'),
    room('observation', '', 'console', 'containment'), room('culture', '', 'culture', 'bench'), room('security_outgoing_east', '_outgoing_east', 'console', 'archive'),
    room('security', '', 'console', 'archive'), room('assay_outgoing', '_outgoing', 'culture', 'containment'),
    room('culture_incoming', '_incoming', 'culture', 'bench'), room('assay', '', 'culture', 'containment'), room('observation_outgoing_east', '_outgoing_east', 'console', 'containment'),
    room('workshop_outgoing', '_outgoing', 'bench', 'pump'), room('containment', '', 'containment', 'containment'), room('decon_incoming_east', '_incoming_east', 'pump', 'spill'),
    room('cold_store_incoming_east', '_incoming_east', 'cold_store', 'cold_store'),
    room('breach_incoming', '_incoming', 'breach', 'spill'), room('security_outgoing', '_outgoing', 'console', 'archive'),
    room('quarantine_incoming', '_incoming', 'breach', 'breach'), room('utilities_incoming', '_incoming', 'pump', 'pump'),
    room('decon_outgoing', '_outgoing', 'pump', 'spill'), room('breach_outgoing_east', '_outgoing_east', 'breach', 'spill'),
    room('quarantine', '', 'breach', 'breach'), room('breach', '', 'breach', 'spill'), room('decon', '', 'pump', 'spill'), room('holding', '', 'spill', 'spill'),
    room('objective', '', 'objective', 'breach'), room('quarantine_incoming_east', '_incoming_east', 'breach', 'breach'),
    storey('containment', [
      placedRoom('north_west', 'containment', [4, 0, 4]), placedRoom('north_middle', 'assay_outgoing', [27, 0, 4]), placedRoom('north_east', join.landings.north_east, [50, 0, 4]),
      placedRoom('middle_west', 'observation', [4, 0, 23]), placedRoom('middle_middle', join.landings.middle_middle, [27, 0, 23]), placedRoom('middle_east', 'decon', [50, 0, 23]),
      placedRoom('south_west', join.landings.south_west, [4, 0, 42]), placedRoom('south_middle', 'security_outgoing', [27, 0, 42]), placedRoom('south_east', 'containment', [50, 0, 42]),
    ]),
    storey('failure', [
      placedRoom('north_west', 'breach', [4, 0, 4]), placedRoom('north_middle', 'quarantine_incoming', [27, 0, 4]), placedRoom('north_east', 'containment', [50, 0, 4]),
      placedRoom('middle_west', 'decon_outgoing', [4, 0, 23]), placedRoom('middle_middle', 'assay', [27, 0, 23]), placedRoom('middle_east', 'breach_outgoing_east', [50, 0, 23]),
      placedRoom('south_middle', 'utilities_incoming', [27, 0, 42]), placedRoom('south_east', 'observation', [50, 0, 42]),
    ]),
    storey('bottom', [
      placedRoom('north_west', 'quarantine', [4, 0, 4]), placedRoom('north_middle', 'breach', [27, 0, 4]), placedRoom('north_east', 'quarantine', [50, 0, 4]),
      placedRoom('middle_west', 'breach_incoming', [4, 0, 23]), placedRoom('middle_middle', 'objective', [27, 0, 23]), placedRoom('middle_east', 'quarantine_incoming_east', [50, 0, 23]),
      placedRoom('south_west', 'holding', [4, 0, 42]), placedRoom('south_middle', 'decon', [27, 0, 42]), placedRoom('south_east', 'quarantine', [50, 0, 42]),
    ]),
    {
      id: 'gauntlet_lab', size: [$.width, 40, $.depth], lootContext: context,
      slots: [
        slot('entry', 'assembly', 'gauntlet_lab_level_entry', [0, 32, 0], entry.size),
        slot('administration', 'assembly', 'gauntlet_lab_level_administration', [0, 24, 0], administration.size),
        slot('containment', 'assembly', 'gauntlet_lab_storey_containment', [0, 16, 0], [72, 8, 64]),
        slot('failure', 'assembly', 'gauntlet_lab_storey_failure', [0, 8, 0], [72, 8, 64]),
        slot('bottom', 'assembly', 'gauntlet_lab_storey_bottom', [0, 0, 0], [72, 8, 64]),
        slot('holding_top', 'piece', 'gauntlet_lab_holding_top', [4, 8, 42], [18, 4, 14]),
        slot('entry_stair', 'piece', level.stair.id, entry.stairAt, level.stair.size),
        slot('entry_shaft', 'piece', descents.mapPieces[3].id, [entry.shaft.ladder[0] - 1, entry.shaft.ladder[1], entry.shaft.ladder[2]], [3, 8, 2]),
      ] + join.slots + [
        slot('containment_north_descent', 'piece', descents.mapPieces[3].id, [34, 9, 10], [3, 8, 2]),
        slot('containment_south_descent', 'piece', descents.mapPieces[3].id, [34, 9, 48], [3, 8, 2]),
        slot('failure_west_descent', 'piece', descents.mapPieces[3].id, [11, 1, 29], [3, 8, 2]),
        slot('failure_east_descent', 'piece', descents.mapPieces[3].id, [58, 1, 29], [3, 8, 2]),
      ], joins: [], ports: [], anchors: {},
    },
  ],
}
