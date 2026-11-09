local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.arcana', [import '../models-arcana.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
