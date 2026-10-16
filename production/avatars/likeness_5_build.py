# Likeness, step 5 (in Blender): the fitted head with eyes, brows, lashes, teeth, hair, shirt and glasses; the photo
# projected onto the face and baked into the skin; renders for the likeness test (the photo's own angle, front,
# three-quarter, profile) under dark studio light.
#   blender -b <folder>/likeness.blend -P avatars/likeness_5_build.py -- <folder> <settings json>
import bpy, bmesh, sys, os, json, math
import numpy as np
from mathutils import Vector, Matrix
from bl_ext.user_default.mpfb.services.humanservice import HumanService

out, settings = sys.argv[sys.argv.index('--') + 1:][:2]
S = json.load(open(settings))
fit = json.load(open(os.path.join(out, 'fit.json')))
LM = json.load(open(os.path.join(out, 'landmarks.json')))
W, H = LM['size']
ASSETS = os.path.join(bpy.utils.extension_path_user('bl_ext.user_default.mpfb'), 'data')
human = bpy.data.objects['Likeness']
sc = bpy.context.scene

# ---------------------------------------------------------------- shape: the fitted face targets
keys = human.data.shape_keys.key_blocks
for n, v in fit['weights'].items():
    if n in keys: keys[n].value = v
# hand-set shape from the photo where landmarks could not decide (eyelids: relaxed, a little hooded)
for n, v in S.get('manual_targets', {}).items():
    if n in keys: keys[n].value = v

# ---------------------------------------------------------------- body parts (fitted to the shaped head)
def asset(kind, folder, name=None):
    p = os.path.join(ASSETS, kind, folder, (name or folder) + '.mhclo')
    return HumanService.add_mhclo_asset(p, human, asset_type=S['types'][kind], subdiv_levels=1, material_type='MAKESKIN',
                                        set_up_rigging=False, interpolate_weights=False, import_subrig=False, import_weights=False)
parts = {k: asset(k, *v) for k, v in S['parts'].items()}
HumanService.set_character_skin(os.path.join(ASSETS, 'skins', S['skin'], S['skin'] + '.mhmat'), human, skin_type='ENHANCED_SSS')

# ---------------------------------------------------------------- the face from the photo
for m in human.modifiers: m.show_viewport = m.show_render = False      # vertex positions of the shaped base mesh
dg = bpy.context.evaluated_depsgraph_get()
ev = human.evaluated_get(dg); me = ev.to_mesh()
Mw = np.array(human.matrix_world)
X = np.array([v.co[:] for v in me.vertices]) @ Mw[:3, :3].T + Mw[:3, 3]
N = np.array([v.normal[:] for v in me.vertices]) @ Mw[:3, :3].T
ev.to_mesh_clear()
for m in human.modifiers: m.show_viewport = m.show_render = True
cam = fit['camera']; s, R2, R3, t = cam['s'], np.array(cam['R2']), np.array(cam['R3']), np.array(cam['t'])
pix = s * X @ R2.T + t                                                   # where each vertex is in the photo
uvp = np.stack([pix[:, 0] / W, 1 - pix[:, 1] / H], 1)
facing = np.clip((N @ -R3 - 0.2) / 0.45, 0, 1)                            # surfaces turned towards the photo's camera
mesh = human.data
uvl = mesh.uv_layers.get('photo') or mesh.uv_layers.new(name='photo')
skin_uv = mesh.uv_layers[0].name if mesh.uv_layers[0].name != 'photo' else mesh.uv_layers[1].name
mesh.uv_layers.active = mesh.uv_layers[skin_uv]
for lp in mesh.loops: uvl.data[lp.index].uv = uvp[lp.vertex_index]
fa = mesh.color_attributes.get('facing') or mesh.color_attributes.new('facing', 'FLOAT_COLOR', 'POINT')
for i, f in enumerate(facing): fa.data[i].color = (f, f, f, 1)

# bake the photo (and where it applies) into the skin's own UV space
RES = S.get('bake_res', 2048)
def img(name, alpha=False):
    im = bpy.data.images.get(name) or bpy.data.images.new(name, RES, RES, alpha=alpha, float_buffer=False)
    return im
