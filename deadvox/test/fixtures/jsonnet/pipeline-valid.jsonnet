local rows = import 'tools/jsonnet/lib/rows.libsonnet';

{
  items: rows.repeat({
    id: 'jsonnet_pipeline_fixture',
    name: 'Pipeline fixture',
    category: 'tool',
    weight: 1,
    size: [1, 1],
  }, 1),
}
