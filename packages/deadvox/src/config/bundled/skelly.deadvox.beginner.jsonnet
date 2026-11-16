local factors = { damage: 0.5, speed: 0.5, detection: 0.5, health: 0.5 };
// Every pack that ships hostile kinds, so each one is weakened by the same factors.
local packs = {
  'skelly.deadvox.actors': (import '../../../mods/skelly.deadvox.actors/enemies.jsonnet').actors,
  'skelly.bestiary': (import '../../../mods/skelly.bestiary/enemies-bestiary.jsonnet').actors,
};
local owned = [{ pack: pack, zombie: zombie } for pack in std.objectFields(packs) for zombie in packs[pack]];
local weakenedMoves(moves) = [move + { damage: move.damage * factors.damage } for move in moves];

{
  id: 'skelly.deadvox.beginner',
  version: '1',
  tier: 'product',
  product: false,
  dependencies: std.objectFields(packs),
  overrides: [{ pack: row.pack, entry: 'actors:' + row.zombie.id } for row in owned],
  actors: [
    local zombie = row.zombie;
    zombie + {
      attack+: { moves: weakenedMoves(zombie.attack.moves) },
      [if std.objectHas(zombie, 'pounce') then 'pounce']+: { moves: weakenedMoves(zombie.pounce.moves) },
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
    for row in owned
  ],
}
