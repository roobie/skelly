// A thermal plant's turbo-generator module and its spares (`packages/deadvox/docs/holdout.md`, "Supplies and
// progression"). The module draws on the plant's heat source, so it burns no fuel of its own.
local shape = import 'tools/jsonnet/lib/furniture-shape.libsonnet';
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local itemPolicy = import 'tools/jsonnet/lib/item-policy.libsonnet';
local plant = import 'packages/mods/skelly.electric-power/plant-instruments.libsonnet';
local box(position, size, color=null) = { position: position, size: size } + (if color == null then {} else { color: color });
local socket = '#ad8e53';

// Every slot, its part, its service and where it sits on the model. The failure slots start worn or empty; the rest
// start well inside their requirement, so the authored failures are the only ones a world starts with. Each socket
// is shaped for its part, on the face of the module that part serves, with its drop flag beside it.
local slots = [
  {
    id: 'brushes',
    name: 'Brush socket',
    // Twin brush wells on the exciter's face.
    anchor: {
      position: [0.4, 1.95, 0.3],
      pickSize: [0.4, 0.8, 0.2],
      socketShape: [box([0.72, 2.5, 0.74], [0.12, 0.26, 0.06], socket), box([0.96, 2.5, 0.74], [0.12, 0.26, 0.06], socket)],
      flagMount: { position: [0, -0.25, 0] },
    },
    part: {
      id: 'exciter_brush_set', name: 'Exciter brush set', size: [1, 2], weight: 300,
      description: 'Carbon brushes in sprung holders. Worn ones no longer reach the commutator.',
    },
    initial: [0.6, 1],
    failed: [0.05, 0.25],
    minimum: 0.35,
    service: { timeGameMinutes: 20, qualities: { screwing: 1 } },
  },
  {
    id: 'governor',
    name: 'Governor socket',
    // A long linkage seat along the top of the turbine casing.
    anchor: {
      position: [2.25, 1.45, -0.25],
      pickSize: [1.0, 0.75, 0.2],
      socketShape: [box([2.3, 1.9, 0.19], [0.9, 0.1, 0.06], socket)],
      flagMount: { position: [0.3, -0.3, 0] },
    },
    part: {
      id: 'governor_linkage', name: 'Governor linkage', size: [2, 3], weight: 2500,
      description: 'Rods and a spring between the flyball governor and the steam valve. It holds the turbine at speed.',
    },
    initial: [0.6, 1],
    failed: [0.05, 0.25],
    minimum: 0.35,
    service: { timeGameMinutes: 30, qualities: { wrenching: 1 }, skills: { mechanics: 1 } },
  },
  // A blown field fuse is pulled and thrown away, so its failure is an empty holder; a cartridge swaps by hand.
  {
    id: 'fuse',
    name: 'Field-fuse socket',
    // Opposed fuse clips low on the turbine casing.
    anchor: {
      position: [1.9, 0.5, -0.25],
      pickSize: [0.5, 0.8, 0.2],
      socketShape: [box([2.22, 1.05, 0.19], [0.05, 0.2, 0.06], socket), box([2.53, 1.05, 0.19], [0.05, 0.2, 0.06], socket)],
      flagMount: { position: [0, -0.25, 0] },
    },
    part: {
      id: 'field_fuse', name: 'Field fuse', size: [1, 1], weight: 150,
      description: 'A cartridge fuse for the field winding. It pushes into its clips by hand.',
    },
    initial: [0.8, 1],
    // Seating a cartridge squarely in both clips still takes a moment's care.
    service: { timeGameMinutes: 10 / 60 },
  },
  // Needed but never an authored failure: it fails only at ruin.
  {
    id: 'oiler',
    name: 'Oiler socket',
    // A tall oiler neck over the main bearing, its flag on the bearing housing below.
    anchor: {
      position: [3.2, 1.25, 0.2],
      pickSize: [0.4, 1.3, 0.4],
      socketShape: [box([3.66, 1.5, 0.66], [0.08, 0.3, 0.08], socket), box([3.59, 1.8, 0.59], [0.22, 0.25, 0.22], socket)],
      flagMount: { position: [0, -0.55, -0.1] },
    },
    part: {
      id: 'bearing_oiler', name: 'Bearing oiler', size: [1, 2], weight: 600,
      description: 'A glass sight-feed oiler that drips oil onto the main bearing.',
    },
    initial: [0.3, 0.9],
    critical: false,
    service: { timeGameMinutes: 10, qualities: { wrenching: 1 } },
  },
];
local critical(slot) = std.get(slot, 'critical', true);
local failure = [slot.id for slot in slots if critical(slot)];

