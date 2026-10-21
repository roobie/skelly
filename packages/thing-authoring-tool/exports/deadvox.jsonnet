// Every catalogue row exports under its own id, except older rows deadvox already names differently.
local renamed = { electrical_tape: 'tape_roll', sewing_thread: 'thread_spool', nylon_cord: 'cord_coil', dead_desk_lamp: 'desk_lamp' };
[
  { id: std.get(renamed, row.id, row.id), kind: 'item', source: row.id, options: { mass: row.exportMass } }
  for row in (import '../items.jsonnet').items
]
