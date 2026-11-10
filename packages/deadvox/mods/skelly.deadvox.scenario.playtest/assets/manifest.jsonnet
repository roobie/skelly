local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.deadvox.scenario.playtest', [import '../models-playtest.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
