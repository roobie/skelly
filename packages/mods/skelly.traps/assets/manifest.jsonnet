local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.traps', [import '../models-traps.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
