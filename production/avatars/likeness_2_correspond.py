# Likeness, step 2 (in Blender): where each MediaPipe landmark of the base render lies on the 3D head (ray from the
# orthographic front camera), and how every face target moves those points. Output: correspond.npz for the fit.
#   blender -b <folder>/likeness.blend -P avatars/likeness_2_correspond.py -- <folder>
import bpy, sys, os, json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_point_tri, barycentric_transform

out = sys.argv[sys.argv.index('--') + 1:][0]
human = bpy.data.objects['Likeness']
me = human.data
keys = me.shape_keys.key_blocks
basis = np.array([v.co[:] for v in keys['Basis'].data])
mix = basis.copy()
for k in keys[1:]:
    if k.value: mix += k.value * (np.array([v.co[:] for v in k.data]) - basis)
M = np.array(human.matrix_world)
world = mix @ M[:3, :3].T + M[:3, 3]

# only the visible skin (helpers for eyes, clothes and hair overlap the face)
gi = human.vertex_groups['body'].index
body = np.zeros(len(me.vertices), bool)
for v in me.vertices:
    if any(g.group == gi for g in v.groups): body[v.index] = True
tris = []
for p in me.polygons:
    vs = list(p.vertices)
    if not all(body[i] for i in vs): continue
    for j in range(1, len(vs) - 1): tris.append((vs[0], vs[j], vs[j + 1]))
tree = BVHTree.FromPolygons([Vector(p) for p in world], tris)

cam = json.load(open(os.path.join(out, 'base-camera.json')))
lm = json.load(open(os.path.join(out, 'base', 'landmarks.json')))['landmarks']
cx, cy, cz = cam['cam']; s = cam['ortho']
idx, bary, miss = [], [], []
for i, (u, v, _) in enumerate(lm):
    o = Vector((cx + (u - 0.5) * s, cy, cz + (0.5 - v) * s))
    hit, n, fi, d = tree.ray_cast(o, Vector((0, 1, 0)))
    if hit is None: miss.append(i); idx.append((0, 0, 0)); bary.append((1, 0, 0)); continue
    a, b, c = tris[fi]; A, B, C = (Vector(world[a]), Vector(world[b]), Vector(world[c]))
    # barycentric weights of the hit in its triangle
    v0, v1, v2 = B - A, C - A, hit - A
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    wb = (d11 * d20 - d01 * d21) / den; wc = (d00 * d21 - d01 * d20) / den
    idx.append((a, b, c)); bary.append((1 - wb - wc, wb, wc))
idx, bary = np.array(idx), np.array(bary)
pt = lambda X: (X[idx] * bary[..., None]).sum(1)          # landmark points of a vertex array
P0 = pt(world)

names = json.load(open(os.path.join(out, 'targets.json')))
D = np.zeros((len(names), len(lm), 3))
for k, n in enumerate(names):
    kb = keys.get(n)
    if kb is None: continue
    delta = (np.array([v.co[:] for v in kb.data]) - basis) @ M[:3, :3].T
    D[k] = pt(delta)
np.savez(os.path.join(out, 'correspond.npz'), P0=P0, D=D, idx=idx, bary=bary, miss=np.array(miss, int), names=np.array(names))
print('CORRESPOND OK', len(lm) - len(miss), 'landmarks on the head,', len(miss), 'missed;', int((np.abs(D).sum((1, 2)) > 0).sum()), 'targets move them')
