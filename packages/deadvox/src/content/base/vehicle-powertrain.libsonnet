// Derives electric and hybrid vehicles from a blueprint without repeating its fittings. This file stays out of the
// `vehicles` folder because every file there is indexed as a vehicle.
// `motor`, `inverter`, `pack` and `port` are each `{ part, at }`, resting on the vehicle's root unless `on` names others.
// `drop` names the fittings to remove; `repoint` maps a dropped fitting to what its dependents rest on instead,
// and a dependent it does not name moves to the root. `over` merges fields into a kept fitting by id, and `fittings` adds
// fittings that are not part of the drive, such as a badge.
local kit = import 'vehicle-kit.libsonnet';
local combustion = ['engine', 'gearbox', 'radiator', 'fuel_tank', 'fuel_tank_near', 'fuel_tank_far', 'exhaust', 'exhaust_near', 'exhaust_far'];
local rootOf(base) = [f.id for f in base.fittings if f.supportedBy == []][0];
local derive(base, o, drop, added) =
  local root = rootOf(base);
  local ids = [f.id for f in base.fittings];
  local repoint = { engine: 'motor', gearbox: 'motor' } + std.get(o, 'repoint', {});
  assert std.all([std.member(ids, id) for id in std.get(o, 'drop', [])]) : o.id + ' drops a fitting its base lacks';
  base + {
    id: o.id,
    name: o.name,
    fittings: [
      f + { supportedBy: std.uniq(std.sort([if std.member(drop, s) then std.get(repoint, s, root) else s for s in f.supportedBy])) } + std.get(std.get(o, 'over', {}), f.id, {})
      for f in base.fittings
      if !std.member(drop, f.id)
    ] + [
      kit.fitting(role.id, o[role.key].part, o[role.key].at, std.get(o[role.key], 'on', [root]))
      for role in added
    ] + std.get(o, 'fittings', []),
  };
local role(key, id=key) = { key: key, id: id };
{
  electric(base, o):: derive(base, o, std.get(o, 'drop', combustion), [role('motor'), role('inverter'), role('pack'), role('port', 'charge_port')]),
  // A dependent of a kept engine stays on it, so a hybrid has nothing to re-point unless `drop` names something.
  hybrid(base, o):: derive(base, o, std.get(o, 'drop', []), [role('motor'), role('pack')] + (if std.objectHas(o, 'inverter') then [role('inverter')] else []) + (if std.objectHas(o, 'port') then [role('port', 'charge_port')] else [])),
}
