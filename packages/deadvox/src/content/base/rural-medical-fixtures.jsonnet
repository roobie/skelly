local shape = import 'furniture-shape.libsonnet';
local breach = import 'furniture-breach.libsonnet';
local box(position, size) = { position: position, size: size };
local pocket = { pockets: [{ grid: [6, 5], handlingSimSeconds: 1.2 }] };
breach.breaking(shape.colliding({
  furniture: [
    {
      id: 'medical_folding_screen', name: 'Folding screen', size: [1, 2, 1], color: '#d8d2bd',
      shape: [box([0.1, 0, 0.1], [0.8, 1.8, 0.1]), box([0.1, 0, 0.45], [0.8, 1.8, 0.1])],
    },
    {
      id: 'medical_examination_couch', name: 'Examination couch', size: [2, 1, 4], color: '#71828a',
      shape: [box([0.1, 0.35, 0.2], [1.8, 0.2, 3.6]), box([0.15, 0, 0.25], [0.12, 0.35, 0.12]), box([1.73, 0, 0.25], [0.12, 0.35, 0.12]), box([0.15, 0, 3.63], [0.12, 0.35, 0.12]), box([1.73, 0, 3.63], [0.12, 0.35, 0.12])],
    },
    {
      id: 'medical_steam_sterilizer', name: 'Steam sterilizer', size: [1, 2, 1], color: '#7f8987',
      shape: [box([0.1, 0, 0.1], [0.8, 1.4, 0.8]), box([0.2, 1.4, 0.2], [0.6, 0.2, 0.6])],
    },
    {
      id: 'medical_card_file', name: 'Card-file cabinet', size: [1, 2, 1], color: '#89918e',
      container: pocket, appearance: { kind: 'drawers', surface: 'painted-metal' },
    },
    {
      id: 'medical_bike_rack', name: 'Bike rack', size: [4, 1, 2], color: '#66706c', solid: false,
      shape: [box([0.25, 0, 0.2], [0.12, 0.8, 1.6]), box([1.15, 0, 0.2], [0.12, 0.8, 1.6]), box([2.05, 0, 0.2], [0.12, 0.8, 1.6]), box([2.95, 0, 0.2], [0.12, 0.8, 1.6])],
    },
    {
      id: 'medical_bin_enclosure', name: 'Bin enclosure', size: [2, 2, 2], color: '#657069',
      shape: [box([0, 0, 0], [2, 1.6, 0.15]), box([0, 0, 0], [0.15, 1.6, 2]), box([1.85, 0, 0], [0.15, 1.6, 2])],
    },
  ],
}))
