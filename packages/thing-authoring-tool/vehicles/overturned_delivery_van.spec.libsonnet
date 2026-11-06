// A fitting has no rotation, so the rows are drawn upright and this turns each piece about x: the far side meets the road and
// the underside faces the near side.
local lie(piece, up=1.0, across=1.15) =
  local y(z) = z + up;
  local z(y) = across - y;
  if piece.kind == 'box' then piece {
    min: [piece.min[0], y(piece.min[2]), z(piece.max[1])],
    max: [piece.max[0], y(piece.max[2]), z(piece.min[1])],
  }
  else if piece.axis == 'z' then piece {
    axis: 'y',
    profile: [[z(p[1]), p[0]] for p in piece.profile],
    start: y(piece.start),
    end: y(piece.end),
  }
  else if piece.axis == 'y' then piece {
    axis: 'z',
    profile: std.reverse([[p[1], y(p[0])] for p in piece.profile]),
    start: z(piece.end),
    end: z(piece.start),
  }
  else piece {
    profile: [[y(p[1]), z(p[0])] for p in piece.profile],
  };
{
  lie: lie,
  rear: -2.6, nose: 2.62, side: 1.0, skin: 0.94,
  frontAxle: 1.77, rearAxle: -1.53, hub: 0.36, wheelZ: 0.86, arch: 0.45, archRise: 0.42,
  sill: 0.42, floor: 0.54, waist: 1.24, roof: 2.3,
  up: 1.0, across: 1.15,
}
