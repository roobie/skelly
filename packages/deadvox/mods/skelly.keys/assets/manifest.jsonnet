local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.keys', [import '../models-keys.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
