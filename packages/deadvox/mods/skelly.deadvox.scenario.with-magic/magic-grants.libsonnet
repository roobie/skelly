local missile = import 'packages/mods/skelly.magic/magic-missile.libsonnet';
// One set of start rows for the scenario's patch and its look fixtures, so a look casts with the gear a player starts
// with. The wand goes to the dominant hand because no start of the kit fills it.
{
  missileLevels: missile.levels,
  grants(level):: {
    kit: [{ id: 'wand', item: 'crystal_wand', condition: 1, destination: { kind: 'hand', role: 'dominant' } }],
    abilities: [{ ability: missile.ability.id, level: level }],
    pools: [{ pool: missile.ability.cost.pool }],
  },
}
