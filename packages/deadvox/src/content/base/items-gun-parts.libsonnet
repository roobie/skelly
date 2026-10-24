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
  receiver_ak: { name: 'AK receiver', size: [1, 3] },
  bolt_carrier_ak: { name: 'AK bolt carrier', size: [1, 2] },
  lower_ak: { name: 'AK trigger housing', size: [1, 2] },
  barrel_ak_medium: { name: 'AK barrel', size: [1, 4] },
  handguard_ak: { name: 'AK handguard', size: [1, 2] },
  gas_cylinder_ak: { name: 'AK gas tube', size: [1, 2] },
  gas_block_ak: { name: 'AK gas block', size: [1, 1] },
  grip_ak: { name: 'AK pistol grip', size: [1, 2] },
  stock_ak_long: { name: 'AK buttstock', size: [2, 3] },
  rear_sight_ak: { name: 'AK rear sight', size: [1, 1] },
  front_sight_ak: { name: 'AK front sight', size: [1, 1] },
  receiver_pump: { name: 'Pump receiver', size: [1, 3] },
  bolt_carrier_pump: { name: 'Pump bolt carrier', size: [1, 2] },
  lower_pump: { name: 'Pump trigger housing', size: [1, 2] },
  barrel_pump_medium: { name: 'Pump shotgun barrel', size: [1, 4] },
  front_bead: { name: 'Front bead sight', size: [1, 1] },
  tube_magazine: { name: 'Shotgun magazine tube', size: [1, 3] },
  forend_pump: { name: 'Pump forend', size: [1, 2] },
  stock_tapered_medium: { name: 'Tapered stock', size: [2, 3] },
  revolver_frame: { name: 'Revolver frame', size: [2, 2] },
  revolver_barrel: { name: 'Revolver barrel', size: [1, 2] },
  revolver_cylinder: { name: 'Revolver cylinder', size: [1, 1] },
  revolver_crane: { name: 'Revolver crane', size: [1, 1] },
  revolver_ejector: { name: 'Revolver ejector', size: [1, 1] },
  revolver_grip: { name: 'Revolver grip', size: [1, 2] },
  revolver_hammer: { name: 'Revolver hammer', size: [1, 1] },
  revolver_trigger: { name: 'Revolver trigger', size: [1, 1] },
};
local ids = std.set([entry.id for entry in catalogue.parts if std.objectHas(entry, 'params')]);
assert ids == std.set(std.objectFields(looks)) :
  'gun part looks must match the catalogue items: %s' % [std.setDiff(ids, std.objectFields(looks)) + std.setDiff(std.objectFields(looks), ids)];
{
  items: [{ id: id, category: 'misc', model: id } + looks[id] for id in ids],
}
