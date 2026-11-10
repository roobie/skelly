local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.deadvox.scenario.lock-test', [import '../models-lock-test.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
