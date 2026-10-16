# The opening's animation onto a scene built by build.py (DZ_CACHE=cache-opening): every frame's lights (energy, colour,
# position, aim), the animated materials' colours, the moving or showing/hiding objects, and the changing screens as
# image sequences, all from export-opening.mjs (anim/f####.json, screens/<n>/####.jpg).
#   blender -b opening.blend -P production/blender/anim.py      (DZ_CACHE as for build.py; saves the .blend)
import bpy, json, math, os
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, os.environ.get('DZ_CACHE', 'cache-opening'))
K_LIGHT = float(os.environ.get('DZ_K', '2.0'))
meta = json.load(open(os.path.join(CACHE, 'scene.json')))
N = meta['frames']['count']
frames = [json.load(open(os.path.join(CACHE, 'anim', f'f{f:04d}.json'))) for f in range(1, N + 1)]
scene = bpy.context.scene
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))      # three (y up) -> Blender (z up)
cv = lambda p: Vector((p[0], -p[2], p[1]))
def three_matrix(e): return Matrix([e[r::4] for r in range(4)])          # column-major list -> rows

# ---- fast keyframing: whole f-curves written at once (keyframe_insert per frame is far too slow at 2700 frames)
def bake(idd, path, index, values, constant=False):
    ad = idd.animation_data or idd.animation_data_create()
    if not ad.action:
        ad.action = bpy.data.actions.new(idd.name + ' anim')
        if hasattr(ad, 'action_slot') and ad.action_slot is None and hasattr(ad.action, 'slots'):
            ad.action_slot = ad.action.slots.new(idd.id_type, idd.name)
    fc = ad.action.fcurve_ensure_for_datablock(idd, path, index=index)       # Blender 5: layered actions
    fc.keyframe_points.clear()
    kp = fc.keyframe_points; kp.add(len(values))
    co = []
    for f, v in enumerate(values, start=1): co += [f, v]
    kp.foreach_set('co', co)
    kp.foreach_set('interpolation', [0 if constant else 1] * len(values))   # CONSTANT or LINEAR
    fc.update()

# ---- lights: build.py named them '<Kind> <index>' in the order of meta['lights']
lights = {}
for ob in bpy.data.objects:
    if ob.type == 'LIGHT':
        try: lights[int(ob.name.split(' ')[-1])] = ob
        except ValueError: pass
for i, L in enumerate(meta['lights']):
    ob = lights.get(i)
    if not ob: continue
    rows = [fr['lights'][i] for fr in frames]
    k = (L['width'] * L['height'] * math.pi if L['type'] == 'RectAreaLight' else 4 * math.pi) * K_LIGHT
    bake(ob.data, 'energy', 0, [r[0] * k for r in rows])
    for c in range(3): bake(ob.data, 'color', c, [r[1 + c] for r in rows])
    if L['type'] != 'RectAreaLight':
        pos = [cv(r[4:7]) for r in rows]
        if any((p - pos[0]).length > 1e-4 for p in pos):
            for c in range(3): bake(ob, 'location', c, [p[c] for p in pos])
        if L['type'] == 'SpotLight' and len(rows[0]) >= 10:
            eul = [(cv(r[7:10]) - cv(r[4:7])).to_track_quat('-Z', 'Y').to_euler() for r in rows]
            if any((Vector(e) - Vector(eul[0])).length > 1e-4 for e in eul):
                for c in range(3): bake(ob, 'rotation_euler', c, [e[c] for e in eul])
print('lights animated:', len(lights))

