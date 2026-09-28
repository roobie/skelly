# Print what a reference .blend holds: objects, mesh sizes, armature joints.
#   blender -b <file>.blend --python inspect.py
# Blender units are reported as-is, plus metres after scaling the whole scene
# so its height is 1.75 m (the files don't agree on a unit). Joints are centred
# on the mesh's X/Y middle with the ground at Z = 0. Rig helpers (MCH_, PIV_,
# CONTROL_, *_TAR) are left out.

import bpy
from mathutils import Vector

objs = list(bpy.context.scene.objects)
meshes = [o for o in objs if o.type == 'MESH']
arms = [o for o in objs if o.type == 'ARMATURE']

lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w))
        hi = Vector(map(max, hi, w))
height = hi.z - lo.z
k = 1.75 / height if height > 0 else 1.0

print('=== objects')
for o in objs:
    extra = ''
    if o.type == 'MESH':
        mods = ','.join(f'{m.type}' for m in o.modifiers) or '-'
        extra = f' verts={len(o.data.vertices)} faces={len(o.data.polygons)} modifiers={mods}'
    print(f'{o.name!r} {o.type}{extra} dims={tuple(round(d, 3) for d in o.dimensions)}')
print('=== bounds (blender units)', tuple(round(v, 3) for v in lo), tuple(round(v, 3) for v in hi))
print(f'=== height {height:.3f} bu, scale to 1.75 m: x{k:.4f}')
origin = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
HELPERS = ('MCH_', 'PIV_', 'CONTROL_')
for a in arms:
    print(f'=== armature {a.name!r}: {len(a.data.bones)} bones (metres, Z up, head -> tail)')
    for b in a.data.bones:
        if b.name.startswith(HELPERS) or '_TAR' in b.name or 'FING' in b.name or 'VERTEBRAE' in b.name:
            continue
        h = (a.matrix_world @ b.head_local - origin) * k
        t = (a.matrix_world @ b.tail_local - origin) * k
        print(f'  {b.name:24s} parent={(b.parent.name if b.parent else "-"):20s} '
              f'head=({h.x:+.3f},{h.y:+.3f},{h.z:+.3f}) tail=({t.x:+.3f},{t.y:+.3f},{t.z:+.3f}) len={b.length * k:.3f}')
