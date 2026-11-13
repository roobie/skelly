local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.household', [import '../models-household.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
