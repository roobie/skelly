// Row helpers shared by catalogue batches, so each batch file holds only its own rows.
local params(values) = { [key]: if std.type(values[key]) == 'array' then std.manifestJson(values[key]) else std.toString(values[key]) for key in std.objectFields(values) };
local item(id, family, massKg, dimensions, finish) = {
  id: id,
  exportMass: 'parts',
  parts: [{ id: id, family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
};
{
  item: item,
  compound(id, massKg, pieces, finish): item(id, 'compound', massKg, { pieces: pieces }, finish),
  box(id, slot, min, max): { id: id, slot: slot, kind: 'box', min: min, max: max },
  turned(id, slot, axis, profile, origin=null): { id: id, slot: slot, kind: 'turned', axis: axis, profile: profile } + (if origin == null then {} else { origin: origin }),
  prism(id, slot, axis, profile, start, end): { id: id, slot: slot, kind: 'prism', axis: axis, profile: profile, start: start, end: end },
  // A held tool lies along x and takes its grip on a named solid.
  gripOn(id, solid): { part: id, solid: solid, fraction: [0.5, 0.5, 0.5], turn: [0, 0, 0], hold: 'upright', roll: 90 },
}