bake_mat = bpy.data.materials.new('PhotoBake'); bake_mat.use_nodes = True; nt = bake_mat.node_tree; nt.nodes.clear()
o = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'photo'
ph = nt.nodes.new('ShaderNodeTexImage'); ph.image = bpy.data.images.load(os.path.join(out, 'photo-delit.png')); ph.extension = 'CLIP'
mk = nt.nodes.new('ShaderNodeTexImage'); mk.image = bpy.data.images.load(os.path.join(out, 'face-mask.png')); mk.extension = 'CLIP'
mk.image.colorspace_settings.name = 'Non-Color'
at = nt.nodes.new('ShaderNodeVertexColor'); at.layer_name = 'facing'
mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
target = nt.nodes.new('ShaderNodeTexImage')
for a, b in ((uvn.outputs[0], ph.inputs[0]), (uvn.outputs[0], mk.inputs[0]), (mk.outputs['Color'], mul.inputs[0]), (at.outputs['Color'], mul.inputs[1]),
             (em.outputs[0], o.inputs[0])): nt.links.new(a, b)
nt.nodes.active = target
saved = list(mesh.materials); mesh.materials.clear(); mesh.materials.append(bake_mat)
sc.render.engine = 'CYCLES'; sc.cycles.device = 'GPU'; sc.cycles.samples = 4
for o_ in bpy.data.objects: o_.select_set(o_ is human)
bpy.context.view_layer.objects.active = human
for name, src in (('face_photo', ph.outputs['Color']), ('face_mask', mul.outputs[0])):
    target.image = img(name); nt.links.new(src, em.inputs['Color'])
    bpy.ops.object.bake(type='EMIT', margin=8, use_clear=True)
    target.image.filepath_raw = os.path.join(out, name + '.png'); target.image.file_format = 'PNG'; target.image.save()
mesh.materials.clear()
for m in saved: mesh.materials.append(m)

# the skin: its texture toned to the photo's skin, the baked face blended in where the photo applies. The photo was
# taken under a warm lamp: both are balanced towards a natural skin ratio (R:G:B about 1 : 0.5 : 0.34, linear)
tone = np.array(json.load(open(os.path.join(out, 'skin-tone.json')))['skin_linear'])
natural = np.array(S.get('skin_ratio', [1.0, 0.5, 0.34]))
wb = natural / (tone / tone[0]); wb = wb / (wb @ [0.2126, 0.7152, 0.0722]) * (np.array([1, 1, 1]) @ [0.2126, 0.7152, 0.0722])
tone_bal = tone * wb
fpx = np.array(bpy.data.images['face_photo'].pixels[:]).reshape(-1, 4)[:, :3]
fmk = np.array(bpy.data.images['face_mask'].pixels[:]).reshape(-1, 4)[:, 0]
face_avg = (fpx[fmk > 0.6] ** 2.2).mean(0)                              # the face's own skin colour, as baked
trees = {m.node_tree for m in mesh.materials if m and m.use_nodes}
trees |= {n.node_tree for t in list(trees) for n in t.nodes if n.type == 'GROUP' and n.node_tree}
for nt in trees:
    tex = [n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image and 'diffuse' in n.image.name.lower()]
    if not tex: continue
    dif = tex[0]
    users = [(l.to_node, l.to_socket) for l in nt.links if l.from_node == dif and l.from_socket.name == 'Color']
    arr = np.array(dif.image.pixels[:]).reshape(-1, 4)[:, :3]; avg = (arr[arr.sum(1) > 0.3] ** 2.2).mean(0)
    gain = nt.nodes.new('ShaderNodeMix'); gain.data_type = 'RGBA'; gain.blend_type = 'MULTIPLY'; gain.inputs['Factor'].default_value = 1
    g = np.clip(face_avg * wb / np.maximum(avg, 1e-3), 0.3, 3.0)
    gain.inputs['B'].default_value = (*g, 1)
    nt.links.new(dif.outputs['Color'], gain.inputs['A'])
    suv = nt.nodes.new('ShaderNodeUVMap'); suv.uv_map = skin_uv
    fp = nt.nodes.new('ShaderNodeTexImage'); fp.image = bpy.data.images['face_photo']
    fm = nt.nodes.new('ShaderNodeTexImage'); fm.image = bpy.data.images['face_mask']; fm.image.colorspace_settings.name = 'Non-Color'
    for n_ in (fp, fm): nt.links.new(suv.outputs[0], n_.inputs[0])
    fwb = nt.nodes.new('ShaderNodeMix'); fwb.data_type = 'RGBA'; fwb.blend_type = 'MULTIPLY'; fwb.inputs['Factor'].default_value = 1
    fwb.inputs['B'].default_value = (*wb, 1); nt.links.new(fp.outputs['Color'], fwb.inputs['A'])
    blend = nt.nodes.new('ShaderNodeMix'); blend.data_type = 'RGBA'
    nt.links.new(fm.outputs['Color'], blend.inputs['Factor']); nt.links.new(gain.outputs['Result'], blend.inputs['A']); nt.links.new(fwb.outputs['Result'], blend.inputs['B'])
    print('SKIN: photo blended in', nt.name, 'white balance', np.round(wb, 2))
    for node, sock in users: nt.links.new(blend.outputs['Result'], sock)

