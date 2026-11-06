// Items and blueprint for the riot van; its panels fit at the origin (`packages/thing-authoring-tool/vehicles/van-body.libsonnet`).
local kit = import '../vehicle-kit.libsonnet';
local van = import 'packages/thing-authoring-tool/vehicles/van-body.libsonnet';
local s = import 'packages/thing-authoring-tool/vehicles/riot_van.spec.libsonnet';
local part(suffix, name, capabilities) = kit.part('riot_van_' + suffix, 'Riot van ' + name, kit.pileSize, capabilities);
{
  items: van.items(kit, 'riot_van', 'Riot van', s) + [
    part('windscreen_grille', 'windscreen grille', ['protection', 'glazing']),
    part('door_grille', 'door grille', ['protection', 'glazing']),
    part('side_door_grille', 'side door grille', ['protection', 'glazing']),
    part('rear_grille', 'rear window grille', ['protection', 'glazing']),
    part('side_grilles', 'side window grilles', ['protection', 'glazing']),
    part('markings', 'markings', []),
    part('side_door_markings', 'side door markings', []),
    part('door_markings', 'front door markings', []),
    part('rear_markings', 'rear door markings', []),
    part('push_bar', 'push bar', ['protection']),
  ],
  blueprint: {
    id: 'riot_van',
    name: 'Riot van',
    fittings: van.fittings(kit, 'riot_van', s) + [
      kit.fitting('windscreen_grille', 'riot_van_windscreen_grille', kit.origin, ['windscreen']),
      kit.fitting('side_door_grille', 'riot_van_side_door_grille', kit.origin, ['side_door']),
      kit.fitting('side_grilles', 'riot_van_side_grilles', kit.origin, ['shell']),
      kit.fitting('markings', 'riot_van_markings', kit.origin, ['shell']),
      kit.fitting('side_door_markings', 'riot_van_side_door_markings', kit.origin, ['side_door']),
      kit.fitting('light_bar', 'light_bar_blue', [-0.325, s.roof, 0], ['shell']),
      kit.fitting('push_bar', 'riot_van_push_bar', kit.origin, ['front_bumper']),
      kit.fitting('crew_bench', 'bench_seat_3', [-0.9, s.floor, 0], ['floor']),
      kit.fitting('rear_bench', 'bench_seat_3', [-2.5, s.floor, 0], ['floor']),
    ]
    + kit.pair('door_grille', 'riot_van_door_grille', kit.origin, kit.on(paired=['front_door']))
    + kit.pair('rear_grille', 'riot_van_rear_grille', kit.origin, kit.on(paired=['rear_door']))
    + kit.pair('door_markings', 'riot_van_door_markings', kit.origin, kit.on(paired=['front_door']))
    + kit.pair('rear_markings', 'riot_van_rear_markings', kit.origin, kit.on(paired=['rear_door'])),
  },
}
