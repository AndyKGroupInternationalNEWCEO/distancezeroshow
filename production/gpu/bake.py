# The light of the reception and the building, baked in Cycles on the GPU pod: everything the real-time picture
# cannot do there (light bouncing off the marble, the walls and the furniture, soft shadows, the chandelier's warmth
# in the room, the canopy and the uplights on the concrete). Reads cache-bake/places.glb (export-bake.mjs), gives
# each named mesh (bkL… inside the doors, bkS… outside) a second UV set packed into one atlas per side, bakes the
# light that falls on them (direct and indirect, without their own colour) and writes:
#   cache-bake/places-baked.glb   the meshes with both UV sets (TEXCOORD_1: the atlas), their materials, their extras
#   cache-bake/lm-lobby.png, lm-street.png   the light, sRGB-encoded after dividing by DZ_LM_SCALE (the page multiplies)
#   blender -b -P production/gpu/bake.py            (DZ_SAMPLES=768, DZ_LM=2048, DZ_K=2.0, DZ_LM_SCALE=6)
import bpy, json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache-bake')
SAMPLES = int(os.environ.get('DZ_SAMPLES', '768'))
SIZE = int(os.environ.get('DZ_LM', '2048'))
K_LIGHT = float(os.environ.get('DZ_K', '2.0'))          # the real-time intensities, calibrated as probes.py
SCALE = float(os.environ.get('DZ_LM_SCALE', '6'))       # light above this (in the atlas) is clipped
HDR = os.path.join(HERE, '..', '..', 'assets', 'cc0', 'modern_buildings_night_1k.hdr')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=os.path.join(CACHE, 'places.glb'))

for o in scene.objects:
    if o.type == 'LIGHT':
        o.data.energy *= K_LIGHT
        if o.data.type == 'SPOT': o.data.shadow_soft_size = 0.08
        if o.data.type == 'POINT': o.data.shadow_soft_size = 0.15
# the night city round the building (as the page's sky), weak: it is night
world = bpy.data.worlds.new('night'); world.use_nodes = True
nt = world.node_tree; bg = nt.nodes['Background']
if os.path.exists(HDR):
    env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(HDR); nt.links.new(env.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 0.25
scene.world = world

scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
for kind in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = kind; prefs.get_devices()
        if any(d.type == kind for d in prefs.devices): break
    except Exception: pass
for d in prefs.devices: d.use = d.type != 'CPU'
print('devices:', [(d.name, d.type, d.use) for d in prefs.devices])
scene.cycles.device = 'GPU'
scene.cycles.samples = SAMPLES
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 4

targets = [o for o in scene.objects if o.type == 'MESH' and o.name[:3] in ('bkL', 'bkS') and o.data.users == 1]
print('targets', len(targets))
# the transforms into the vertices (an even light-map resolution across the whole place), a second UV set
bpy.ops.object.select_all(action='DESELECT')
for o in targets: o.select_set(True)
bpy.context.view_layer.objects.active = targets[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in targets:
    if not o.data.uv_layers: o.data.uv_layers.new(name='UVMap')
    lm = o.data.uv_layers.new(name='LM'); o.data.uv_layers.active = lm

def bake_side(prefix, name):
    objs = [o for o in targets if o.name.startswith(prefix)]
    if not objs: return
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new('lm-' + name, SIZE, SIZE, float_buffer=True, alpha=False)
    # each material: an image node (the bake's target), active, not connected
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if not m: continue
            m.use_nodes = True
            n = m.node_tree.nodes.get('dz-lm') or m.node_tree.nodes.new('ShaderNodeTexImage'); n.name = 'dz-lm'
            n.image = img; m.node_tree.nodes.active = n
    scene.render.bake.use_pass_direct = True; scene.render.bake.use_pass_indirect = True; scene.render.bake.use_pass_color = False
    scene.render.bake.margin = 6; scene.render.bake.target = 'IMAGE_TEXTURES'
    bpy.ops.object.bake(type='DIFFUSE')
    px = np.array(img.pixels[:], dtype=np.float32).reshape(SIZE, SIZE, 4)
    # a light denoise: a small blur weighted to the baked texels (the margins already filled by the bake)
    rgb = px[..., :3]
    k = np.array([1, 4, 6, 4, 1], dtype=np.float32); k /= k.sum()
    for axis in (0, 1): rgb = sum(np.roll(rgb, i - 2, axis=axis) * k[i] for i in range(5))
    print(name, 'light: mean', float(rgb.mean()), 'p99', float(np.percentile(rgb, 99)))
    enc = np.clip(rgb / SCALE, 0, 1) ** (1 / 2.2)
    out = bpy.data.images.new('png-' + name, SIZE, SIZE, alpha=False)
    out.pixels[:] = np.dstack([enc, np.ones((SIZE, SIZE, 1), np.float32)]).ravel().tolist()
    out.filepath_raw = os.path.join(CACHE, f'lm-{name}.png'); out.file_format = 'PNG'; out.save()
    # the image nodes go (the export carries only what feeds the shader anyway)
    for o in objs:
        for slot in o.material_slots:
            if slot.material and slot.material.node_tree.nodes.get('dz-lm'): slot.material.node_tree.nodes.remove(slot.material.node_tree.nodes['dz-lm'])

bake_side('bkL', 'lobby')
bake_side('bkS', 'street')

# the baked meshes alone, with both UV sets and their extras (where they were, how many vertices: the page's key)
bpy.ops.object.select_all(action='DESELECT')
for o in targets:
    o.select_set(True); o.data.uv_layers.active_index = 0
    for i, uv in enumerate(o.data.uv_layers): uv.active_render = (i == 0)
bpy.ops.export_scene.gltf(filepath=os.path.join(CACHE, 'places-baked.glb'), export_format='GLB', use_selection=True, export_extras=True,
                          export_texcoords=True, export_normals=True, export_lights=False, export_cameras=False, export_image_format='AUTO')
print('baked', len(targets), 'meshes')
