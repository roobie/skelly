local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.deadvox.rural-sites', [import '../models-rural-sites.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
