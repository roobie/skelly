// The gauntlet lab: four levels stacked in one assembly, each authored in its own file, ending at special
// research. `packages/deadvox/DESIGN.md`, "Gauntlet".
local level = import 'gauntlet-lab-level.libsonnet';
local entry = import 'gauntlet-lab-entry.libsonnet';
local administration = import 'gauntlet-lab-administration.libsonnet';
local research = import 'gauntlet-lab-research.libsonnet';
local special = import 'gauntlet-lab-special.libsonnet';
local equipment = import 'gauntlet-lab-equipment.libsonnet';
local descents = import 'gauntlet-lab-descents.libsonnet';
local threat = import 'gauntlet-lab-threat.libsonnet';
local context = { usage: ['Industrial', 'Medical'], tier: 'Tier1' };
local slot = function(id, kind, ref, at, size) { id: id, at: at, size: size, turn: 0, choices: [{ ref: { kind: kind, id: ref }, weight: 1 }] };
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
      { id: 'research', standing: research.standing }, { id: 'special', standing: special.standing },
    ],
    descents: [entry.shaft, administration.shaft, research.shaft],
    stairs: [entry.stair, administration.stair, research.stair],
    seals: [entry.seal, administration.seal, research.seal],
    objective: special.objective,
    objectiveFace: special.objectiveFace,
  },
  fixedLoot: entry.fixedLoot + administration.fixedLoot + research.fixedLoot + special.fixedLoot,
  loot: entry.loot + administration.loot + research.loot + special.loot,
  items: entry.items + administration.items + research.items + special.items,
  furniture: [
    // The level-three card's body: the officer body's shape and pockets under a name that fits a lab.
    [f for f in (import 'rural-police.jsonnet').furniture if f.id == 'dead_officer_body'][0] + {
      id: 'gauntlet_lab_dead_researcher', name: 'Dead researcher', color: '#c8c9c0',
    },
    [f for f in (import 'furniture.jsonnet').furniture if f.id == 'fridge'][0] + {
      id: 'gauntlet_lab_fridge', power: { device: 'lab_machine', fuelLitres: 0, enabled: true },
    },
    [f for f in (import 'crisis-hq-fixtures.jsonnet').furniture if f.id == 'hq_generator'][0] + {
      id: 'gauntlet_lab_generator',
      power: { device: 'lab_generator', fuelLitres: 0.25, enabled: true },
    },
    { id: 'gauntlet_lab_bulkhead', name: 'Steel bulkhead door', size: [4, 5, 2], color: '#68767b', material: 'steel',
      breach: { minimumStrength: 9, durability: 300 },
      door: { methods: {}, handlingSimSeconds: 1.2 },
      shape: [
        { position: [0, 0, 0.6], size: [4, 5, 0.8] },
        { position: [0.2, 0.2, 0.4], size: [3.6, 0.3, 1.2] },
        { position: [0.2, 4.5, 0.4], size: [3.6, 0.3, 1.2] },
        { position: [0.3, 0.5, 0.4], size: [0.3, 4, 1.2] },
        { position: [3.4, 0.5, 0.4], size: [0.3, 4, 1.2] },
        { position: [2.6, 2, 0.2], size: [0.7, 0.7, 0.3] },
        // Its panel lies inside the slab, so the strap hinges on its hinge edge are part of the shape.
        { position: [0, 0.8, 0.3], size: [0.8, 0.3, 0.3], color: '#3f474b' },
        { position: [0, 3.9, 0.3], size: [0.8, 0.3, 0.3], color: '#3f474b' },
        { position: [0, 0.8, 1.4], size: [0.8, 0.3, 0.3], color: '#3f474b' },
        { position: [0, 3.9, 1.4], size: [0.8, 0.3, 0.3], color: '#3f474b' },
      ] },
    { id: 'gauntlet_lab_dead_lift', name: 'Freight lift', power: { device: 'lab_machine', fuelLitres: 0, enabled: false }, size: [4, 5, 2], color: '#62696c', shape: [
      { position: [0, 0, 0], size: [4, 0.3, 2] }, { position: [0, 0, 0], size: [0.3, 5, 2] },
      { position: [3.7, 0, 0], size: [0.3, 5, 2] }, { position: [0, 4.7, 0], size: [4, 0.3, 2] },
      { position: [1.8, 0, 0], size: [0.4, 5, 0.3] },
    ] },
    { id: 'gauntlet_lab_fixture', name: 'Strip light', power: { device: 'lab_light', fuelLitres: 0, enabled: true, light: { color: '#d9eee8', intensity: 60, radius: 8 } }, size: [2, 1, 1], color: '#a5b8ba', solid: false,
      shape: [{ position: [0, 0.7, 0], size: [2, 0.3, 1] }] },
    { id: 'gauntlet_lab_fixture_broken', name: 'Broken strip light', power: { device: 'lab_light', fuelLitres: 0, enabled: false, light: { color: '#d9eee8', intensity: 60, radius: 8 } }, size: [2, 1, 1], color: '#555c61', solid: false,
      shape: [{ position: [0, 0.7, 0], size: [2, 0.3, 1] }, { position: [0.2, 0, 0.3], size: [0.2, 0.7, 0.2] }] },
    { id: 'gauntlet_look_archive', name: 'Prototype archive shelves', size: [4, 5, 2], color: '#a0a6a0', shape: cabinetShape + [{ position: [0.3, 2.3, 0], size: [3.4, 0.3, 2] }] },
    { id: 'gauntlet_look_cold_store', name: 'Prototype cold specimen bank', power: { device: 'lab_machine', fuelLitres: 0, enabled: true }, size: [4, 5, 2], color: '#90b0b5', shape: [{ position: [0, 0, 0], size: [4, 5, 2] }] },
    { id: 'gauntlet_look_exam', name: 'Prototype examination slab', size: [4, 2, 2], color: '#c7cfc7', shape: [{ position: [0, 1.5, 0], size: [4, 0.5, 2] }, { position: [0.5, 0, 0.5], size: [3, 1.5, 1] }] },
    { id: 'gauntlet_look_pump', name: 'Prototype pressure plant', power: { device: 'lab_machine', fuelLitres: 0, enabled: true }, size: [4, 4, 3], color: '#738981', shape: [{ position: [0, 0, 0], size: [4, 0.4, 3] }, { position: [0.3, 0.4, 0.3], size: [1.2, 3.6, 2.4] }, { position: [2.5, 0.4, 0.3], size: [1.2, 3.6, 2.4] }] },
    { id: 'gauntlet_look_culture', name: 'Prototype culture apparatus', power: { device: 'lab_machine', fuelLitres: 0, enabled: true }, size: [4, 4, 2], color: '#91a978', shape: [{ position: [0, 0, 0], size: [4, 0.4, 2] }, { position: [0.2, 0.4, 0.2], size: [0.6, 3.6, 1.6] }, { position: [1.7, 0.4, 0.2], size: [0.6, 3.6, 1.6] }, { position: [3.2, 0.4, 0.2], size: [0.6, 3.6, 1.6] }] },
  ],
  mapPieces: equipment.mapPieces + threat.mapPieces + [level.stair] + entry.mapPieces + administration.mapPieces + research.mapPieces + special.mapPieces,
  mapAssemblies: entry.mapAssemblies + administration.mapAssemblies + research.mapAssemblies + special.mapAssemblies + [
    {
      id: 'gauntlet_lab', size: [$.width, 40, $.depth], lootContext: context,
      slots: [
        slot('entry', 'assembly', 'gauntlet_lab_level_entry', [0, 32, 0], entry.size),
        slot('administration', 'assembly', 'gauntlet_lab_level_administration', [0, 24, 0], administration.size),
        slot('research', 'assembly', 'gauntlet_lab_level_research', [0, 16, 0], research.size),
        slot('special', 'assembly', 'gauntlet_lab_level_special', [0, 0, 0], special.size),
        slot('entry_stair', 'piece', level.stair.id, entry.stairAt, level.stair.size),
        slot('entry_shaft', 'piece', descents.shaft.id, [entry.shaft.ladder[0] - 1, entry.shaft.ladder[1], entry.shaft.ladder[2]], [3, 8, 2]),
        slot('administration_stair', 'piece', level.stair.id, administration.stairAt, level.stair.size),
        slot('administration_shaft', 'piece', descents.shaft.id, [administration.shaft.ladder[0] - 1, administration.shaft.ladder[1], administration.shaft.ladder[2]], [3, 8, 2]),
        slot('administration_well', 'piece', administration.well.id, administration.well.at, administration.well.size),
        // The stair is turned, so it rises westward and its foot lands at the east end of the hall below.
        slot('research_stair', 'piece', level.stair.id, research.stairAt, level.stair.size) + { turn: 2 },
        slot('research_shaft', 'piece', descents.shaft.id, [research.shaft.ladder[0] - 1, research.shaft.ladder[1], research.shaft.ladder[2]], [3, 8, 2]),
      ], joins: [], ports: [], anchors: {},
    },
  ],
}
