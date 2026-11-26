local layout = (import '../skelly.deadvox.scenario.test-house/layouts-test-house.jsonnet').layouts[0];
local position = [-12, 20.5, 14];
local blockSize = 0.5;
local origin = [std.floor(value / blockSize) for value in position];
// Each actor is shut in a pocket with no way around, facing the player straight on. A slot two cells wide and two
// tall in each front wall lets the actor see the player at once but is too low for either to pass.
local pockets(slotted) = [
  '..........',
  'tttt......',
  if slotted then 't.........' else 't..t......',
  if slotted then 't.........' else 't..t......',
  'tttt......',
  '..........',
  if slotted then '......m..m' else '......mmmm',
  '......m..m',
  '......m..m',
  '......mmmm',
];
// A timber beam juts from one top cell of the shambler pocket's front wall, so that cell is all that holds it.
local top = pockets(false);
local beamed = [if z == 2 then 't..ttt....' else top[z] for z in std.range(0, std.length(top) - 1)];
local layers = [std.makeArray(10, function(_) 'kkkkkkkkkk'), pockets(false), pockets(true), pockets(true), beamed];
local bruteFront = 6;
{
  // The brute pocket's front wall, in world blocks, for the start to ship damaged.
  bruteFrontCells:: [
    [origin[0] + x, origin[1] + y, origin[2] + bruteFront]
    for x in std.range(6, 9)
    for y in std.range(1, 4)
    if layers[y][bruteFront][x] == 'm'
  ],
  templates: [{
    id: 'test_house_actor_breach',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [10, 5, 10],
    palette: { '.': 'air', k: 'concrete', t: 'plank_wall', m: 'brick' },
    layers: layers,
  }],
  layouts: [layout + {
    id: 'testHouseActorBreachLook',
    buildings: layout.buildings + [{ template: 'test_house_actor_breach', position: position, rotation: 0 }],
    actors: [
      { type: 'shambler', position: [-11, 21, 15.5], chance: 1 },
      { type: 'brute_shambler', position: [-8, 21, 18], chance: 1 },
    ],
    player: { position: [-8, 21, 15.5], bearing: 180 },
    showroom: layout.showroom + { slots: [] },
  }],
}
