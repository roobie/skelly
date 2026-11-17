// What every vehicle piece shares. `solidFill` is low enough that a car's low bonnet block stays open,
// so a jump lands on the bonnet, and high enough that the cabin, roof and wheels still block.
{
  solidFill: 0.4,
  // A body's half-metre sky cells are mostly air between thin panels, so a cell stops only part of the sky light:
  // the ground under a car and its cabin read shaded, not enclosed. Hidden, since placed vehicles extend this object
  // and a part's shade is not theirs to carry.
  bodyShade:: 0.35,
}