# ---------------------------------------------------------------- hair colour, eye colour, shirt
def tint(obj, rgb, rough=None):
    for mat in obj.data.materials:
        if not mat or not mat.use_nodes: continue
        for n in mat.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                n.inputs['Base Color'].default_value = (*rgb, 1)
                for l in list(mat.node_tree.links):
                    if l.to_socket == n.inputs['Base Color']:
                        mix = mat.node_tree.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
                        mix.inputs['B'].default_value = (*[c * 2.2 for c in rgb], 1)
                        mat.node_tree.links.new(l.from_socket, mix.inputs['A']); mat.node_tree.links.new(mix.outputs['Result'], n.inputs['Base Color'])
                if rough is not None: n.inputs['Roughness'].default_value = rough
if 'hair' in parts and parts['hair']: tint(parts['hair'], S['hair_rgb'])
if 'eyebrows' in parts and parts['eyebrows']: tint(parts['eyebrows'], S['brow_rgb'])
eyes = parts.get('eyes')
if eyes:
    for mat in eyes.data.materials:
        for n in (mat.node_tree.nodes if mat and mat.use_nodes else []):
            if n.type == 'TEX_IMAGE' and n.image and 'eye' in n.image.name.lower():
                n.image = bpy.data.images.load(os.path.join(ASSETS, 'eyes', 'materials', S['eye'] + '_eye.png'))
shirt = parts.get('clothes')
if shirt:
    satin = bpy.data.materials.new('Black satin'); satin.use_nodes = True
    p = satin.node_tree.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = (0.008, 0.007, 0.007, 1)
    p.inputs['Roughness'].default_value = 0.42; p.inputs['Sheen Weight'].default_value = 0.35; p.inputs['Sheen Roughness'].default_value = 0.35
    p.inputs['Specular IOR Level'].default_value = 0.35
    shirt.data.materials.clear(); shirt.data.materials.append(satin)

# landmark points on the fitted head
C = np.load(os.path.join(out, 'correspond.npz'))
w = np.zeros(len(C['names'])); names = list(C['names'])
for n, v in fit['weights'].items(): w[names.index(n)] = v
P = C['P0'] + np.tensordot(w, C['D'], 1)
def ring(pts):
    return np.array([P[i] for i in pts]).mean(0)

