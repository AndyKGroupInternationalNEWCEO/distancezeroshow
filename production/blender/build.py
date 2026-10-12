# DISTANCE // ZERO opening, 45–50 s, rebuilt for Blender + Cycles (4K realism test).
# Input: production/blender/cache (exported from the real-time opening: set, lights, camera path, actor point caches).
# Output: production/blender/opening-45-50.blend. The real-time opening and its master are not touched.
#   blender -b -P production/blender/build.py
import bpy, json, math, os, struct
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache')
AV = os.path.join(HERE, '..', 'avatars')
meta = json.load(open(os.path.join(CACHE, 'scene.json')))
FRAMES = meta['frames']['count']
K_LIGHT = float(os.environ.get('DZ_K', '1.0'))            # global light calibration against the reference frames

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'DZ opening 45-50s'
scene.frame_start, scene.frame_end = 1, FRAMES
scene.render.fps = meta['frames']['fps']

def coll(name):
    c = bpy.data.collections.new(name); scene.collection.children.link(c); return c

# ---------------------------------------------------------------- set
c_set = coll('Set')
bpy.ops.import_scene.gltf(filepath=os.path.join(CACHE, 'set.glb'), import_shading='NORMALS')
for o in list(bpy.context.selected_objects):
    for c in o.users_collection: c.objects.unlink(o)
    c_set.objects.link(o)

def principled(mat):
    if not mat or not mat.use_nodes: return None
    return next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)

# physically plausible tuning of the exported real-time materials
for mat in bpy.data.materials:
    p = principled(mat)
    if not p: continue
    rough = p.inputs['Roughness']
    if not rough.is_linked: rough.default_value = max(0.08, rough.default_value)
    em = p.inputs['Emission Strength']
    if em.default_value > 0 and (p.inputs['Emission Color'].is_linked or max(p.inputs['Emission Color'].default_value[:3]) > 0):
        em.default_value *= float(os.environ.get('DZ_EMIT', '1.0'))   # LED strips and screens really light the room in Cycles

# floor: one dark, slightly glossy studio floor (the real-time mirror is replaced by real ray-traced reflections)
floor_info = next(s for s in meta['shaders'] if s['kind'].startswith('Reflector'))
bpy.ops.mesh.primitive_circle_add(vertices=128, radius=floor_info['params']['radius'], fill_type='NGON', location=(0, 0, -0.001))
floor = bpy.context.object; floor.name = 'Floor'
for c in floor.users_collection: c.objects.unlink(floor)
c_set.objects.link(floor)
fm = bpy.data.materials.new('Floor'); fm.use_nodes = True
fp = principled(fm)
fp.inputs['Base Color'].default_value = (0.012, 0.013, 0.016, 1)
fp.inputs['Roughness'].default_value = 0.22
fp.inputs['Coat Weight'].default_value = 0.6
fp.inputs['Coat Roughness'].default_value = 0.08
# subtle large-scale roughness variation so reflections look like a real polished floor, not a mirror
nt = fm.node_tree
noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 0.6; noise.inputs['Detail'].default_value = 6
ramp = nt.nodes.new('ShaderNodeMapRange'); ramp.inputs['To Min'].default_value = 0.16; ramp.inputs['To Max'].default_value = 0.32
nt.links.new(noise.outputs['Fac'], ramp.inputs['Value']); nt.links.new(ramp.outputs['Result'], fp.inputs['Roughness'])
floor.data.materials.append(fm)
# hide the exported real-time floor discs that sat under the mirror (large, flat, at floor level)
for o in c_set.objects:
    if o.type == 'MESH' and o is not floor:
        d = o.dimensions
        if d.z < 0.002 and min(d.x, d.y) > 20 and abs(o.matrix_world.translation.z) < 0.01:
            o.hide_render = o.hide_viewport = True

