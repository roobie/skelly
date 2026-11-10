local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.electric-power', [import '../models-electric-power.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
