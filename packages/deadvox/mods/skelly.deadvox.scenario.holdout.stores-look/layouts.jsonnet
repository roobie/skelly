// The stores look's fixture site: Holdout's plant stores, the works stores answer, beside the hand-drawn stores it
// replaced, both doors the same way. The baseline is turned so its door, drawn on the south, faces like the answer's.
// The player starts just inside the answer's door, looking down the aisle under the two steel joists that carry its
// slab; the baseline is a step back out of the door and to the east.
local plant = import '../skelly.deadvox.scenario.holdout/holdout-plant.libsonnet';
local supplies = plant.supplies;
local room = ['########', '#SS..aa#', '#......#', '#cc....#', '#cc....#', '###DD###'];
local top = ['########', '#SS..aa#', '#......#', '#......#', '#......#', '###DD###'];
local baseline = plant.hall(
  'holdout_plant_stores_hand_drawn',
  [8, 6, 6],
  {
    S: supplies.stocked.S + { facing: 's' },
    a: supplies.stocked.a + { facing: 's' },
    c: supplies.stocked.c,
  },
  ['########', '#kkkkkk#', '#kkkkkk#', '#kkkkkk#', '#kkkkkk#', '########'],
  [room, room, top],
  top,
  [4, 1, 4],
);
{
  templates: [baseline],
  layouts: [{
    id: 'holdoutStoresLook',
    demo: true,
    lootContext: plant.stores.lootContext,
    bounds: { x0: -16, z0: -12, x1: 12, z1: 12 },
    ground: 21,
    terrain: [],
    tracks: [],
    buildings: [
      { template: plant.stores.id, position: [-8, 21, 0], rotation: 0 },
      { template: baseline.id, position: [2, 21, 0], rotation: 180 },
    ],
    player: { position: [-5, 21.5, 2], bearing: 180 },
    actors: [],
    woodlands: [],
  }],
}
