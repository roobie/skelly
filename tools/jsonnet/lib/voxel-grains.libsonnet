// The voxel classes, as the `voxel` field of an export recipe row; grains in metres. A row names its class here, so an
// unknown class fails the build. `vehicle` is for vehicles, furniture and parts made to attach to them and matches
// deadvox's vehicle voxels; `gun` is for firearms and their magazines, whose small controls are finer detail than `item`
// holds; `item` is for every other item or component. `detailGrain` is for the parts a design tags as fine detail, such
// as sights, whose notches and posts the `gun` grain fills; a class's `grain` must be a whole multiple of it so the
// lattices nest, which the `vehicle` grain is not, and no vehicle part carries the tag.
local detail = 0.002;
{
  vehicle: { grain: 0.03125 },
  gun: { grain: 0.004, detailGrain: detail },
  item: { grain: 0.01, detailGrain: detail },
}
