# Reference assets

Dev-only references for calibrating mobgen. Nothing here is generated from or
shipped with the game.

| File | What | Author | Licence | Source |
| --- | --- | --- | --- | --- |
| `human_male.blend` | Low-poly male base mesh, T-pose, 700 quads (350 + mirror modifier), no rig | VideroBoy | CC0 | <https://opengameart.org/content/low-poly-human-male> |
| `fgc_skeleton.blend` | Rigged skeleton ("Manny"), 237 bones including rig helpers | Gord Goodwin | CC0 | <https://opengameart.org/content/skeleton-with-rig> (author: <https://gord-goodwin.blogspot.com/2010/03/manny-mannequin.html>) |

## Scripts

Both need Blender (tested with 4.3), headless:

```sh
blender -b fgc_skeleton.blend --python inspect.py   # objects, modifiers, joint positions in metres
blender -b human_male.blend --python voxelize.py    # voxel counts at 1/6 … 1/14 of a block
```

Both scale the figure to 1.75 m, centre it on X/Y and put the ground at Z = 0.
Blender is Z-up and these figures face −Y.

## Findings

Voxelizing `human_male` (a realistically proportioned body):

| Voxel | Size | Voxels tall | Voxels | Head (above the neck) |
| --- | --- | --- | --- | --- |
| 1/6 block | 8.33 cm | 22 | 88 | 4 |
| 1/8 block | 6.25 cm | 29 | 259 | 13 |
| 1/10 block | 5.00 cm | 36 | 480 | 31 |
| 1/12 block | 4.17 cm | 43 | 801 | 54 |
| 1/14 block | 3.57 cm | 50 | 1282 | 79 |

A head of about 50 voxels means about 1/12 of a block. At 1/6 a realistic body
falls apart: limbs are thinner than a voxel. The whole figure at 1/12 is only
about 800 voxels, so detail is cheap.

Joint heights from the `fgc_skeleton` rig, scaled to 1.75 m:

| Joint | Height (m) | Out from the midline (m) |
| --- | --- | --- |
| Top of head | 1.75 | 0 |
| Base of skull (HEAD) | 1.57 | 0 |
| Jaw hinge / chin | 1.59 / 1.53 | 0 |
| Shoulder (HUMERUS head) | 1.41 | 0.17 |
| Elbow | 1.14 | 0.20 |
| Wrist | 0.90 | 0.30 |
| Hip (FEMUR head) | 0.89 | 0.145 |
| Knee | 0.52 | 0.07 |
| Ankle | 0.14 | 0.035 |
| Toe tip | 0.00 | – |
