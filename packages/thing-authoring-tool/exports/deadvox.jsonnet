local item(id, source) = { id: id, kind: 'item', source: source };
[
  item('tape_roll', 'electrical_tape'),
  item('thread_spool', 'sewing_thread'),
  item('cord_coil', 'nylon_cord'),
  item('fuse', 'fuse'),
] + [item(package.id, package.id) for package in import '../packages.libsonnet']
+ [item(light.id, light.id) for light in import '../lights.libsonnet']
