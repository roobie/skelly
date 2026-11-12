---
read_if:
  - you're changing crowd pose texture packing or upload invalidation
---

# Crowd pose uploads

Pose reuse must not freeze root placement or leave shadow casters behind. The shadow and
colour shaders share storage, so publication belongs to the pose producer, not to either
pass. See `packages/presentation/src/render/mobActors.ts`, `MobActorMeshes`.

Partial transfers use Three's supported texture ranges rather than a second WebGL upload
owner. Compare packed bits, including masks and bloodiness, because repacking does not
necessarily change a row. Preserve queued changes until binding; a skipped draw must not
lose updates. Changed rows that touch merge into one upload, since moving actors fill
adjacent rows of a variant's block and the call, not the texels, dominates. Initialization, resized storage and context restoration require the complete
image because untouched rows are not resident in fresh GPU storage. See
`packages/presentation/src/render/poseTextureUpdates.ts`, `PoseTextureUpdates`.
