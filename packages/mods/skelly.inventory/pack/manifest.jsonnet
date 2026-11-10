local manifest = import '../../../../tools/jsonnet/lib/pack-manifest.libsonnet';
manifest(
  id='skelly.inventory',
  tier='core',
  content=['compression', 'inventory', 'inventory-items', 'item-wear'],
)
