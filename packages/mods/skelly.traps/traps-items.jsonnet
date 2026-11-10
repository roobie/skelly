(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  items: [
    {
      id: 'bear_trap',
      model: 'bear_trap',
      name: 'Bear trap',
      category: 'tool',
      size: [5, 5],
      description: 'Steel jaws on a spring. It shuts on whatever steps in it.',
      trap: {
        setSimSeconds: 4,
        disarmSimSeconds: 6,
        holdSimSeconds: 20,
        playerInjury: { region: 'leftLeg', damage: 25, kind: 'pierce' },
        actorLegDamage: 60,
      },
    },
  ],
})
