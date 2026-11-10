local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.melee', [import '../models-melee.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
