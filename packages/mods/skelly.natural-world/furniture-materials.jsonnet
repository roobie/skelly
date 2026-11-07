{
  furnitureMaterials: [
    {
      id: 'wood', drops: { default: 'item_drop_wood' }, blowSound: 'door_bash', methods: ['pry', 'hammer'], broken: { tint: '#d8c9a6', strength: 0.6 },
      damaged: [
        { from: 0.01, tint: '#3a2a1c', strength: 0.2 },
        { from: 0.4, tint: '#3a2a1c', strength: 0.4 },
        { from: 0.75, tint: '#d8c9a6', strength: 0.4 },
      ],
    },
    {
      id: 'steel', drops: { default: 'item_drop_wood' }, blowSound: 'door_bash', methods: ['pry', 'cut', 'hammer'], broken: { tint: '#9a4a28', strength: 0.55 },
      damaged: [
        { from: 0.01, tint: '#2a2a2e', strength: 0.2 },
        { from: 0.4, tint: '#2a2a2e', strength: 0.4 },
        { from: 0.75, tint: '#9a4a28', strength: 0.35 },
      ],
    },
  ],
}
