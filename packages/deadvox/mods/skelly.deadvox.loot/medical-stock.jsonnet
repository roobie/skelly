local rows = import 'tools/jsonnet/lib/loot-rows.libsonnet';
local item = rows.item, table = rows.table, nothing = rows.nothing;

{
  loot: [{ id: 'medical_stock', rolls: [1, 3], entries: [
    item('bandage', 4, count=[1, 2]), item('antiseptic', 2),
    item('antibiotics', 1), item('codeine', 0.5, count=[2, 8]), item('morphine', 0.25),
    table('medical_filler', 2), nothing(3),
  ] }],
}
