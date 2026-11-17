"""Render the rigged Trooper as smooth, cel-shaded side-view sprites (comic style, no pixelation).

Run:  python3 -I tools/blender/render_sprites.py <trooper_rigged.blend> <albedo.png> <out_dir> [anim,anim,...]
Writes <out_dir>/trooper.png (sprite sheet) + trooper.json (frames, anims, hand anchors).

Pose convention (same as the old pixel puppet, degrees):
  tF/tB thigh swing (+ forward), kF/kB knee bend, aF/aB arm swing (+ forward, 180 = straight up),
  eF/eB elbow bend (+ forearm forward), lean (+ forward), head, hipY (px, + down), dx (px).
  F = near side (left, .L), B = far side (.R).
"""
import json
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ARGS = sys.argv[1:]
BLEND, ALBEDO, OUT = ARGS[:3]
ONLY = ARGS[3].split(',') if len(ARGS) > 3 else None

FW = FH = 256           # frame size in px
FEET_Y = 236            # floor line in the frame
PX_PER_UNIT = 84.0      # 1.9-unit character -> ~160 px tall
FLOOR_Z = -0.952
PUPPET_PX = 2 / PX_PER_UNIT  # pose offsets are in the old puppet's pixels (half this sprite's scale)


# ------------------------------------------------------------------ scene setup
def setup():
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = FW, FH
    sc.render.film_transparent = True
    sc.render.filter_size = 1.5
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    try:
        sc.eevee.taa_render_samples = 16
    except Exception:
        pass

    mesh = bpy.data.objects['Trooper']
    rig = bpy.data.objects['TrooperRig']

    # --- toon material: flat light bands x albedo, plus red/blue rim light
    mat = bpy.data.materials.new('Toon')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    N = nt.nodes.new
    L = nt.links.new
    out = N('ShaderNodeOutputMaterial')
    tex = N('ShaderNodeTexImage'); tex.image = bpy.data.images.load(ALBEDO); tex.interpolation = 'Linear'
    diff = N('ShaderNodeBsdfDiffuse'); diff.inputs['Color'].default_value = (1, 1, 1, 1)
    s2r = N('ShaderNodeShaderToRGB')
    bw = N('ShaderNodeRGBToBW')
    ramp = N('ShaderNodeValToRGB'); r = ramp.color_ramp; r.interpolation = 'CONSTANT'
    r.elements[0].position = 0.0; r.elements[0].color = (0.62, 0.60, 0.72, 1)   # shadow (cool)
    r.elements[1].position = 0.15; r.elements[1].color = (0.95, 0.94, 0.96, 1)  # mid
    e = r.elements.new(0.5); e.color = (1.22, 1.2, 1.16, 1)                        # light
    mul = N('ShaderNodeMixRGB'); mul.blend_type = 'MULTIPLY'; mul.inputs['Fac'].default_value = 1
    # rim: edge mask from the facing ratio, split left/right in camera space
    lw = N('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.25
    rimramp = N('ShaderNodeValToRGB'); rr = rimramp.color_ramp; rr.interpolation = 'CONSTANT'
    rr.elements[0].color = (0, 0, 0, 1); rr.elements[1].position = 0.5; rr.elements[1].color = (1, 1, 1, 1)
    geo = N('ShaderNodeNewGeometry')
    vt = N('ShaderNodeVectorTransform'); vt.vector_type = 'NORMAL'; vt.convert_from = 'WORLD'; vt.convert_to = 'CAMERA'
    sep = N('ShaderNodeSeparateXYZ')
    red_side = N('ShaderNodeMath'); red_side.operation = 'MULTIPLY'; red_side.inputs[1].default_value = -4; red_side.use_clamp = True
    blue_side = N('ShaderNodeMath'); blue_side.operation = 'MULTIPLY'; blue_side.inputs[1].default_value = 4; blue_side.use_clamp = True
    redm = N('ShaderNodeMath'); redm.operation = 'MULTIPLY'
    bluem = N('ShaderNodeMath'); bluem.operation = 'MULTIPLY'
    redc = N('ShaderNodeMixRGB'); redc.blend_type = 'ADD'; redc.inputs['Color2'].default_value = (0.95, 0.18, 0.22, 1)
    bluec = N('ShaderNodeMixRGB'); bluec.blend_type = 'ADD'; bluec.inputs['Color2'].default_value = (0.25, 0.62, 1.0, 1)
    emit = N('ShaderNodeEmission')
    L(diff.outputs[0], s2r.inputs[0]); L(s2r.outputs['Color'], bw.inputs[0]); L(bw.outputs[0], ramp.inputs[0])
    L(tex.outputs['Color'], mul.inputs['Color1']); L(ramp.outputs['Color'], mul.inputs['Color2'])
    L(lw.outputs['Facing'], rimramp.inputs[0])
    L(geo.outputs['Normal'], vt.inputs[0]); L(vt.outputs[0], sep.inputs[0])
    L(sep.outputs['X'], red_side.inputs[0]); L(sep.outputs['X'], blue_side.inputs[0])
    L(rimramp.outputs['Color'], redm.inputs[0]); L(red_side.outputs[0], redm.inputs[1])
    L(rimramp.outputs['Color'], bluem.inputs[0]); L(blue_side.outputs[0], bluem.inputs[1])
    L(mul.outputs[0], redc.inputs['Color1']); L(redm.outputs[0], redc.inputs['Fac'])
    L(redc.outputs[0], bluec.inputs['Color1']); L(bluem.outputs[0], bluec.inputs['Fac'])
    redc.inputs['Fac'].default_value = 0
    L(bluec.outputs[0], emit.inputs['Color'])
    L(emit.outputs[0], out.inputs['Surface'])
    # only edges get rim: scale the side masks down so the fill stays readable
    for m in (redm, bluem):
        m2 = N('ShaderNodeMath'); m2.operation = 'MULTIPLY'; m2.inputs[1].default_value = 0.85
        L(m.outputs[0], m2.inputs[0])
        target = redc if m is redm else bluec
        L(m2.outputs[0], target.inputs['Fac'])

    # --- ink outline: inverted hull
    ink = bpy.data.materials.new('Ink')
    ink.use_nodes = True
    ink.use_backface_culling = True
    n2 = ink.node_tree
    n2.nodes.clear()
    o2 = n2.nodes.new('ShaderNodeOutputMaterial')
    em2 = n2.nodes.new('ShaderNodeEmission'); em2.inputs['Color'].default_value = (0.055, 0.04, 0.08, 1)
    n2.links.new(em2.outputs[0], o2.inputs['Surface'])

    mesh.data.materials.clear()
    mesh.data.materials.append(mat)
    mesh.data.materials.append(ink)
    sol = mesh.modifiers.new('Outline', 'SOLIDIFY')
    sol.thickness = 0.034
    sol.offset = 1
    sol.use_flip_normals = True
    sol.material_offset = 1
    sol.use_rim = False
    # --- light (only drives the toon bands) + camera on +X looking at the side
    sun = bpy.data.lights.new('Key', 'SUN'); sun.energy = 3.2
    so = bpy.data.objects.new('Key', sun); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), math.radians(-25), math.radians(70))  # from the front-top
    w = bpy.data.worlds.new('W'); sc.world = w; w.color = (0.12, 0.12, 0.14)
    cam = bpy.data.cameras.new('Cam'); cam.type = 'ORTHO'; cam.ortho_scale = FW / PX_PER_UNIT
    co = bpy.data.objects.new('Cam', cam); sc.collection.objects.link(co); sc.camera = co
    cz = FLOOR_Z + (FEET_Y - FH / 2) / PX_PER_UNIT
    co.location = (6, 0, cz)
    co.rotation_euler = (math.radians(90), 0, math.radians(90))
    return sc, rig, co


