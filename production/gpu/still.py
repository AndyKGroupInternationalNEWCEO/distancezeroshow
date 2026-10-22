# Test stills of the DJ room in Cycles on the GPU pod: the exported club (export-probes.mjs: the booth down,
# PERFORMANCE light) from the DJ cameras in cache/probes.json, at 1920 × 1080, to measure the time per frame and judge
# the look before a whole opening is rendered. DZ_FOG > 0 fills the room with haze (a volume) so the beams show.
#   blender -b -P production/gpu/still.py            (DZ_SAMPLES=256, DZ_FOG=0.0, DZ_K=2.0, DZ_CAMS=DJ1,DJ2)
import bpy, json, math, os, time
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, os.environ.get('DZ_CACHE', 'cache'))
SAMPLES = int(os.environ.get('DZ_SAMPLES', '256'))
FOG = float(os.environ.get('DZ_FOG', '0'))
K_LIGHT = float(os.environ.get('DZ_K', '2.0'))
meta = json.load(open(os.path.join(CACHE, 'probes.json')))
CAMS = os.environ.get('DZ_CAMS', ','.join(meta['cams'])).split(',')
TAG = os.environ.get('DZ_TAG', f's{SAMPLES}-f{FOG}')

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=os.path.join(CACHE, 'scene.glb'))
for o in scene.objects:
    if o.type == 'LIGHT':
        o.data.energy *= K_LIGHT
        if o.data.type == 'SPOT': o.data.shadow_soft_size = 0.05
world = bpy.data.worlds.new('black'); world.use_nodes = True
nt = world.node_tree; nt.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
if FOG > 0:   # the club's haze: a thin volume in the whole world, lit by the spots and lasers
    vol = nt.nodes.new('ShaderNodeVolumePrincipled'); vol.inputs['Density'].default_value = FOG; vol.inputs['Anisotropy'].default_value = 0.3
    nt.links.new(vol.outputs[0], nt.nodes['World Output'].inputs['Volume'])
scene.world = world

scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
for kind in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = kind; prefs.get_devices()
        if any(d.type == kind for d in prefs.devices): break
    except Exception: pass
for d in prefs.devices: d.use = d.type != 'CPU'
scene.cycles.device = 'GPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.cycles.volume_step_rate = 4.0
scene.view_settings.view_transform = 'AgX'
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.render.image_settings.file_format = 'PNG'

cam_data = bpy.data.cameras.new('still'); cam = bpy.data.objects.new('still', cam_data)
scene.collection.objects.link(cam); scene.camera = cam
b = lambda p: Vector((p[0], -p[2], p[1]))       # three.js (x, y, z) → Blender (x, −z, y)
for name in CAMS:
    c = meta['cams'][name]
    cam.location = b(c['pos'])
    cam.rotation_euler = (b(c['target']) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam_data.sensor_fit = 'VERTICAL'; cam_data.angle_y = math.radians(c['fov'])
    scene.render.filepath = os.path.join(CACHE, f'still-{name}-{TAG}.png')
    t = time.time(); bpy.ops.render.render(write_still=True)
    print(f'still {name} {TAG}: {time.time() - t:.1f} s')
