local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.deadvox.camp', [import '../models-camp.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
