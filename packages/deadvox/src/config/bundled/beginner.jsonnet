local zombies = (import '../../content/base/zombies.jsonnet').zombies;
local factors = { damage: 0.5, speed: 0.5, detection: 0.5, health: 0.5 };

{
  id: 'beginner',
  zombies: [
    zombie + {
      attack+: {
        moves: [move + { damage: move.damage * factors.damage } for move in zombie.attack.moves],
      },
      speed+: {
        wanderMetresPerSimSecond: zombie.speed.wanderMetresPerSimSecond * factors.speed,
        chaseMetresPerSimSecond: zombie.speed.chaseMetresPerSimSecond * factors.speed,
      },
      sight: zombie.sight * factors.detection,
      nightSight: zombie.nightSight * factors.detection,
      hearing: zombie.hearing * factors.detection,
      lightSightScale: (if std.objectHas(zombie, 'lightSightScale') then zombie.lightSightScale else 1) * factors.detection,
      regions: { [region]: zombie.regions[region] * factors.health for region in std.objectFields(zombie.regions) },
    }
    for zombie in zombies
  ],
}
