local actors = (import '../../../mods/skelly.deadvox.residual/enemies.jsonnet').actors;
local factors = { damage: 0.5, speed: 0.5, detection: 0.5, health: 0.5 };

{
  id: 'beginner',
  version: '1',
  tier: 'product',
  product: false,
  dependencies: ['skelly.deadvox.residual'],
  overrides: [{ pack: 'skelly.deadvox.residual', entry: 'actors:' + zombie.id } for zombie in actors],
  actors: [
    zombie + {
      attack+: {
        moves: [move + { damage: move.damage * factors.damage } for move in zombie.attack.moves],
      },
      speed+: {
        wanderMetresPerSimSecond: zombie.speed.wanderMetresPerSimSecond * factors.speed,
        chaseMetresPerSimSecond: zombie.speed.chaseMetresPerSimSecond * factors.speed,
      },
      agent+: {
        sight: zombie.agent.sight * factors.detection,
        nightSight: zombie.agent.nightSight * factors.detection,
        hearing: zombie.agent.hearing * factors.detection,
        lightSightScale: (if std.objectHas(zombie.agent, 'lightSightScale') then zombie.agent.lightSightScale else 1) * factors.detection,
      },
      regions: { [region]: zombie.regions[region] * factors.health for region in std.objectFields(zombie.regions) },
    }
    for zombie in actors
  ],
}
