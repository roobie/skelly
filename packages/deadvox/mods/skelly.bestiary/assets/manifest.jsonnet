local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.bestiary', [import '../figures-bestiary.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
