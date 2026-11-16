local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.audio.impact', [import '../sounds-impact.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
