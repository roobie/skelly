local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.flame-tools', [import '../models-flame-tools.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
