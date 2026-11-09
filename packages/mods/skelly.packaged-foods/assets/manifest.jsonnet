local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.packaged-foods', [import '../models-packaged-foods.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
