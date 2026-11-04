// A free-standing ladder template: a concrete footing at the foundation layer, flush with the ground like a
// building's slab, under `pieces` ladder pieces.
local ladderOnFooting = function(pieces, facing) {
  size: [1, pieces + 1, 2],
  palette: { "=": "concrete", H: { furniture: "ladder", facing: facing } },
  layers: [["=", "="]] + [["H", "H"] for _ in std.range(1, pieces)],
};
{
  templates: [
    // Against the workshop hall's west wall, which has no door, up through its roof layer (`workshop_hall` in
    // templates-workshop.json).
    { id: "workshop_roof_ladder" } + ladderOnFooting(11, "w"),
  ],
}
