// The voxel grains, in metres, shared by every export recipe that voxelizes. `vehicle` is for vehicles, furniture and
// parts made to attach to them and matches deadvox's vehicle voxels; `character` is for the player's body parts, fine
// enough to hold a face and coarse enough to stay a voxel look; `gun` is for firearms and their magazines, whose
// small controls are finer detail than `item` holds; `item` is for every other item or component; `detail` is for the
// parts a design tags as fine detail, such as sights, whose notches and posts the `gun` grain fills. `gun` must be a
// whole multiple of `detail` so the two lattices nest.
{
  vehicle: 0.03125,
  character: 0.02,
  gun: 0.004,
  item: 0.01,
  detail: 0.002,
}
