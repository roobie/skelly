local item(id, source, exportMass='parts') = { id: id, kind: 'item', source: source, options: { mass: exportMass } };
[
  item('tape_roll', 'electrical_tape'),
  item('thread_spool', 'sewing_thread'),
  item('cord_coil', 'nylon_cord'),
  item('fuse', 'fuse'),
  item('desk_lamp', 'dead_desk_lamp'),
] + [item(package.id, package.id, package.exportMass) for package in import '../packages.libsonnet']
+ [item(can.id, can.id, can.exportMass) for can in (import '../cans.libsonnet').items]
+ [item(food.id, food.id, food.exportMass) for food in import '../food-medical.libsonnet']