# ------------------------------------------------------------------ posing
BASE = dict(hipY=0, dx=0, lean=4, tF=6, kF=6, tB=-6, kB=4, aF=10, eF=40, aB=-10, eB=30, head=0)


def P(**kw):
    d = dict(BASE); d.update(kw); return d


def apply_pose(rig, p):
    pb = rig.pose.bones
    for b in pb:
        b.rotation_mode = 'XYZ'
        b.rotation_euler = (0, 0, 0)
        b.location = (0, 0, 0)
    R = math.radians
    # the bind pose has legs spread and arms hanging out; swing angles are about each bone's local X
    pb['thigh.L'].rotation_euler.x = R(p['tF']); pb['shin.L'].rotation_euler.x = R(-p['kF'])
    pb['thigh.R'].rotation_euler.x = R(p['tB']); pb['shin.R'].rotation_euler.x = R(-p['kB'])
    pb['foot.L'].rotation_euler.x = R(-(p['tF'] - p['kF']) * 0.6)
    pb['foot.R'].rotation_euler.x = R(-(p['tB'] - p['kB']) * 0.6)
    # pull the wide stance in a little so the side silhouette reads as one figure
    pb['thigh.L'].rotation_euler.z = R(-5); pb['thigh.R'].rotation_euler.z = R(5)
    pb['upper_arm.L'].rotation_euler.x = R(p['aF']); pb['forearm.L'].rotation_euler.x = R(p['eF'])
    pb['upper_arm.R'].rotation_euler.x = R(p['aB']); pb['forearm.R'].rotation_euler.x = R(p['eB'])
    pb['upper_arm.L'].rotation_euler.z = R(8); pb['upper_arm.R'].rotation_euler.z = R(-8)
    pb['spine'].rotation_euler.x = R(p['lean'] * 0.5); pb['chest'].rotation_euler.x = R(p['lean'] * 0.5)
    pb['head'].rotation_euler.x = R(p['head'] - p['lean'] * 0.4)
    # root moves the whole body: +hipY = down (px), +dx = forward (px). Forward is -Y in world.
    rig.location = (0, -p.get('dx', 0) * PUPPET_PX, -p['hipY'] * PUPPET_PX)


