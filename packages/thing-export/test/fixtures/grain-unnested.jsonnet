// A definition whose grain falls between detail voxels.
local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
voxel.of({ grain: 0.008, detailGrain: 0.002 }, { id: 'unnested', voxelGrain: 0.003 })
