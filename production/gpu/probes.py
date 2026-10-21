# Reflection probes for the live studio, rendered in Cycles on the GPU pod: for each probe in cache/probes.json a
# 360° HDR picture of the two-level studio (export-probes.mjs: the booth down, PERFORMANCE light), seen from there.
# The live page turns each into the reflections of the materials around that point (probes.js), in place of the
# generic studio environment: the club's LED walls, lights and booth then really appear in the lacquer and metal.
#   blender -b -P production/gpu/probes.py            (DZ_SAMPLES=512, DZ_SIZE=1024, DZ_K=2.0)
# Output: cache/probe-<name>.exr (float), probe-<name>.f16 (raw half floats, RGB, row 0 at the top: what the page
# loads) and probe-<name>.png (a tone-mapped look to check it by eye).
import bpy, json, math, os, struct

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, os.environ.get('DZ_CACHE', 'cache'))   # cache-up: the booth up in the studio
SAMPLES = int(os.environ.get('DZ_SAMPLES', '512'))
W = int(os.environ.get('DZ_SIZE', '1024'))
K_LIGHT = float(os.environ.get('DZ_K', '2.0'))   # the exported real-time light intensities, calibrated as build.py does
meta = json.load(open(os.path.join(CACHE, 'probes.json')))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=os.path.join(CACHE, 'scene.glb'))

# lights: the real-time ones, scaled; the world black (the studio is a closed room)
for o in scene.objects:
    if o.type == 'LIGHT':
        o.data.energy *= K_LIGHT
        if o.data.type == 'SPOT': o.data.shadow_soft_size = 0.05
world = bpy.data.worlds.new('black'); world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
scene.world = world

# Cycles on the pod's GPU (OptiX when there is one, CUDA otherwise)
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
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.view_settings.view_transform = 'Standard'
scene.render.resolution_x, scene.render.resolution_y = W, W // 2
scene.render.image_settings.file_format = 'OPEN_EXR'
scene.render.image_settings.color_depth = '32'
scene.render.image_settings.color_mode = 'RGB'

# a 360° camera. Its centre looks along three.js +X (Blender +X): the page's mapping is checked against that
cam_data = bpy.data.cameras.new('probe'); cam_data.type = 'PANO'
try: cam_data.panorama_type = 'EQUIRECTANGULAR'
except Exception: cam_data.cycles.panorama_type = 'EQUIRECTANGULAR'
cam = bpy.data.objects.new('probe', cam_data); scene.collection.objects.link(cam); scene.camera = cam
cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)

for name, (x, y, z) in meta['probes'].items():
    cam.location = (x, -z, y)                    # three.js (x, y, z) → Blender (x, −z, y)
    exr = os.path.join(CACHE, f'probe-{name}.exr')
    scene.render.filepath = exr
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(exr); w, h = img.size; px = img.pixels[:]    # RGBA floats, row 0 at the bottom
    with open(os.path.join(CACHE, f'probe-{name}.f16'), 'wb') as f:
        for row in range(h - 1, -1, -1):
            base = row * w * 4
            f.write(struct.pack(f'<{w * 3}e', *[min(65000.0, px[base + i * 4 + c]) for i in range(w) for c in range(3)]))
    # a look by eye: Reinhard on the luminance, sRGB
    look = bpy.data.images.new(f'look-{name}', w, h)
    look.pixels[:] = [((v / (1 + v)) ** (1 / 2.2) if c < 3 else 1.0) for i in range(w * h) for c, v in enumerate((px[i * 4], px[i * 4 + 1], px[i * 4 + 2], 1.0))]
    look.filepath_raw = os.path.join(CACHE, f'probe-{name}.png'); look.file_format = 'PNG'; look.save()
    print('probe', name, 'done', w, h)
