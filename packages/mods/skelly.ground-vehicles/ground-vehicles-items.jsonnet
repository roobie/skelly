(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  items: [
    {
      id: 'scissor_jack',
      name: 'Scissor jack',
      category: 'tool',
      model: 'scissor_jack',
      size: [3, 2],
      description: 'A light screw jack from a car boot. It raises little, slowly.',
      tool: { qualities: { jacking: 1 } },
    },
    {
      id: 'bottle_jack',
      name: 'Bottle jack',
      category: 'tool',
      model: 'bottle_jack',
      size: [2, 3],
      description: 'A hydraulic jack with a short, strong ram.',
      tool: { qualities: { jacking: 2 } },
    },
    {
      id: 'engine_hoist',
      name: 'Engine hoist',
      category: 'tool',
      model: 'engine_hoist',
      size: [4, 6],
      description: 'A wheeled floor crane with a hydraulic boom. It takes two hands and a lot of room.',
      tool: { qualities: { jacking: 3 } },
    },
  ],
})
