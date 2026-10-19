local circulation = import 'gauntlet-lab-circulation.libsonnet';
local equipment = import 'gauntlet-lab-equipment.libsonnet';
local descents = import 'gauntlet-lab-descents.libsonnet';
local threat = import 'gauntlet-lab-threat.libsonnet';
local context = { usage: ['Industrial', 'Medical'], tier: 'Tier1' };
local slot = function(id, kind, ref, at, size) { id: id, at: at, size: size, turn: 0, choices: [{ ref: { kind: kind, id: ref }, weight: 1 }] };
local room = function(id, shell, first, second) equipment.room('gauntlet_lab_' + id, 'gauntlet_lab_shell' + shell, first, second);
local placedRoom = function(id, ref, at) slot(id, 'assembly', 'gauntlet_lab_' + ref, at, [18, 8, 14]);
// The entry storey takes the hatch's ladder through its south cross corridor and the sewer port through its south wall.
local entrySlots = { cross_south: 'gauntlet_lab_entry_cross', south: 'gauntlet_lab_south_port' };
local storey = function(id, rooms, entry=false) {
  id: 'gauntlet_lab_storey_' + id, size: [72, 8, 64], lootContext: context,
  slots: (if entry then [if std.objectHas(entrySlots, s.id) then s + { choices: [{ ref: { kind: 'piece', id: entrySlots[s.id] }, weight: 1 }] } else s for s in circulation.slots] else circulation.slots) + rooms + threat.slots(id, rooms),
  joins: [], ports: [], anchors: {},
};
local cabinetShape = [
  { position: [0, 0, 0], size: [4, 0.3, 2] }, { position: [0, 0.3, 0], size: [0.3, 4.7, 2] },
  { position: [3.7, 0.3, 0], size: [0.3, 4.7, 2] }, { position: [0.3, 4.7, 0], size: [3.4, 0.3, 2] },
];
{
  width: 72, depth: 64, ground: 40, surfaceOffset: 24,
  entry: { hatch: [42, 40, 39], ladder: [43, 33, 39] },
  port: circulation.port,
  anchors: {
    storeys: [
      { id: 'intake', standing: [35, 33, 29] }, { id: 'research', standing: [35, 25, 29] },
      { id: 'containment', standing: [35, 17, 29] }, { id: 'failure', standing: [35, 9, 29] },
      { id: 'bottom', standing: [35, 1, 29] },
    ],
    descents: [
      { ladder: [12, 25, 10], upper: [11, 33, 11], lower: [11, 25, 11] },
      { ladder: [59, 25, 48], upper: [58, 33, 49], lower: [58, 25, 49] },
      { ladder: [59, 17, 10], upper: [58, 25, 11], lower: [58, 17, 11] },
      { ladder: [12, 17, 48], upper: [11, 25, 49], lower: [11, 17, 49] },
      { ladder: [35, 9, 10], upper: [34, 17, 11], lower: [34, 9, 11] },
      { ladder: [35, 9, 48], upper: [34, 17, 49], lower: [34, 9, 49] },
      { ladder: [12, 1, 29], upper: [11, 9, 30], lower: [11, 1, 30] },
      { ladder: [59, 1, 29], upper: [58, 9, 30], lower: [58, 1, 30] },
    ],
    objective: [30, 3, 26],
  },
  furniture: [
    { id: 'gauntlet_look_archive', name: 'Prototype archive shelves', size: [4, 5, 2], color: '#a0a6a0', shape: cabinetShape + [{ position: [0.3, 2.3, 0], size: [3.4, 0.3, 2] }] },
    { id: 'gauntlet_look_cold_store', name: 'Prototype cold specimen bank', size: [4, 5, 2], color: '#90b0b5', shape: [{ position: [0, 0, 0], size: [4, 5, 2] }] },
    { id: 'gauntlet_look_exam', name: 'Prototype examination slab', size: [4, 2, 2], color: '#c7cfc7', shape: [{ position: [0, 1.5, 0], size: [4, 0.5, 2] }, { position: [0.5, 0, 0.5], size: [3, 1.5, 1] }] },
    { id: 'gauntlet_look_pump', name: 'Prototype pressure plant', size: [4, 4, 3], color: '#738981', shape: [{ position: [0, 0, 0], size: [4, 0.4, 3] }, { position: [0.3, 0.4, 0.3], size: [1.2, 3.6, 2.4] }, { position: [2.5, 0.4, 0.3], size: [1.2, 3.6, 2.4] }] },
    { id: 'gauntlet_look_culture', name: 'Prototype culture apparatus', size: [4, 4, 2], color: '#91a978', shape: [{ position: [0, 0, 0], size: [4, 0.4, 2] }, { position: [0.2, 0.4, 0.2], size: [0.6, 3.6, 1.6] }, { position: [1.7, 0.4, 0.2], size: [0.6, 3.6, 1.6] }, { position: [3.2, 0.4, 0.2], size: [0.6, 3.6, 1.6] }] },
  ],
  mapPieces: circulation.mapPieces + equipment.mapPieces + threat.mapPieces,
  mapAssemblies: [
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
    storey('intake', [
      placedRoom('north_west', 'intake_outgoing', [4, 0, 4]), placedRoom('north_middle', 'records', [27, 0, 4]), placedRoom('north_east', 'clinic', [50, 0, 4]),
      placedRoom('middle_west', 'cold_store', [4, 0, 23]), placedRoom('middle_middle', 'workshop', [27, 0, 23]), placedRoom('middle_east', 'utilities', [50, 0, 23]),
      placedRoom('south_west', 'observation', [4, 0, 42]), placedRoom('south_middle', 'culture', [27, 0, 42]), placedRoom('south_east', 'security_outgoing_east', [50, 0, 42]),
    ], true),
    storey('research', [
      placedRoom('north_west', 'culture_incoming', [4, 0, 4]), placedRoom('north_middle', 'assay', [27, 0, 4]), placedRoom('north_east', 'observation_outgoing_east', [50, 0, 4]),
      placedRoom('middle_west', 'clinic', [4, 0, 23]), placedRoom('middle_middle', 'security', [27, 0, 23]), placedRoom('middle_east', 'cold_store', [50, 0, 23]),
      placedRoom('south_west', 'workshop_outgoing', [4, 0, 42]), placedRoom('south_middle', 'containment', [27, 0, 42]), placedRoom('south_east', 'decon_incoming_east', [50, 0, 42]),
    ]),
    storey('containment', [
      placedRoom('north_west', 'containment', [4, 0, 4]), placedRoom('north_middle', 'assay_outgoing', [27, 0, 4]), placedRoom('north_east', 'cold_store_incoming_east', [50, 0, 4]),
      placedRoom('middle_west', 'observation', [4, 0, 23]), placedRoom('middle_middle', 'culture', [27, 0, 23]), placedRoom('middle_east', 'decon', [50, 0, 23]),
      placedRoom('south_west', 'breach_incoming', [4, 0, 42]), placedRoom('south_middle', 'security_outgoing', [27, 0, 42]), placedRoom('south_east', 'containment', [50, 0, 42]),
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
      id: 'gauntlet_lab', size: [72, 40, 64], lootContext: context,
      slots: [
        slot('intake', 'assembly', 'gauntlet_lab_storey_intake', [0, 32, 0], [72, 8, 64]),
        slot('research', 'assembly', 'gauntlet_lab_storey_research', [0, 24, 0], [72, 8, 64]),
        slot('containment', 'assembly', 'gauntlet_lab_storey_containment', [0, 16, 0], [72, 8, 64]),
        slot('failure', 'assembly', 'gauntlet_lab_storey_failure', [0, 8, 0], [72, 8, 64]),
        slot('bottom', 'assembly', 'gauntlet_lab_storey_bottom', [0, 0, 0], [72, 8, 64]),
        slot('holding_top', 'piece', 'gauntlet_lab_holding_top', [4, 8, 42], [18, 4, 14]),
        slot('intake_west_descent', 'piece', descents.mapPieces[3].id, [11, 25, 10], [3, 8, 2]),
        slot('intake_east_descent', 'piece', descents.mapPieces[3].id, [58, 25, 48], [3, 8, 2]),
        slot('research_east_descent', 'piece', descents.mapPieces[3].id, [58, 17, 10], [3, 8, 2]),
        slot('research_west_descent', 'piece', descents.mapPieces[3].id, [11, 17, 48], [3, 8, 2]),
        slot('containment_north_descent', 'piece', descents.mapPieces[3].id, [34, 9, 10], [3, 8, 2]),
        slot('containment_south_descent', 'piece', descents.mapPieces[3].id, [34, 9, 48], [3, 8, 2]),
        slot('failure_west_descent', 'piece', descents.mapPieces[3].id, [11, 1, 29], [3, 8, 2]),
        slot('failure_east_descent', 'piece', descents.mapPieces[3].id, [58, 1, 29], [3, 8, 2]),
      ], joins: [], ports: [], anchors: {},
    },
  ],
}
