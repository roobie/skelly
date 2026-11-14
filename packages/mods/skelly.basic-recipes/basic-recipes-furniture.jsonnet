// The board stack lives with the plank it yields: each pack owns what it names, so the theme pack that owns
// `wooden_plank` owns the boards stacked for building (`packages/deadvox/docs/content.md`, "Core-pack integrity").
// Bulk stock is looted by taking the piece apart, which costs far less time per unit than salvaging built work
// (`packages/deadvox/SLICE-5.md`, "Bulk stock"); a take-apart yield is skill-rolled only, so no tool changes it.
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
local shape = import 'tools/jsonnet/lib/furniture-shape.libsonnet';
local recovered = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
local boardLayer = function(y) [
  { position: [0.05, y, 0.1], size: [0.44, 0.09, 3.8] },
  { position: [0.55, y, 0.1], size: [0.44, 0.09, 3.8] },
  { position: [1.05, y, 0.1], size: [0.44, 0.09, 3.8] },
  { position: [1.55, y, 0.1], size: [0.44, 0.09, 3.8] },
];
breach.breaking(shape.colliding({
  furniture: [
    {
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
      takeApart: {
        yield: {
          timeGameMinutes: 12,
          skill: 'crafting',
          yields: [{ item: 'wooden_plank', count: 8, fractions: recovered, rounding: 'floor' }],
        },
      },
    },
  ],
}))
