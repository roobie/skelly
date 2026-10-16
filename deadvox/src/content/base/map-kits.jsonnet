{
  mapStyles: [
    {
      id: 'concrete_townhouse',
      bindings: {
        facade: { role: 'shell', block: 'concrete' },
        floor: { role: 'interior_floor', block: 'planks' },
        footing: { role: 'support', block: 'concrete' },
        cap: { role: 'trim', block: 'concrete' },
        opening: { role: 'opening', block: 'air' },
      },
    },
    {
      id: 'brick_townhouse',
      bindings: {
        facade: { role: 'shell', block: 'brick' },
        floor: { role: 'interior_floor', block: 'planks' },
        footing: { role: 'support', block: 'concrete' },
        cap: { role: 'trim', block: 'brick' },
        opening: { role: 'opening', block: 'air' },
      },
    },
  ],
}
