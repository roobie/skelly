local rows = import '../../../../tools/jsonnet/lib/loot-rows.libsonnet';

{
  patches: [
    { section: 'loot', id: 'desk', add: { entries: [rows.item('strength_ring', 1)] } },
  ],
}
