// Street wrecks are the workshop's stripped car, each placement a procedural variant: a body colour,
// a dirt level and a set of stripped parts, each drawn from the pools below by the world seed.
local decals = import 'decals.libsonnet';
local vehicles = import 'vehicles.libsonnet';
local bodies = ['#b3a07c', '#6f7f8f', '#8c3b32', '#4f6b4a', '#c8c3b4'];
local dirts = [0.15, 0.5, 0.85];
local doors = ['door-front-near', 'door-front-far', 'door-rear-near', 'door-rear-far'];
local wheels = ['wheel-front-near', 'wheel-front-far', 'wheel-rear-near', 'wheel-rear-far'];
local frontClip = ['bonnet', 'front-wing-near', 'front-wing-far', 'headlight-near', 'headlight-far', 'front-panel'];
local bumpers = ['front-bumper', 'rear-bumper'];
local tailgate = ['tailgate-upper', 'tailgate-lower'];
local strips = [
  { id: 'intact', name: 'Car', removed: [] },
  { id: 'doors', name: 'Stripped car', removed: doors },
  { id: 'wheels', name: 'Stripped car', removed: wheels },
  { id: 'front', name: 'Stripped car', removed: frontClip + bumpers },
  { id: 'rear', name: 'Stripped car', removed: tailgate + bumpers + ['wheel-rear-near', 'wheel-rear-far'] },
  { id: 'shell', name: 'Stripped car', removed: doors + wheels + frontClip + bumpers + tailgate + ['spare-wheel'] },
];
local variants = [
  {
    id: 'gauntlet_car_wreck_%d_%d_%s' % [b, d, strip.id],
    name: strip.name,
    vehicle: vehicles { blueprint: 'rover', body: bodies[b], dirt: dirts[d], removed: strip.removed },
  }
  for b in std.range(0, std.length(bodies) - 1)
  for d in std.range(0, std.length(dirts) - 1)
  for strip in strips
];
{
  furniture: [
    { id: variant.id, name: variant.name, size: [4, 4, 9], color: '#5b605c', vehicle: variant.vehicle }
    for variant in variants
  ],
  templates: [{
    id: variant.id, size: [4, 5, 9],
    lootContext: { usage: [], tier: 'Tier1' },
    decals: [decals.scorch([3.6, 1, 3])],
    palette: { '=': { ground: true }, W: { furniture: variant.id, facing: 'n' } },
    layers: [
      ['====', '====', '====', '====', '====', '====', '====', '====', '===='],
      ['WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW'],
      ['WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW'],
      ['WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW'],
      ['WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW', 'WWWW'],
    ],
  } for variant in variants],
  mapPools: [{
    id: 'gauntlet_street_cars',
    choices: [{ ref: { kind: 'template', id: variant.id }, weight: 1 } for variant in variants],
  }],
}
