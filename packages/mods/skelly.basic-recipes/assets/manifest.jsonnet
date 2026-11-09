local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.basic-recipes', [import '../models-basic-recipes.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
