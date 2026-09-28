# Voxelize a reference mesh at several voxel sizes and count voxels, to check
# how much detail a given size can hold.
#   blender -b human_male.blend --python voxelize.py
# The scene is scaled to 1.75 m tall, centred on X/Y, ground at Z = 0. A voxel
# is filled when its centre is inside the mesh (ray parity, majority of three
# axes, so a small hole in the mesh doesn't flip a whole row). The head is
# everything above the neck, the narrowest cross-section between 1.35 and 1.65 m.

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

BLOCK = 0.5  # deadvox block size, m
FRACTIONS = (6, 8, 10, 12, 14)

deps = bpy.context.evaluated_depsgraph_get()
tris = []
for o in bpy.context.scene.objects:
    if o.type != 'MESH':
        continue
    ev = o.evaluated_get(deps)
    mesh = ev.to_mesh()
    mesh.calc_loop_triangles()
    for t in mesh.loop_triangles:
        tris.append([o.matrix_world @ mesh.vertices[i].co for i in t.vertices])
    ev.to_mesh_clear()

lo = Vector((min(v.x for t in tris for v in t), min(v.y for t in tris for v in t), min(v.z for t in tris for v in t)))
hi = Vector((max(v.x for t in tris for v in t), max(v.y for t in tris for v in t), max(v.z for t in tris for v in t)))
k = 1.75 / (hi.z - lo.z)
origin = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
verts = []
polys = []
for t in tris:
    polys.append([len(verts), len(verts) + 1, len(verts) + 2])
    verts.extend((v - origin) * k for v in t)
tree = BVHTree.FromPolygons(verts, polys)
size = (hi - lo) * k
print(f'triangles {len(polys)}, size (m) x={size.x:.3f} y={size.y:.3f} z={size.z:.3f}')

AXES = (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)))


def hits(p, d):
    n = 0
    q = p.copy()
    while True:
        loc, _normal, _index, _dist = tree.ray_cast(q, d)
        if loc is None:
            return n
        n += 1
        q = loc + d * 1e-5


def inside(p):
    return sum(hits(p, d) % 2 for d in AXES) >= 2


for f in FRACTIONS:
    v = BLOCK / f
    nx, ny, nz = (int(size.x / v) + 2, int(size.y / v) + 2, int(size.z / v) + 1)
    layers = []
    total = 0
    for kz in range(nz):
        z = (kz + 0.5) * v
        filled = [(ix, iy) for ix in range(-nx // 2, nx // 2 + 1) for iy in range(-ny // 2, ny // 2 + 1)
                  if inside(Vector((ix * v, iy * v, z)))]
        layers.append((z, filled))
        total += len(filled)
    # Neck: the layer between 1.35 and 1.65 m with the fewest voxels near the midline.
    core = [(z, sum(1 for ix, _ in fl if abs(ix * v) < 0.15)) for z, fl in layers if 1.35 <= z <= 1.65]
    neck_z = min(core, key=lambda c: c[1])[0] if core else 1.55
    head = sum(len(fl) for z, fl in layers if z > neck_z)
    print(f'1/{f:<2d} block = {v * 100:4.2f} cm: {nz} voxels tall, {total:5d} voxels, '
          f'head {head:4d} (above neck at {neck_z:.2f} m)')
