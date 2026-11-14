local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.ground-vehicles', [import '../models-ground-vehicles.jsonnet', import '../vehicles.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
