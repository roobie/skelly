// A mid-size saloon after a fire: 4.7 m long, tyres gone, so it sits about 0.1 m low on its bare rims. Metres in the
// vehicle frame. The noise and sheet helpers here also serve the other road wrecks, which share this surface treatment.
local frac(a) = a - std.floor(a);
local hash(i, j, seed) = frac(std.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453);
local smooth(t) = t * t * (3 - 2 * t);
local value(a, b, seed) =
  local i = std.floor(a);
  local j = std.floor(b);
  local u = smooth(a - i);
  local v = smooth(b - j);
  local low = hash(i, j, seed) * (1 - u) + hash(i + 1, j, seed) * u;
  local high = hash(i, j + 1, seed) * (1 - u) + hash(i + 1, j + 1, seed) * u;
  low * (1 - v) + high * v;
local fbm(a, b, seed) = 0.55 * value(a / 0.5, b / 0.5, seed) + 0.3 * value(a / 0.2, b / 0.2, seed + 1) + 0.15 * value(a / 0.09, b / 0.09, seed + 2);
local fine(a, b, seed) = 0.45 * value(a / 0.3, b / 0.3, seed) + 0.35 * value(a / 0.13, b / 0.13, seed + 1) + 0.2 * value(a / 0.0625, b / 0.0625, seed + 2);
local grain = 32;
local snap(a) = std.round(a * grain) / grain;
// One piece per run of cells that agree, so a patch's edge follows the noise and a large plain area stays cheap.
local runs(cells) = std.foldl(
  function(acc, cell)
    local last = if std.length(acc) == 0 then null else acc[std.length(acc) - 1];
    if last != null && last.to == cell.j && last.slot == cell.slot && last.w == cell.w
    then acc[:std.length(acc) - 1] + [last { to: cell.j + 1 }]
    else acc + [{ from: cell.j, to: cell.j + 1, slot: cell.slot, w: cell.w }],
  cells,
  []
);
{
  fbm:: fbm,
  snap:: snap,
  gauss(a):: std.exp(-a * a),
  // A plate one cell at a time: `axis` is its normal. For z, u is x and v is y; for y, u is x and v is z; for x, u is z and v is y.
  // `surf` gives its outer face and `thick` runs inward, negative for an outward face looking along minus the axis.
  sheet(id, axis, u, v, surf, mask, slot, thick=0.0625, step=0.0625)::
    local nu = std.ceil((u[1] - u[0]) / step);
    local nv = std.ceil((v[1] - v[0]) / step);
    std.flattenArrays([
      local u0 = u[0] + i * step;
      local uc = u0 + step / 2;
      local row = runs([
        { j: j, slot: slot(uc, v[0] + (j + 0.5) * step), w: snap(surf(uc, v[0] + (j + 0.5) * step)) }
        for j in std.range(0, nv - 1)
        if mask(uc, v[0] + (j + 0.5) * step)
      ]);
      [
        local a = std.min(r.w, r.w - thick);
        local b = std.max(r.w, r.w - thick);
        local v0 = v[0] + r.from * step;
        local v1 = v[0] + r.to * step;
        local u1 = u0 + step;
        {
          id: id + '_' + i + '_' + r.from,
          kind: 'box',
          slot: r.slot,
        } + (
          if axis == 'z' then { min: [u0, v0, a], max: [u1, v1, b] }
          else if axis == 'y' then { min: [u0, a, v0], max: [u1, b, v1] }
          else { min: [a, v0, u0], max: [b, v1, u1] }
        )
        for r in row
      ]
      for i in std.range(0, nu - 1)
    ]),
  // A straight member in the side view from `a` to `b`, each (x, y), across `z`.
  bar(id, slot, a, b, width, z)::
    local dx = b[0] - a[0];
    local dy = b[1] - a[1];
    local length = std.sqrt(dx * dx + dy * dy);
    local nx = -dy * width / 2 / length;
    local ny = dx * width / 2 / length;
    { id: id, kind: 'prism', slot: slot, axis: 'z', profile: [[a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]], start: z[0], end: z[1] },
  // Soot and char with bare metal showing, rust breaking through in soft-edged islands: `rustBias` raises its share.
  burnt(a, b, seed, rustBias=0)::
    local m = fine(a, b, seed + 11) + rustBias;
    local n = fbm(a, b, seed);
    if m > 0.68 then 'rust'
    else if m > 0.64 then 'char'
    else if n < 0.5 then 'soot'
    else if n < 0.63 then 'char'
    else if n < 0.7 then 'ash'
    else 'bare',
  burntFinish:: { soot: 'steel-spall-black', char: 'plastic-scorched', ash: 'iron-cast', bare: 'iron-dull', rust: 'rust-red' },

  rear: -2.35, front: 2.35, nose: 2.275, side: 0.9, skin: 0.835, glassOut: 0.845, glassIn: 0.76,
  sill: 0.0625, floor: 0.1875, waist: 0.8438, roof: 1.2812,
  rearAxle: -1.35, frontAxle: 1.4, axleY: 0.2125, arch: 0.375, wheelZ: 0.78,
  cowl: 0.82, aPost: 0.92, aLean: 0.72,
  bRear: -0.32, bFront: -0.22, rearDoor: -1.2,
  cWaist: -1.14, cLean: 0.3, dLean: 0.15, tailWaist: -1.1, deck: 0.875, deckFront: -1.5,
  hoodBack: 0.82, hoodFall: 0.1,
  shellMass: 610,
}