# ---- materials: the colour inputs that the glTF import set from the factors (not linked to a texture)
def colour_sockets(mat):
    out = []
    if not mat.use_nodes: return out
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            for k in ('Base Color', 'Emission Color'):
                s = n.inputs[k]
                if not s.is_linked: out.append((k, s))
                else:
                    src = s.links[0].from_node
                    if src.type == 'MIX':
                        for inp in src.inputs:
                            if inp.type == 'RGBA' and not inp.is_linked: out.append((k, inp)); break
                    elif src.type == 'TEX_IMAGE' and k == 'Emission Color':
                        out.append(('Emission Strength', n.inputs['Emission Strength']))   # a screen: its brightness
        elif n.type == 'EMISSION':
            s = n.inputs['Color']
            if not s.is_linked: out.append(('Emission Color', s))
            else:
                src = s.links[0].from_node
                if src.type == 'MIX':
                    for inp in src.inputs:
                        if inp.type == 'RGBA' and not inp.is_linked: out.append(('Emission Color', inp)); break
    return out
done = 0
for i, name in enumerate(meta['anim']['mats']):
    mat = bpy.data.materials.get(name)
    if not mat: continue
    st = [fr['mats'][i] for fr in frames]
    for k, s in colour_sockets(mat):
        path = s.path_from_id('default_value')
        if k == 'Emission Strength':
            bake(mat.node_tree, path, 0, [max(x[3:6]) * x[6] * float(os.environ.get('DZ_SCREEN', '1.6')) for x in st]); continue
        cols = [x[0:3] if (k == 'Base Color' or not any(x[3:6])) else [v * x[6] for v in x[3:6]] for x in st]
        for c in range(3): bake(mat.node_tree, path, c, [col[c] for col in cols])
    done += 1
print('materials animated:', done)

# ---- objects: world matrices and visibility; a child's local transform from its parent's world at the same frame
names = meta['anim']['objs']
world = {}                                   # name -> list of Blender world matrices
for i, name in enumerate(names):
    world[name] = [C @ three_matrix(fr['objs'][i][:16]) @ C.inverted() for fr in frames]
done = 0
for i, name in enumerate(names):
    o = bpy.data.objects.get(name)
    if not o: continue
    pw = world.get(o.parent.name) if o.parent else None
    pstatic = o.parent.matrix_world.copy() if o.parent else Matrix.Identity(4)
    loc, rot, sca = [], [], []
    o.rotation_mode = 'QUATERNION'
    for f in range(N):
        P = (pw[f] if pw else pstatic) @ o.matrix_parent_inverse
        l, q, sc = (P.inverted() @ world[name][f]).decompose()
        loc.append(l); rot.append(q); sca.append(sc)
    for c in range(3): bake(o, 'location', c, [v[c] for v in loc])
    for c in range(4): bake(o, 'rotation_quaternion', c, [v[c] for v in rot])
    for c in range(3): bake(o, 'scale', c, [v[c] for v in sca])
    vis = [frames[f]['objs'][i][16] for f in range(N)]
    if any(v != vis[0] for v in vis): bake(o, 'hide_render', 0, [0.0 if v else 1.0 for v in vis], constant=True)
    else: o.hide_render = not vis[0]
    done += 1
print('objects animated:', done)

# ---- screens: image sequences on their materials
for i, sc in enumerate(meta['anim']['screens']):
    d = os.path.join(CACHE, 'screens', str(i))
    if not os.path.isdir(d): continue
    seq = sorted(f for f in os.listdir(d) if f.endswith('.jpg'))
    img = bpy.data.images.load(os.path.join(d, seq[0])); img.source = 'SEQUENCE'
    for mat in bpy.data.materials:
        if mat.name.split('.')[0] != sc['name'] or not mat.use_nodes: continue
        for n in mat.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and n.image.source != 'SEQUENCE' and n.image.colorspace_settings.name != 'Non-Color':
                n.image = img; n.image_user.frame_duration = len(seq); n.image_user.frame_start = 1; n.image_user.use_auto_refresh = True
print('screens:', len(meta['anim']['screens']))

# ---- the camera: the opening's own focal length changes; a slightly closer focus for the studio shots
scene.render.fps = 30
bpy.ops.wm.save_mainfile()
print('ANIM OK', N, 'frames')