# ---------------------------------------------------------------- hair: strands grown from the scalp (curves)
HC = S.get('hair_curves')
if HC:
    rng = np.random.default_rng(7)
    gi = human.vertex_groups['scalp'].index
    scalp = np.zeros(len(mesh.vertices), bool)
    for v in mesh.vertices:
        if any(g.group == gi and g.weight > 0.5 for g in v.groups): scalp[v.index] = True
    tri = []
    for poly in mesh.polygons:
        vs = list(poly.vertices)
        if all(scalp[i] for i in vs):
            for j in range(1, len(vs) - 1): tri.append((vs[0], vs[j], vs[j + 1]))
    tri = np.array(tri); A, B, Cc = X[tri[:, 0]], X[tri[:, 1]], X[tri[:, 2]]
    area = np.linalg.norm(np.cross(B - A, Cc - A), axis=1) / 2
    def sample(n, keep):
        """n roots, area-uniform on scalp triangles where keep(point) holds"""
        roots, norms = [], []
        while len(roots) < n:
            k = rng.choice(len(tri), size=n, p=area / area.sum()); r1, r2 = rng.random(n), rng.random(n)
            sq = np.sqrt(r1)[:, None]; pt = (1 - sq) * A[k] + sq * (1 - r2[:, None]) * B[k] + sq * r2[:, None] * Cc[k]
            nm = N[tri[k, 0]] + N[tri[k, 1]] + N[tri[k, 2]]; nm /= np.linalg.norm(nm, axis=1, keepdims=True)
            ok = keep(pt); roots += list(pt[ok]); norms += list(nm[ok])
        return np.array(roots[:n]), np.array(norms[:n])
    up = np.array([0, 0, 1.0]); fwd = np.array([0, -1.0, 0])
    ear_top = max(P[234][2], P[454][2]) + 0.035                          # above this: the long top; below: the short fade
    top_r, top_n = sample(HC['count_top'], lambda q: q[:, 2] > ear_top)
    side_r, side_n = sample(HC['count_side'], lambda q: q[:, 2] <= ear_top + 0.004)
    strands = []
    # top: up and a little forward, gathered into spiky clumps; longer at the front, shorter at the crown
    ci = rng.choice(len(top_r), HC['clumps'], replace=False); cr, cn = top_r[ci], top_n[ci]
    jit = rng.normal(0, 0.22, (HC['clumps'], 3))                                       # each spike its own way
    front = np.clip((top_r[:, 1] - top_r[:, 1].max()) / (top_r[:, 1].min() - top_r[:, 1].max()), 0, 1)   # 1 at the front
    for i in range(len(top_r)):
        r, n = top_r[i], top_n[i]
        j = np.argmin(((cr - r) ** 2).sum(1))
        L = HC['top_len'] * (0.55 + 0.5 * front[i]) * rng.uniform(0.8, 1.15)
        side = np.array([np.sign(r[0] - P[168][0]), 0, 0]) * 0.18                     # swept a little off the middle
        d = n * 0.65 + up * 0.4 + fwd * (0.25 + 0.4 * front[i]) + side; d /= np.linalg.norm(d)
        cd = cn[j] * 0.65 + up * 0.4 + fwd * (0.3 + 0.3 * front[i]) + side + jit[j]; cd /= np.linalg.norm(cd)
        ctip = cr[j] + cd * L * 1.05
        pts = []
        for k, u in enumerate(np.linspace(0, 1, 6)):
            own = r + d * L * u
            q = own + (ctip - (r + d * L)) * (u ** 1.3) * 0.92         # pulled tightly into its clump: spikes, not fur
            q = q + n * 0.004 * np.sin(np.pi * u) + rng.normal(0, 0.0012, 3) * u
            pts.append(q)
        strands.append((pts, 0.00014))
    # sides and back: a short fade, lying along the head, down and back
    for r, n in zip(side_r, side_n):
        d = n * 0.35 - up * 0.45 - fwd * 0.3; d /= np.linalg.norm(d)
        L = HC['side_len'] * rng.uniform(0.6, 1.3)
        strands.append(([r, r + d * L * 0.5 + n * 0.0006, r + d * L], 0.00006))
    hc = bpy.data.hair_curves.new('Hair')
    hc.add_curves([len(p_) for p_, _ in strands])
    pos = np.concatenate([np.array(p_) for p_, _ in strands]).astype(np.float32)
    rad = np.concatenate([np.linspace(w_, w_ * 0.35, len(p_)) for p_, w_ in strands]).astype(np.float32)
    hc.attributes['position'].data.foreach_set('vector', pos.ravel())
    ra = hc.attributes.get('radius') or hc.attributes.new('radius', 'FLOAT', 'POINT'); ra.data.foreach_set('value', rad)
    hob = bpy.data.objects.new('Hair', hc); sc.collection.objects.link(hob)
    hm = bpy.data.materials.new('Hair'); hm.use_nodes = True; ht = hm.node_tree; ht.nodes.clear()
    ho = ht.nodes.new('ShaderNodeOutputMaterial'); hb = ht.nodes.new('ShaderNodeBsdfHairPrincipled')
    # the colour is given directly (ash blond from the photo); melanin values read orange under the studio's amber light
    hb.parametrization = 'COLOR'; hb.inputs['Color'].default_value = (*HC['color'], 1)
    hb.inputs['Roughness'].default_value = 0.32; hb.inputs['Random Roughness'].default_value = 0.2
    hi_ = ht.nodes.new('ShaderNodeHairInfo'); var = ht.nodes.new('ShaderNodeMix'); var.data_type = 'RGBA'
    var.inputs['A'].default_value = (*[c * 0.75 for c in HC['color']], 1); var.inputs['B'].default_value = (*[min(1, c * 1.25) for c in HC['color']], 1)
    ht.links.new(hi_.outputs['Random'], var.inputs['Factor']); ht.links.new(var.outputs['Result'], hb.inputs['Color'])   # strand to strand variation
    ht.links.new(hb.outputs[0], ho.inputs[0]); hc.materials.append(hm)
    print('HAIR', len(strands), 'strands')

