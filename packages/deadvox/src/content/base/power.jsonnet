{
  powerTuning: [{ id: 'base', tickSimSeconds: 1 }],
  powerDevices: [
    { id: 'lab_generator', kind: 'generator', priority: 0, outputWatts: 20000, burnLitresPerGameHour: 1 },
    { id: 'lab_light', kind: 'consumer', priority: 1, demandWatts: 10 },
    { id: 'lab_machine', kind: 'consumer', priority: 2, demandWatts: 100 },
    { id: 'fuel_generator', kind: 'generator', priority: 0, outputWatts: 1000, burnLitresPerGameHour: 1 },
    {
      id: 'solar_panel', kind: 'solar', priority: 0,
      outputWatts: { night: 0, dawn: 50, day: 250, dusk: 50 },
    },
    {
      id: 'storage_battery', kind: 'battery', priority: 0, capacityWh: 1000,
      chargeEfficiency: 0.9, dischargeEfficiency: 0.9,
    },
    { id: 'electrical_load', kind: 'consumer', priority: 0, demandWatts: 100 },
  ],
}
