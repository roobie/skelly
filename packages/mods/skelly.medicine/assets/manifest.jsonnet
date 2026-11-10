local release = (import 'tools/jsonnet/lib/built-pack.libsonnet').consumed('skelly.medicine', [import '../models-medicine.jsonnet']);
{
  releasedFiles:: release.files,
  sources: release.sources,
}