def anchors(sc, rig, cam):
    """Hand (grip) position in frame pixels + forearm direction in the puppet's angle convention."""
    pb = rig.pose.bones
    mw = rig.matrix_world
    elbow = mw @ pb['forearm.L'].head
    wrist = mw @ pb['hand.L'].head
    grip = mw @ (pb['hand.L'].head * 0.5 + pb['hand.L'].tail * 0.5)
    def px(v):
        c = world_to_camera_view(sc, cam, v)
        return (c.x * FW, (1 - c.y) * FH)
    e, wr, g = px(elbow), px(wrist), px(grip)
    dx, dy = wr[0] - e[0], wr[1] - e[1]
    ang = math.degrees(math.atan2(dx, dy))
    return [round(g[0], 1), round(g[1], 1)], round(ang, 1)


# ------------------------------------------------------------------ animation library (same names as the game uses)
def anims():
    A = {}
    A['idle'] = ([P(hipY=b, aF=10 + b * 3, aB=-10 - b * 2, lean=4 + b) for b in (0, 0.5, 1, 1.5, 1, 0.5)], 6, True)
    run = []
    for i in range(10):
        ph = i / 10 * 2 * math.pi
        s, c = math.sin(ph), math.cos(ph)
        run.append(P(lean=16, hipY=-1 - round(abs(c) * 3),
                     tF=38 * s, kF=8 + 70 * max(0, -c) if s < 0 else 8 + 22 * max(0, c),
                     tB=-38 * s, kB=8 + 70 * max(0, c) if s > 0 else 8 + 22 * max(0, -c),
                     aF=-40 * s, eF=70, aB=40 * s, eB=70, head=-6))
    A['run'] = (run, 16, True)
    A['jump'] = ([P(lean=8, hipY=-4, tF=50, kF=85, tB=-12, kB=45, aF=-35, eF=80, aB=40, eB=50),
                  P(lean=4, hipY=-4, tF=36, kF=70, tB=0, kB=55, aF=-70, eF=70, aB=60, eB=40)], 8, False)
    A['fall'] = ([P(lean=0, hipY=-2, tF=22, kF=22, tB=-16, kB=34, aF=70, eF=40, aB=-60, eB=30),
                  P(lean=0, hipY=-2, tF=26, kF=26, tB=-12, kB=38, aF=80, eF=36, aB=-70, eB=24)], 8, True)
    A['land'] = ([P(lean=14, hipY=10, tF=55, kF=100, tB=-22, kB=75, aF=35, eF=60, aB=-20, eB=40),
                  P(lean=8, hipY=4, tF=30, kF=50, tB=-14, kB=40, aF=20, eF=50, aB=-14, eB=34)], 16, False)
    A['roll'] = ('ROLL', 22, False)
    A['wallslide'] = ([P(lean=-6, tF=24, kF=44, tB=-4, kB=22, aF=150, eF=20, aB=-20, eB=40, hipY=-2),
                       P(lean=-6, tF=26, kF=46, tB=-2, kB=24, aF=152, eF=18, aB=-22, eB=42, hipY=-2)], 6, True)
    A['ledgehang'] = ([P(lean=-4, tF=8, kF=12, tB=-4, kB=18, aF=172, eF=0, aB=166, eB=0, head=-10)], 1, True)
    A['climb'] = ([P(lean=20, hipY=2, tF=60, kF=90, tB=10, kB=60, aF=160, eF=-20, aB=150, eB=-10),
                   P(lean=30, hipY=6, tF=90, kF=120, tB=40, kB=100, aF=120, eF=-40, aB=110, eB=-30),
                   P(lean=24, hipY=4, tF=70, kF=110, tB=20, kB=90, aF=40, eF=30, aB=10, eB=20)], 12, False)
    A['saber1'] = ([P(lean=-4, tF=14, kF=10, tB=-14, kB=10, aF=-150, eF=-20, aB=-20, eB=30),
                    P(lean=16, tF=28, kF=22, tB=-22, kB=10, aF=80, eF=10, aB=-30, eB=40),
                    P(lean=18, tF=30, kF=26, tB=-24, kB=12, aF=30, eF=30, aB=-30, eB=40)], 18, False)
    A['saber2'] = ([P(lean=10, tF=24, kF=16, tB=-20, kB=10, aF=30, eF=40, aB=-20, eB=30),
                    P(lean=6, tF=20, kF=14, tB=-18, kB=10, aF=140, eF=10, aB=-30, eB=30),
                    P(lean=2, tF=18, kF=12, tB=-16, kB=10, aF=170, eF=-10, aB=-30, eB=30)], 18, False)
    A['saber3'] = ([P(lean=-8, hipY=-2, tF=10, kF=20, tB=-10, kB=20, aF=175, eF=0, aB=150, eB=0),
                    P(lean=26, hipY=6, tF=46, kF=62, tB=-32, kB=20, aF=70, eF=0, aB=50, eB=20),
                    P(lean=24, hipY=7, tF=48, kF=66, tB=-32, kB=20, aF=50, eF=10, aB=40, eB=20)], 14, False)
    A['shoot'] = ([P(lean=2, aF=90, eF=0, aB=-14, eB=40), P(lean=0, aF=96, eF=-6, aB=-16, eB=40, dx=-2)], 16, False)
    A['hurt'] = ([P(lean=-18, hipY=1, tF=16, kF=20, tB=-16, kB=10, aF=-40, eF=60, aB=-50, eB=40, head=-16)], 1, False)
    A['death'] = ('DEATH', 6, False)
    return A


