local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.deadvox.scenario.gauntlet.city', [import '../models-items.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
