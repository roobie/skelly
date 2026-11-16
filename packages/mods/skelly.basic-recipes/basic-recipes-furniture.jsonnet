// Ready-to-use boards are taken out, not taken apart (`packages/deadvox/SLICE-5.md`, "Bulk stock").
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local shape = import 'tools/jsonnet/lib/furniture-shape.libsonnet';
// A stock pile is judged by its height in the world, so capacity follows plank thickness up to one block
// (`packages/deadvox/SLICE-5.md`, "Bulk stock"). The plank model carries its thickness in a glb, not in
// content, so `plankThickness` is the content value that matches the model's drawn board.
local blockHeight = 1;
local bearerHeight = 0.14;
local plankThickness = 0.09;
local planksPerLayer = 4;
local layers = std.floor((blockHeight - bearerHeight) / plankThickness);
local fullCount = layers * planksPerLayer;
local layerY = function(layer) bearerHeight + layer * plankThickness;
local boardLayer = function(layer) [
  { position: [0.05 + 0.5 * board, layerY(layer), 0.1], size: [0.44, plankThickness, 3.8] }
  for board in std.range(0, planksPerLayer - 1)
];
local boardLayers = function(count) std.flattenArrays([boardLayer(layer) for layer in std.range(0, count - 1)]);
breach.breaking(shape.colliding({
  furniture: [
    {
      local fullShape = self.shape,
      id: 'board_stack',
      name: 'Board stack',
      size: [2, 1, 4],
      color: '#a0763f',
      shape: [
        // Bearers keep the lowest boards off the ground.
        { position: [0.1, 0, 0.15], size: [0.3, 0.14, 3.7], color: '#6a4e33' },
        { position: [1.6, 0, 0.15], size: [0.3, 0.14, 3.7], color: '#6a4e33' },
      ] + boardLayers(layers),
      container: { stockpile: true, accepts: ['wooden_plank'], maxCount: fullCount, pockets: [{ layout: 'pile', handlingSimSeconds: 1.2 }] },
      stockAppearance: {
        fullCount: fullCount,
        // One step per layer: the first board of a layer shows that layer, so the pile grows across the full height.
        steps: [{ from: 0, shape: fullShape[:2] }] + [
          { from: (layer - 1) / layers + 0.001, shape: fullShape[:2 + layer * planksPerLayer] }
          for layer in std.range(1, layers)
        ],
      },
    },
  ],
}))
