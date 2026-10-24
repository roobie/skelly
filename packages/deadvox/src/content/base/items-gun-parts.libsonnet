// Gungen's part catalogue owns which gun parts are items; this pack adds only what a player sees of each.
// A part's model carries its authored mass, so its item takes no weight.
local catalogue = import 'gungen/src/gun/catalogue.jsonnet';
local looks = {
  receiver_ar: { name: 'AR upper receiver', size: [1, 3] },
  charging_handle_ar: { name: 'AR charging handle', size: [1, 1] },
  bolt_carrier_ar: { name: 'AR bolt carrier', size: [1, 2] },
  lower_ar: { name: 'AR lower receiver', size: [2, 2] },
  barrel_ar_medium: { name: 'AR barrel', size: [1, 4] },
  handguard_ar_clamped: { name: 'AR handguard', size: [1, 3] },
  grip_standard: { name: 'Pistol grip', size: [1, 2] },
  stock_m4_medium: { name: 'M4 stock', size: [2, 3] },
  front_sight_ar: { name: 'AR front sight', size: [1, 1] },
};
local ids = std.set([entry.id for entry in catalogue.parts if std.objectHas(entry, 'params')]);
assert ids == std.set(std.objectFields(looks)) :
  'gun part looks must match the catalogue items: %s' % [std.setDiff(ids, std.objectFields(looks)) + std.setDiff(std.objectFields(looks), ids)];
{
  items: [{ id: id, category: 'misc', model: id } + looks[id] for id in ids],
}