# ---------------------------------------------------------------- glasses: clear acetate frames on the fitted face
if S.get('glasses'):
    G = S['glasses']
    eyeR, eyeL = ring([33, 133, 159, 145]), ring([362, 263, 386, 374])
    span = np.linalg.norm(P[33] - P[263])                    # outer eye corners
    G = {k: (v * span if isinstance(v, (int, float)) else v) for k, v in G.items()}   # sizes are given in eye spans
    fwd = np.array([0, -1.0, 0]); up = np.array([0, 0, 1.0])
    acrylic = bpy.data.materials.new('Clear acetate'); acrylic.use_nodes = True
    p = acrylic.node_tree.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = (0.93, 0.86, 0.88, 1)
    p.inputs['Transmission Weight'].default_value = 1; p.inputs['Roughness'].default_value = 0.08; p.inputs['IOR'].default_value = 1.49
    # lenses: clear, only a faint reflection (a refracting slab read as milky at this thickness)
    lensm = bpy.data.materials.new('Lens'); lensm.use_nodes = True; lt = lensm.node_tree; lt.nodes.clear()
    lo_ = lt.nodes.new('ShaderNodeOutputMaterial'); mx = lt.nodes.new('ShaderNodeMixShader'); mx.inputs[0].default_value = 0.1
    tr = lt.nodes.new('ShaderNodeBsdfTransparent'); gl = lt.nodes.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = 0.02
    lt.links.new(tr.outputs[0], mx.inputs[1]); lt.links.new(gl.outputs[0], mx.inputs[2]); lt.links.new(mx.outputs[0], lo_.inputs[0])
    bm = bmesh.new()
    def rounded(cx, w_, h_, r, n=10):
        pts = []
        for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
            for k in range(n + 1):
                a = math.radians(a0 + 90 * k / n)
                pts.append(cx + (qx * (w_ / 2 - r) + r * math.cos(a)) * np.array([1, 0, 0]) + (qy * (h_ / 2 - r) + r * math.sin(a)) * up)
        return pts
    frames = []
    for e in (eyeR, eyeL):
        cx = e + fwd * G['offset'] + up * G['raise']
        outer, inner = rounded(cx, G['w'], G['h'], G['r']), rounded(cx, G['w'] - 2 * G['rim'], G['h'] - 2 * G['rim'], G['r'] - G['rim'])
        vo = [bm.verts.new(p) for p in outer]; vi = [bm.verts.new(p) for p in inner]
        for k in range(len(vo)): bm.faces.new((vo[k], vo[(k + 1) % len(vo)], vi[(k + 1) % len(vi)], vi[k]))
        frames.append((cx, inner))
    # bridge between the two rims
    a, b = frames[0][0], frames[1][0]; mid = (a + b) / 2 + up * 0.012
    for side in (a, b):
        q = side + (mid - side) * 0.0
    br = [bm.verts.new(v) for v in (a + (b - a) * 0.33 + up * 0.01, b + (a - b) * 0.33 + up * 0.01, b + (a - b) * 0.33 + up * 0.016, a + (b - a) * 0.33 + up * 0.016)]
    bm.faces.new(br)
    gm = bpy.data.meshes.new('Glasses'); bm.to_mesh(gm); bm.free()
    go = bpy.data.objects.new('Glasses', gm); sc.collection.objects.link(go)
    sol = go.modifiers.new('Thickness', 'SOLIDIFY'); sol.thickness = G['depth']; sol.offset = 0
    go.modifiers.new('Smooth', 'SUBSURF').levels = 1
    gm.materials.append(acrylic)
    # lenses
    for cx, inner in frames:
        lb = bmesh.new(); vs = [lb.verts.new(p + fwd * 0.001) for p in inner]; lb.faces.new(vs)
        lm_ = bpy.data.meshes.new('Lens'); lb.to_mesh(lm_); lb.free()
        lo = bpy.data.objects.new('Lens', lm_); sc.collection.objects.link(lo); lm_.materials.append(lensm)
        lo.modifiers.new('T', 'SOLIDIFY').thickness = 0.0015
    # temples back to the ears
    for e, ear in ((eyeR, ring([234, 127, 93])), (eyeL, ring([454, 356, 323]))):
        start = e + fwd * G['offset'] + up * (G['raise'] + G['h'] * 0.3) + (e - (eyeR + eyeL) / 2) / np.linalg.norm(e - (eyeR + eyeL) / 2) * G['w'] / 2
        end = ear + up * 0.012 + np.array([0, 0.03, 0])
        cu = bpy.data.curves.new('Temple', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.0022
        sp = cu.splines.new('POLY'); sp.points.add(1); sp.points[0].co = (*start, 1); sp.points[1].co = (*end, 1)
        to = bpy.data.objects.new('Temple', cu); sc.collection.objects.link(to); cu.materials.append(acrylic)

# ---------------------------------------------------------------- studio light (dark, as in the show) and renders
for o_ in [o_ for o_ in bpy.data.objects if o_.type in ('LIGHT', 'CAMERA')]: bpy.data.objects.remove(o_)
world = sc.world or bpy.data.worlds.new('W'); sc.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.012, 0.012, 0.014, 1)
head_c = Vector(ring([1, 168, 152]))
def light(name, pos, energy, size, color):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.size = size; ld.color = color
    ob = bpy.data.objects.new(name, ld); sc.collection.objects.link(ob); ob.location = pos
    ob.rotation_euler = (head_c - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
light('Key', head_c + Vector((-0.9, -1.3, 0.55)), 95, 0.9, (1.0, 0.98, 0.96))
light('Fill', head_c + Vector((1.1, -1.0, 0.05)), 14, 1.2, (0.9, 0.95, 1.0))
light('Rim amber', head_c + Vector((-0.8, 0.9, 0.5)), 55, 0.4, (1.0, 0.78, 0.55))
light('Rim ice', head_c + Vector((0.8, 0.9, 0.5)), 70, 0.4, (0.68, 0.8, 1.0))
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
sc.view_settings.exposure = S.get('exposure', 0.0)
sc.cycles.samples = S.get('samples', 128); sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 1000, 1250
def shoot(name, yaw_deg, pitch_deg=0, dist=1.15, lens=85):
    cd = bpy.data.cameras.new(name); cd.lens = lens
    cam_o = bpy.data.objects.new(name, cd); sc.collection.objects.link(cam_o)
    a = math.radians(yaw_deg); b = math.radians(pitch_deg)
    cam_o.location = head_c + Vector((math.sin(a) * math.cos(b), -math.cos(a) * math.cos(b), math.sin(b))) * dist + Vector((0, 0, -0.03))
    cam_o.rotation_euler = (head_c + Vector((0, 0, -0.03)) - cam_o.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam_o; sc.render.filepath = os.path.join(out, f'test-{name}.png'); bpy.ops.render.render(write_still=True)
# the photo's own angle (from the fitted camera), then front, three-quarter and profile
yaw = math.degrees(math.atan2(-R3[0], R3[1])); pitch = math.degrees(math.asin(np.clip(-R3[2], -1, 1)))
shoot('photo-angle', yaw, pitch)
shoot('front', 0); shoot('three-quarter', -32); shoot('profile', -78)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'likeness-test.blend'))
print('LIKENESS OK yaw %.1f pitch %.1f' % (yaw, pitch))
