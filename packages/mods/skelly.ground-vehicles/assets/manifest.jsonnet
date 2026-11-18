local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.ground-vehicles', [import '../vehicles.jsonnet', import '../troop-carrier.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
