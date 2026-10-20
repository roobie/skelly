{
  mapStyles: [
    {
      id: 'concrete_townhouse',
      bindings: {
        facade: { role: 'shell', block: 'concrete' },
        floor: { role: 'interior_floor', block: 'planks' },
        roofing_sheet: { role: 'interior_floor', block: 'galvanized' },
        roofing_slab: { role: 'interior_floor', block: 'concrete' },
        footing: { role: 'support', block: 'concrete' },
        cap: { role: 'trim', block: 'concrete' },
        tall_grass: { role: 'trim', block: 'tall_grass' },
        opening: { role: 'opening', block: 'air' },
      },
    },
    {
      id: 'brick_townhouse',
      bindings: {
        facade: { role: 'shell', block: 'brick' },
        floor: { role: 'interior_floor', block: 'planks' },
        roofing_sheet: { role: 'interior_floor', block: 'galvanized' },
        roofing_slab: { role: 'interior_floor', block: 'concrete' },
        footing: { role: 'support', block: 'concrete' },
        cap: { role: 'trim', block: 'brick' },
        tall_grass: { role: 'trim', block: 'tall_grass' },
        opening: { role: 'opening', block: 'air' },
      },
    },
  ],
}
