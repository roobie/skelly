local shape = import 'tools/jsonnet/lib/furniture-shape.libsonnet';
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
breach.breaking(shape.colliding({
  furniture: [
    {
      id: 'fuel_generator', name: 'Generator', size: [2, 2, 2], color: '#79694b', material: 'steel',
      power: { device: 'fuel_generator', fuelLitres: 20, enabled: true },
    },
    {
      id: 'storage_battery', name: 'Storage battery', size: [1, 2, 1], color: '#343a45', material: 'steel',
      power: { device: 'storage_battery', fuelLitres: 0, enabled: true },
    },
    {
      id: 'solar_panel', name: 'Solar panel', size: [4, 1, 2], color: '#233d62', material: 'steel',
      power: { device: 'solar_panel', fuelLitres: 0, enabled: true },
    },
    {
      id: 'main_breaker', name: 'Main breaker', size: [1, 2, 1], color: '#777b80', material: 'steel',
      power: { device: 'main_breaker', fuelLitres: 0, enabled: true },
    },
  ],
}))