# the arc of light on the floor (a custom shader in real time) as a real emitter
for s in meta['shaders']:
    if not s['kind'].endswith('RingGeometry'): continue
    pr = s['params']
    bm_inner = pr['innerRadius']
    me = bpy.data.meshes.new('Floor arc')
    verts, faces = [], []
    n = 96
    for i in range(n + 1):
        a = pr['thetaStart'] + pr['thetaLength'] * i / n
        for r in (bm_inner, pr['outerRadius']): verts.append((r * math.cos(a), r * math.sin(a), 0))
    for i in range(n): faces.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    me.from_pydata(verts, [], faces)
    ring = bpy.data.objects.new('Floor arc', me)
    M = Matrix([s['matrix'][i::4] for i in range(4)])                  # three column-major -> rows
    conv = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    ring.matrix_world = conv @ M                                       # ring lies in its local XY plane
    ring.location.z = 0.002
    am = bpy.data.materials.new('Floor arc'); am.use_nodes = True
    ap = principled(am); ap.inputs['Base Color'].default_value = (0, 0, 0, 1)
    ap.inputs['Emission Color'].default_value = (1.0, 0.55, 0.22, 1); ap.inputs['Emission Strength'].default_value = 1.2 * s['uniforms'].get('uOpacity', 0.7)
    ap.inputs['Alpha'].default_value = 0.85
    me.materials.append(am)
    c_set.objects.link(ring)

