// Ready-to-use boards are taken out, not taken apart (`packages/deadvox/SLICE-5.md`, "Bulk stock").
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local shape = import 'tools/jsonnet/lib/furniture-shape.libsonnet';
local boardLayer = function(y) [
  { position: [0.05, y, 0.1], size: [0.44, 0.09, 3.8] },
  { position: [0.55, y, 0.1], size: [0.44, 0.09, 3.8] },
  { position: [1.05, y, 0.1], size: [0.44, 0.09, 3.8] },
  { position: [1.55, y, 0.1], size: [0.44, 0.09, 3.8] },
];
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
      ] + boardLayer(0.14) + boardLayer(0.23) + [
        // A partly drawn top layer, so the stack reads as boards rather than a solid block.
        { position: [0.3, 0.32, 0.5], size: [0.44, 0.09, 2.6] },
        { position: [1.2, 0.32, 0.9], size: [0.44, 0.09, 2.2] },
      ],
      container: { accepts: ['wooden_plank'], pockets: [{ grid: [8, 8], handlingSimSeconds: 1.2 }] },
      stockAppearance: {
        fullCount: 8,
        steps: [
          { from: 0, shape: fullShape[:2] },
          { from: 0.01, shape: fullShape[:2] + boardLayer(0.14) },
          { from: 0.5, shape: fullShape[:2] + boardLayer(0.14) + boardLayer(0.23) },
          { from: 0.9, shape: fullShape },
        ],
      },
    },
  ],
}))
