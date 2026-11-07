local shape = import 'tools/jsonnet/lib/furniture-shape.libsonnet';
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local plaque(id, name, color, readable) = {
  id: id,
  name: name,
  size: [1, 1, 1],
  color: color,
  mount: 'wall',
  solid: false,
  shape: [{ position: [0, 0, 0.875], size: [1, 1, 0.125] }],
  readable: readable,
};
breach.breaking(shape.colliding({
  furniture: [
    plaque('clinic_sign', 'Clinic direction sign', '#99794c', {
      title: 'Hand-painted sign',
      text: 'Clinic set up south — they took the sick there',
    }),
    plaque('gas_directions_sign', 'Hand-painted direction sign', '#99794c', {
      title: 'Hand-painted sign',
      text: "Dad's cabin is up the ridge, key under the step",
    }),
  ],
}))
