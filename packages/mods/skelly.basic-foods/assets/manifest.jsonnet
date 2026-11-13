local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.basic-foods', [import '../models-basic-foods.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
