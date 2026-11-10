local kit = import 'tools/jsonnet/lib/start-kit.libsonnet';
{
  starts: [kit.common + {
    id: 'gauntlet',
    site: 'gauntlet',
    placement: (import 'gauntlet-start.libsonnet').placement,
  }],
}