// Each authored failure's spare, from parts that ordinary junk, desks and workshops hold. Any hand with some
// mechanical practice knows them, so no plant can be lost for want of a manual.
local spare(id, timeGameMinutes, skills, qualities, components) = {
  id: 'make_' + id,
  category: 'plant_parts',
  tags: ['electrical'],
  searchTerms: [],
  result: { item: id, count: 1 },
  timeGameMinutes: timeGameMinutes,
  skillUnlock: { skill: 'mechanics', level: 1 },
  skills: skills,
  qualities: qualities,
  components: components,
};
local recipes = [
  // The carbon rods of dry cells make the brushes.
  spare('exciter_brush_set', 20, { mechanics: 0 }, { cutting: 1 }, [
    [{ item: 'aa_battery', count: 2 }],
    [{ item: 'copper_wire', count: 1 }],
    [{ item: 'small_spring', count: 1 }, { item: 'fastener_pack', count: 1 }],
  ]),
  spare('governor_linkage', 30, { mechanics: 1 }, { wrenching: 1 }, [
    [{ item: 'scrap_metal', count: 2 }, { item: 'sheet_metal_small', count: 1 }],
    [{ item: 'small_spring', count: 1 }],
    [{ item: 'fastener_pack', count: 1 }],
  ]),
  spare('field_fuse', 5, { crafting: 0 }, {}, [
    [{ item: 'fuse', count: 2 }],
    [{ item: 'copper_wire', count: 1 }, { item: 'electrical_tape', count: 1 }],
  ]),
];

shape.colliding(breach.breaking(itemPolicy.itemPack({
  items: [slot.part + { category: 'material' } for slot in slots],
  recipeCategories: [{ id: 'plant_parts', label: 'Plant parts', parent: 'supplies', order: 50 }],
  recipes: recipes,
  powerDevices: [{ id: 'turbo_generator', kind: 'inexhaustible', priority: 0, outputWatts: 25000 }],
  partBlueprints: [{
    id: 'turbo_generator',
    slots: [
      {
        id: slot.id,
        name: slot.name,
        accepts: [slot.part.id],
        initial: { item: slot.part.id, condition: slot.initial },
        service: slot.service,
      } + (if std.objectHas(slot, 'failed') then { failed: { item: slot.part.id, condition: slot.failed } } else {})
      for slot in slots
    ],
    failure: { among: failure },
  }],
  furniture: [{
    id: 'turbo_generator',
    name: 'Turbo-generator',
    size: [4, 3, 2],
    color: '#4f6358',
    material: 'steel',
    // Plant machinery stands up to a beating, unlike household furniture.
    breach: breach.sturdy,
    shape: [
      box([0, 0, 0], [4, 0.3, 2], '#3a3d3b'),
      box([0.2, 0.3, 0.3], [1.6, 1.6, 1.4]),
      box([0.7, 1.9, 0.8], [0.4, 1.1, 0.4], '#b08d57'),
      box([2, 0.3, 0.25], [1.5, 1.9, 1.5], '#5d6b73'),
      box([3.5, 0.6, 0.6], [0.4, 0.9, 0.8], '#8a8f86'),
    ],
    takeApart: { parts: 'turbo_generator' },
    slotAnchors: [{ slot: slot.id } + slot.anchor for slot in slots],
    power: {
      device: 'turbo_generator', fuelLitres: 0, enabled: true,
      // The panel covers the generator's face; each flag stands on its slot's anchor.
      instruments: plant.switched(plant.look([0, 0.08, 0.29], [plant.flag(slot.id) for slot in slots])),
      requires: [
        { slot: slot.id, parts: [slot.part.id] }
        + (if std.objectHas(slot, 'minimum') then { minimum: slot.minimum } else {})
        + (if critical(slot) then { critical: true } else {})
        for slot in slots
      ],
    },
  }],
})))