# ---------------------------------------------------------------- lights (from the real-time rig, physical units)
c_light = coll('Lights')
def look(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
for i, L in enumerate(meta['lights']):
    t = L['type']
    if t == 'SpotLight':
        ld = bpy.data.lights.new(f'Spot {i}', 'SPOT')
        ld.energy = 4 * math.pi * L['intensity'] * K_LIGHT          # candela -> W (Cycles: P = 4π·I)
        ld.spot_size = 2 * L['angle']; ld.spot_blend = L['penumbra']
        ld.shadow_soft_size = 0.25                                  # real fixtures have a lens, not a point
    elif t == 'RectAreaLight':
        ld = bpy.data.lights.new(f'Softbox {i}', 'AREA')
        ld.shape = 'RECTANGLE'; ld.size, ld.size_y = L['width'], L['height']
        ld.energy = L['intensity'] * L['width'] * L['height'] * math.pi * K_LIGHT   # nits -> W
    else:
        continue                                                    # hemisphere/ambient: replaced by real bounce light
    ld.color = L['color']
    ob = bpy.data.objects.new(ld.name, ld); c_light.objects.link(ob)
    ob.location = L['pos']
    if t == 'SpotLight': look(ob, L['target'])
    else:
        d, u = Vector(L['quat']['dir']), Vector(L['quat']['up'])
        x = u.cross(-d).normalized()                                   # Blender area lights emit along local -Z
        ob.rotation_euler = Matrix((x, u, -d)).transposed().to_euler()

# world: the near-black studio, with a faint hemisphere fill
world = bpy.data.worlds.new('Studio'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.004, 0.005, 0.007, 1); bg.inputs['Strength'].default_value = 1.0
# haze: makes the spotlight beams visible like the real-time cones did, through real light scattering
if os.environ.get('DZ_HAZE', '1') == '1':
    vol = world.node_tree.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Density'].default_value = float(os.environ.get('DZ_HAZE_DENSITY', '0.003'))
    vol.inputs['Anisotropy'].default_value = 0.55
    world.node_tree.links.new(vol.outputs['Volume'], world.node_tree.nodes['World Output'].inputs['Volume'])

# ---------------------------------------------------------------- actors: meshes + point caches
c_act = coll('Presenters (stand-ins)')
NAMES = {0: "Andy'K (stand-in)", 1: 'Georgie (stand-in, no likeness)', 2: 'Assistant', 3: 'Operator'}
SRC = {'m019': 'Male_Adult_16', 'f005': 'Female_Adult_05', 'f009': 'Female_Adult_09', 'm027': 'Male_Adult_20'}

def tex_node(nt, path, srgb=True, x=-700, y=0):
    n = nt.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(path, check_existing=True)
    if not srgb: n.image.colorspace_settings.name = 'Non-Color'
    n.location = (x, y); return n

def avatar_material(name, info):
    """Skin and cloth from one texture: a colour key separates skin (subsurface) from fabric (sheen)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    out = nt.nodes['Material Output']; nt.nodes.remove(nt.nodes['Principled BSDF'])
    code = info['map'].split('_')[0]; part = 'head' if '_head_' in info['map'] else 'opacity' if 'opacity' in info['map'] else 'body'
    src = os.path.join(AV, 'source', SRC[code])
    col_path = os.path.join(AV, 'web', info['map']) if part != 'opacity' else os.path.join(src, f'{code}_opacity_color.tga')
    col = tex_node(nt, col_path, True, -900, 200)
    if part == 'opacity':
        b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        b.inputs['Roughness'].default_value = 0.42
        b.inputs['Coat Weight'].default_value = 0.0
        nt.links.new(col.outputs['Color'], b.inputs['Base Color'])
        nt.links.new(col.outputs['Alpha'], b.inputs['Alpha'])
        m.surface_render_method = 'DITHERED'
        nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
        return m
    nrm = tex_node(nt, os.path.join(src, f'{code}_{part}_normal.tga'), False, -900, -200)
    spec = tex_node(nt, os.path.join(src, f'{code}_{part}_specular.tga'), False, -900, -500)
    nmap = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nrm.outputs['Color'], nmap.inputs['Color'])
    # skin mask: warm, mid-saturated pixels
    hsv = nt.nodes.new('ShaderNodeSeparateColor'); hsv.mode = 'HSV'; nt.links.new(col.outputs['Color'], hsv.inputs['Color'])
    hue_ok = nt.nodes.new('ShaderNodeMath'); hue_ok.operation = 'LESS_THAN'; hue_ok.inputs[1].default_value = 0.11
    nt.links.new(hsv.outputs['Red'], hue_ok.inputs[0])
    sat_ok = nt.nodes.new('ShaderNodeMapRange'); sat_ok.inputs['From Min'].default_value = 0.14; sat_ok.inputs['From Max'].default_value = 0.26
    nt.links.new(hsv.outputs['Green'], sat_ok.inputs['Value'])
    mask = nt.nodes.new('ShaderNodeMath'); mask.operation = 'MULTIPLY'
    nt.links.new(hue_ok.outputs[0], mask.inputs[0]); nt.links.new(sat_ok.outputs['Result'], mask.inputs[1])
    # spec map -> roughness (brighter spec = smoother)
    inv = nt.nodes.new('ShaderNodeMapRange'); inv.inputs['To Min'].default_value = 0.75; inv.inputs['To Max'].default_value = 0.38
    nt.links.new(spec.outputs['Color'], inv.inputs['Value'])
    skin = nt.nodes.new('ShaderNodeBsdfPrincipled'); skin.subsurface_method = 'RANDOM_WALK_SKIN'
    skin.inputs['Subsurface Weight'].default_value = 0.35
    skin.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.18)
    skin.inputs['Subsurface Scale'].default_value = 0.012
    skin.inputs['Specular IOR Level'].default_value = 0.45
    skin.inputs['Coat Weight'].default_value = 0.08; skin.inputs['Coat Roughness'].default_value = 0.35
    cloth = nt.nodes.new('ShaderNodeBsdfPrincipled')
    cloth.inputs['Sheen Weight'].default_value = 0.6; cloth.inputs['Sheen Roughness'].default_value = 0.45
    cloth.inputs['Specular IOR Level'].default_value = 0.25
    for b in (skin, cloth):
        nt.links.new(col.outputs['Color'], b.inputs['Base Color'])
        nt.links.new(nmap.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(inv.outputs['Result'], skin.inputs['Roughness'])
    cloth.inputs['Roughness'].default_value = 0.88
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(mask.outputs[0], mix.inputs['Fac']); nt.links.new(cloth.outputs['BSDF'], mix.inputs[1]); nt.links.new(skin.outputs['BSDF'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    return m

for a in meta['actors']:
    i, n = a['i'], a['verts']
    with open(os.path.join(CACHE, f'actor{i}.pc2'), 'rb') as f:
        f.seek(32); first = struct.unpack(f'<{n * 3}f', f.read(n * 12))
    uv = struct.unpack(f'<{n * 2}f', open(os.path.join(CACHE, f'actor{i}.uv.bin'), 'rb').read())
    verts = [first[k * 3:k * 3 + 3] for k in range(n)]
    faces = [(k, k + 1, k + 2) for k in range(0, n, 3)]                # non-indexed triangles, in three's order
    me = bpy.data.meshes.new(NAMES[i]); me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name='UVMap')
    for loop in me.loops:
        v = loop.vertex_index; uvl.data[loop.index].uv = (uv[v * 2], uv[v * 2 + 1])
    for k, info in enumerate(a['materials']): me.materials.append(avatar_material(f'{NAMES[i]} {k}', info))
    for g in a['groups']:
        for fi in range(g['start'] // 3, (g['start'] + g['count']) // 3): me.polygons[fi].material_index = g['materialIndex']
    me.shade_smooth()
    ob = bpy.data.objects.new(NAMES[i], me); c_act.objects.link(ob)
    mc = ob.modifiers.new('Motion (from the opening)', 'MESH_CACHE')
    mc.cache_format = 'PC2'; mc.filepath = os.path.join(CACHE, f'actor{i}.pc2'); mc.frame_start = 1
    mc.forward_axis, mc.up_axis = 'POS_Y', 'POS_Z'
    w = ob.modifiers.new('Weld seams', 'WELD'); w.merge_threshold = 0.0002
    sm = ob.modifiers.new('Smooth', 'SUBSURF'); sm.levels = 0; sm.render_levels = 1
    if not a['visible']: ob.hide_render = ob.hide_viewport = True
    # actors hidden on some frames
    vis = [fr[i] for fr in meta['actorVisible']]
    if not all(vis) and any(vis):
        for fr, v in enumerate(vis):
            ob.hide_render = not v; ob.keyframe_insert('hide_render', frame=fr + 1)

# ---------------------------------------------------------------- camera (frame-exact from the opening)
cd = bpy.data.cameras.new('Opening camera'); cam = bpy.data.objects.new('Opening camera', cd)
scene.collection.objects.link(cam); scene.camera = cam
cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 24
conv = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
for fr, c in enumerate(meta['camera']):
    M = Matrix([c['m'][r::4] for r in range(4)])
    cam.matrix_world = conv @ M
    cd.angle_y = math.radians(c['fov'])
    cam.keyframe_insert('location', frame=fr + 1); cam.keyframe_insert('rotation_euler', frame=fr + 1)
    cd.keyframe_insert('lens', frame=fr + 1)
cd.clip_start, cd.clip_end = 0.05, 200
cd.dof.use_dof = True; cd.dof.aperture_fstop = 4.0                  # gentle depth of field, focused on the walking presenter
cd.dof.focus_distance = 5.5

# ---------------------------------------------------------------- render: 4K UHD, 30 fps, Cycles on the Apple GPU
r = scene.render
r.engine = 'CYCLES'
r.resolution_x, r.resolution_y, r.resolution_percentage = 3840, 2160, 100
r.image_settings.file_format = 'PNG'; r.image_settings.color_depth = '16'
r.filepath = os.path.join(HERE, 'renders', 'test-4k', 'f####')
r.use_motion_blur = True; r.motion_blur_shutter = 0.5               # 180° shutter, like a film camera
cy = scene.cycles
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'; prefs.refresh_devices()
for d in prefs.devices: d.use = True
cy.device = 'GPU'
cy.samples = int(os.environ.get('DZ_SAMPLES', '256')); cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.02
cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'
cy.max_bounces = 8; cy.diffuse_bounces = 3; cy.glossy_bounces = 4; cy.transmission_bounces = 6; cy.volume_bounces = 1
cy.sample_clamp_indirect = 8
cy.use_auto_tile = True; cy.tile_size = 1024                          # keeps memory in check on 8 GB
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = float(os.environ.get('DZ_EXPOSURE', '0.0'))

# light bloom on the LEDs and screens, like a real camera lens
tree = bpy.data.node_groups.new('DZ compositor', 'CompositorNodeTree')
tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
rl = tree.nodes.new('CompositorNodeRLayers'); out = tree.nodes.new('NodeGroupOutput')
gl = tree.nodes.new('CompositorNodeGlare')
for k, v in (('Type', 'Bloom'), ('Quality', 'High')):
    if k in gl.inputs: gl.inputs[k].default_value = v
for k, v in (('Strength', 0.35), ('Size', 0.6), ('Threshold', 1.0)):
    if k in gl.inputs: gl.inputs[k].default_value = v
tree.links.new(rl.outputs['Image'], gl.inputs['Image']); tree.links.new(gl.outputs['Image'], out.inputs[0])
scene.compositing_node_group = tree

os.makedirs(os.path.join(HERE, 'renders'), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'opening-45-50.blend'), relative_remap=True)
print('BUILD OK', len(scene.objects), 'objects,', FRAMES, 'frames')