def render_frame(sc, rig, cam, pose, path):
    apply_pose(rig, pose)
    bpy.context.view_layer.update()
    hand, ang = anchors(sc, rig, cam)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return hand, ang


def main():
    sc, rig, cam = setup()
    tmp = os.path.join(OUT, '_frames')
    os.makedirs(tmp, exist_ok=True)
    lib = anims()
    names = list(lib) if not ONLY or ONLY == ['test'] else ONLY
    if ONLY == ['test']:
        names = ['idle', 'run', 'saber1', 'jump']
    meta = []
    for name in names:
        poses, fps, loop = lib[name]
        if poses == 'ROLL':
            tuck = P(lean=40, tF=95, kF=140, tB=80, kB=135, aF=60, eF=100, aB=40, eB=90, head=10)
            h, a = render_frame(sc, rig, cam, tuck, f'{tmp}/roll_base.png')
            meta.append({'anim': name, 'fps': fps, 'loop': loop, 'special': 'roll', 'base': f'{tmp}/roll_base.png'})
            continue
        if poses == 'DEATH':
            seq = [P(lean=-22, hipY=2, tF=20, kF=30, tB=-10, kB=20, aF=-50, eF=40, aB=-60, eB=40, head=-14),
                   P(lean=-50, hipY=12, tF=50, kF=80, tB=30, kB=70, aF=-80, eF=20, aB=-90, eB=20, head=-20)]
            fr = []
            for i, p in enumerate(seq):
                h, a = render_frame(sc, rig, cam, p, f'{tmp}/{name}_{i}.png')
                fr.append({'path': f'{tmp}/{name}_{i}.png', 'hand': h, 'handAngle': a})
            meta.append({'anim': name, 'fps': fps, 'loop': loop, 'special': 'death', 'frames': fr})
            continue
        fr = []
        for i, p in enumerate(poses):
            h, a = render_frame(sc, rig, cam, p, f'{tmp}/{name}_{i}.png')
            fr.append({'path': f'{tmp}/{name}_{i}.png', 'hand': h, 'handAngle': a})
        meta.append({'anim': name, 'fps': fps, 'loop': loop, 'frames': fr})
        print('rendered', name, len(fr), flush=True)
    json.dump({'frameWidth': FW, 'frameHeight': FH, 'feetY': FEET_Y, 'anims': meta}, open(os.path.join(OUT, '_raw.json'), 'w'), indent=1)


main()
