// Helpers for vehicle part rows, in the vehicle frame: x forward, y up, z toward the near side.
local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local part(id, family, massKg, dimensions, finish, anchors, exportMass='parts') = {
  id: id,
  exportMass: exportMass,
  parts: [{ id: 'body', family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
  anchors: { [name]: { part: 'body', solid: anchors[name][0], fraction: anchors[name][1] } for name in std.objectFields(anchors) },
};
// A z prism's profile is (x, y), an x prism's (y, z), a y prism's (z, x); a turned profile is (axial, radial) and closes on itself.
local box(id, slot, min, max) = { id: id, kind: 'box', slot: slot, min: min, max: max };
local prism(id, slot, profile, z) = { id: id, kind: 'prism', slot: slot, axis: 'z', profile: profile, start: z[0], end: z[1] };
local turned(id, slot, axis, profile, origin=[0, 0, 0]) = { id: id, kind: 'turned', slot: slot, axis: axis, profile: profile, origin: origin };
local disc(radius, from, to) = [[from, 0], [from, radius], [to, radius], [to, 0], [from, 0]];
local annulus(inner, outer, from, to) = [[from, inner], [from, outer], [to, outer], [to, inner], [from, inner]];
local reflect(piece) = piece + { id: piece.id + '_far' } + (
  if piece.kind == 'box' then { min: [piece.min[0], piece.min[1], -piece.max[2]], max: [piece.max[0], piece.max[1], -piece.min[2]] }
  else if piece.kind == 'prism' && piece.axis == 'z' then { start: -piece.end, end: -piece.start }
  else if piece.kind == 'prism' && piece.axis == 'x' then { profile: std.reverse([[p[0], -p[1]] for p in piece.profile]) }
  else if piece.kind == 'prism' then { profile: std.reverse([[-p[0], p[1]] for p in piece.profile]) }
  else { origin: [piece.origin[0], piece.origin[1], -piece.origin[2]] } + (
    if piece.axis == 'z' then { profile: std.reverse([[-p[0], p[1]] for p in piece.profile]) } else {}
  )
);
{
  part: part,
  box: box,
  prism: prism,
  turned: turned,
  disc: disc,
  annulus: annulus,
  compound(id, massKg, pieces, finish, anchors={}): part(id, 'compound', massKg, { pieces: pieces }, finish, anchors),
  // A welded part carries both sides: each near-side piece and its reflection across the centre plane.
  bothSides(pieces): [piece + { id: piece.id + '_near' } for piece in pieces] + [reflect(piece) for piece in pieces],
}
