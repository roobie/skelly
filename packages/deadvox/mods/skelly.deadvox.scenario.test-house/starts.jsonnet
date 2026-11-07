local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: kit.fromLayouts((import 'layouts-test-house.jsonnet').layouts),
}
