// A definition whose grain is no size at all.
local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
voxel.of({ grain: 0.008, detailGrain: 0.002 }, { id: 'zero', voxelGrain: 0 })
