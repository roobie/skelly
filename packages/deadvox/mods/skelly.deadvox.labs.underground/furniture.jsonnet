local shape = import 'tools/jsonnet/lib/furniture-shape.libsonnet';
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
breach.breaking(shape.colliding({
  furniture: [
    { id: 'lab_fixture', name: 'Strip light', power: { device: 'lab_light', fuelLitres: 0, enabled: true, light: { color: '#d9eee8', intensity: 60, radius: 8, offset: [0.5, 0.15, 0] } }, size: [2, 1, 1], color: '#a5b8ba', solid: false,
      shape: [{ position: [0, 0.7, 0], size: [2, 0.3, 1] }] },
  ],
}))
