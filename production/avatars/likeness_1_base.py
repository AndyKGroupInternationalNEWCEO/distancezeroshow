# Likeness, step 1 (in Blender): an MPFB human with every face target loaded at 0, and a front render of the head
# for MediaPipe, so its landmarks can be found on the 3D head.
#   blender -b -P avatars/likeness_1_base.py -- <out folder> <macro json>
import bpy, sys, os, json, glob
from mathutils import Vector
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

out, macro = sys.argv[sys.argv.index('--') + 1:][:2]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
human = HumanService.create_human(macro_detail_dict=json.load(open(macro)), feet_on_ground=True, scale=0.1)
human.name = 'Likeness'

# the face's shape parameters: every target of these groups, loaded at weight 0 (the fit sets them)
TDIR = os.path.join(os.path.dirname(sys.modules['bl_ext.user_default.mpfb'].__file__), 'data', 'targets')
GROUPS = ['cheek', 'chin', 'ears', 'eyebrows', 'eyes', 'forehead', 'head', 'mouth', 'nose']
names = []
for g in GROUPS:
    for f in sorted(glob.glob(os.path.join(TDIR, g, '*.target.gz'))):
        n = os.path.basename(f).replace('.target.gz', '')
        TargetService.load_target(human, f, weight=0.0, name=n)
        names.append(n)
json.dump(names, open(os.path.join(out, 'targets.json'), 'w'))

# head bounds (vertex group "head" if present, else the top of the body)
dg = bpy.context.evaluated_depsgraph_get()
me = human.evaluated_get(dg).to_mesh()
zs = [v.co.z for v in me.vertices]
top = max(zs)
head = [human.matrix_world @ v.co for v in me.vertices if v.co.z > top - 0.26]
lo = Vector((min(p.x for p in head), min(p.y for p in head), min(p.z for p in head)))
hi = Vector((max(p.x for p in head), max(p.y for p in head), max(p.z for p in head)))
c = (lo + hi) / 2
human.evaluated_get(dg).to_mesh_clear()

# clay material and soft frontal light: MediaPipe finds faces on clay renders
mat = bpy.data.materials.new('Clay'); mat.use_nodes = True
p = mat.node_tree.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = (0.62, 0.5, 0.44, 1); p.inputs['Roughness'].default_value = 0.6
human.data.materials.clear(); human.data.materials.append(mat)
for o in bpy.data.objects:
    if o.type == 'MESH' and o is not human: o.hide_render = True
w = bpy.data.worlds.new('W'); bpy.context.scene.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.25
for pos, e in (((0.0, -1.6, c.z + 0.25), 220), ((-0.9, -1.2, c.z), 90), ((0.9, -1.2, c.z), 90)):
    ld = bpy.data.lights.new('L', 'AREA'); ld.energy = e; ld.size = 1.2
    lo_ = bpy.data.objects.new('L', ld); bpy.context.scene.collection.objects.link(lo_); lo_.location = pos
    lo_.rotation_euler = (Vector((c.x, c.y, c.z)) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()

# front camera on the face (MPFB faces -Y), orthographic so pixel -> ray is exact
cd = bpy.data.cameras.new('Front'); cd.type = 'ORTHO'; cd.ortho_scale = (hi.z - lo.z) * 1.15
cam = bpy.data.objects.new('Front', cd); bpy.context.scene.collection.objects.link(cam)
cam.location = (c.x, lo.y - 1.0, c.z); cam.rotation_euler = (1.5708, 0, 0)
sc = bpy.context.scene; sc.camera = cam
sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.device = 'CPU'
sc.render.resolution_x = sc.render.resolution_y = 1024
sc.render.filepath = os.path.join(out, 'base-front.png')
bpy.ops.render.render(write_still=True)
json.dump({'cam': list(cam.location), 'ortho': cd.ortho_scale, 'res': 1024}, open(os.path.join(out, 'base-camera.json'), 'w'))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'likeness.blend'))
print('BASE OK', len(names), 'targets')
