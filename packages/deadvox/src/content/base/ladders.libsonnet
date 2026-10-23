// Ladders and roof hatches (`DESIGN.md`, "Ladders and hatches"). A ladder is stacked one piece per layer, so one
// piece serves any height. A ladder up a roof edge reaches the roof's layer, so the climb ends with the feet level
// with the roof; one under a hatch ends below it, and the climber steps up through the open hatch.
local rail = function(x) { position: [x, 0, 0.55], size: [0.12, 1, 0.12] };
local rung = function(y) { position: [0.1, y, 0.6], size: [1.8, 0.08, 0.08] };
// A free-standing ladder template: a concrete footing at the foundation layer, flush with the ground like a
// building's slab, under `pieces` ladder pieces.
local ladderOnFooting = function(pieces, facing) {
  size: [1, pieces + 1, 2],
  palette: { "=": "concrete", H: { furniture: "ladder", facing: facing } },
  layers: [["=", "="]] + [["H", "H"] for _ in std.range(1, pieces)],
};
{
  furniture: [
    {
      id: "ladder",
      name: "Ladder",
      // Two cells wide, so the climber's body fits between its rails and up through a hatch.
      size: [2, 1, 1],
      color: "#7d7a72",
      solid: false,
      shape: [rail(0.1), rail(1.78), rung(0.2), rung(0.7)],
      climbable: { speedMetresPerSimSecond: 1.5 },
    },
    {
      id: "roof_hatch",
      name: "Roof hatch",
      // Deep enough along the ladder's facing for the climber's body, which the ladder holds on its centre line.
      size: [2, 1, 3],
      color: "#8d969a",
      material: 'steel',
      breach: { minimumStrength: 9, durability: 300 },
      door: { methods: {}, handlingSimSeconds: 0.8, hatch: true, detail: (import 'door-detail.libsonnet').hatch },
    },
  ],
  templates: [
    // Against the workshop hall's west wall, which has no door, up through its roof layer (`workshop_hall` in
    // templates-workshop.json).
    { id: "workshop_roof_ladder" } + ladderOnFooting(11, "w"),
  ],
}
