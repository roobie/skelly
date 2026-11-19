// A thermal plant's turbo-generator module and its spares (`packages/deadvox/docs/holdout.md`, "Supplies and
// progression"). The module draws on the plant's heat source, so it burns no fuel of its own.
local shape = import 'tools/jsonnet/lib/furniture-shape.libsonnet';
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local itemPolicy = import 'tools/jsonnet/lib/item-policy.libsonnet';
local box(position, size, color=null) = { position: position, size: size } + (if color == null then {} else { color: color });

// Every slot, its part and its service. The failure slots start worn or empty; the rest start well inside their
// requirement, so the authored failures are the only ones a world starts with.
local slots = [
  {
    id: 'brushes',
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
    part: {
      id: 'field_fuse', name: 'Field fuse', size: [1, 1], weight: 150,
      description: 'A cartridge fuse for the field winding. It pushes into its clips by hand.',
    },
    initial: [0.8, 1],
    service: { timeGameMinutes: 0 },
  },
  // Needed but never an authored failure: it fails only at ruin.
  {
    id: 'oiler',
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
    power: {
      device: 'turbo_generator', fuelLitres: 0, enabled: true,
      requires: [
        { slot: slot.id, parts: [slot.part.id] }
        + (if std.objectHas(slot, 'minimum') then { minimum: slot.minimum } else {})
        + (if critical(slot) then { critical: true } else {})
        for slot in slots
      ],
    },
  }],
})))
