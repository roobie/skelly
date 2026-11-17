(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  wearSlots: [{
    id: 'finger',
    label: 'Finger',
    attachmentFrames: ['right_hand'],
    inventory: { visibility: 'occupied', order: -1 },
    selfView: 'frame',
  }],
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
  ],
})
