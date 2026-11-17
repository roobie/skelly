(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  items: [
    {
      id: 'strength_ring',
      name: 'Strength ring',
      category: 'clothing',
      size: [1, 1],
      model: 'storage_ring',
      description: 'While worn, it makes its wearer stronger.',
      wearable: { slot: 'finger', encumbrance: 0 },
      modifiers: [{ attribute: 'strength', multiply: 1.5, while: 'worn' }],
    },
    {
      id: 'crystal_wand',
      name: 'Crystal wand',
      category: 'tool',
      size: [1, 2],
      model: 'crystal_socket_wand',
      description: 'Held by one who knows the spell, it casts magic missiles.',
      casting: { ability: (import 'magic-missile.libsonnet').ability.id },
    },
  ],
})
