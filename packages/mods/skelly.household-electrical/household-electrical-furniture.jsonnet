local shape = import 'tools/jsonnet/lib/furniture-shape.libsonnet';
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
breach.breaking(shape.colliding({
  furniture: [
    {
      id: 'fridge',
      power: { device: 'house_fridge', fuelLitres: 0, enabled: true },
      name: 'Fridge',
      size: [2, 4, 2],
      color: '#d8dcd8',
      appearance: { kind: 'fridge', surface: 'painted-metal' },
      upright: true,
      container: {
        pockets: [
          {
            grid: [5, 14],
            handlingSimSeconds: 1.0,
          },
        ],
      },
    },
    {
      id: 'electric_lamp', name: 'Electric lamp', size: [1, 3, 1], color: '#dbca99', material: 'steel',
      power: { device: 'lab_light', fuelLitres: 0, enabled: true,
        // From the shade, the piece's top cell.
        light: { color: '#ffdea5', intensity: 15.9, radius: 8, offset: [0, 2, 0] } },
    },
    {
      id: 'battery_charger',
      name: 'Battery charger',
      size: [1, 1, 1],
      color: '#3a3c3f',
      material: 'steel',
      // Drawn at its real size, a hand's width of plastic on the floor, so it fills too little of its block to stop
      // anyone and stays walkable like a rug.
      solid: false,
      shape: [
        { position: [0.36, 0, 0.41], size: [0.28, 0.045, 0.18] },
        { position: [0.4, 0.045, 0.46], size: [0.14, 0.005, 0.06], color: '#141516' },
        { position: [0.4, 0.05, 0.475], size: [0.008, 0.02, 0.03], color: '#c8b273' },
        { position: [0.532, 0.05, 0.475], size: [0.008, 0.02, 0.03], color: '#c8b273' },
        { position: [0.36, 0.045, 0.41], size: [0.28, 0.03, 0.05] },
        { position: [0.36, 0.045, 0.52], size: [0.28, 0.03, 0.07] },
        { position: [0.36, 0.045, 0.46], size: [0.04, 0.03, 0.06] },
        { position: [0.54, 0.045, 0.46], size: [0.1, 0.03, 0.06] },
        { position: [0.565, 0.075, 0.475], size: [0.05, 0.002, 0.03], color: '#c9c6bc' },
        { position: [0.6, 0.075, 0.545], size: [0.02, 0.006, 0.02], color: '#6a2a22' },
        { position: [0.49, 0, 0], size: [0.02, 0.015, 0.41], color: '#1b1b1b' },
      ],
      container: { pockets: [{ grid: [1, 1], handlingSimSeconds: 1 }] },
      power: { device: 'portable_battery_charger', fuelLitres: 0, enabled: true },
      charger: { batteries: ['rechargeable_aa_battery'], pocket: 0, efficiency: 0.75 },
    },
  ],
}))
