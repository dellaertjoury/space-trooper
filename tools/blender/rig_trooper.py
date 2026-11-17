"""Rig the Meshy Trooper model: build a skeleton from measured joint positions,
skin it with automatic weights and save trooper_rigged.blend.

Run:  python3 -I tools/blender/rig_trooper.py <model.fbx> <out.blend>
The model faces -Y, Z up, 1.9 units tall, arms hanging (A-pose). '.L' = +X side (nearest the side camera).
"""
import sys
import bpy

FBX, OUT = sys.argv[-2], sys.argv[-1]

# head, tail, parent   (left side; right side is mirrored in X)
SPINE = {
    'root':  ((0, 0, -0.95), (0, 0, -0.75), None),
    'hips':  ((0, 0, -0.02), (0, 0, 0.15), 'root'),
    'spine': ((0, 0, 0.15), (0, 0, 0.38), 'hips'),
    'chest': ((0, 0, 0.38), (0, 0.02, 0.56), 'spine'),
    'neck':  ((0, 0.02, 0.56), (0, 0.02, 0.66), 'chest'),
    'head':  ((0, 0.02, 0.66), (0, 0.0, 0.95), 'neck'),
}
SIDE = {
    'shoulder':  ((0.05, 0.04, 0.50), (0.20, 0.06, 0.50), 'chest'),
    'upper_arm': ((0.20, 0.06, 0.50), (0.29, 0.09, 0.20), 'shoulder'),
    'forearm':   ((0.29, 0.09, 0.20), (0.35, 0.0, -0.02), 'upper_arm'),
    'hand':      ((0.35, 0.0, -0.02), (0.31, -0.03, -0.22), 'forearm'),
    'thigh':     ((0.11, 0.0, -0.02), (0.17, -0.01, -0.43), 'hips'),
    'shin':      ((0.17, -0.01, -0.43), (0.235, 0.02, -0.82), 'thigh'),
    'foot':      ((0.235, 0.02, -0.82), (0.24, -0.20, -0.93), 'shin'),
}


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=FBX)
    mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    mesh.name = 'Trooper'
    # apply the import rotation so mesh space == world space
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    arm_data = bpy.data.armatures.new('TrooperRig')
    arm = bpy.data.objects.new('TrooperRig', arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones
    defs = dict(SPINE)
    for side, sx in (('L', 1), ('R', -1)):
        for n, (h, t, p) in SIDE.items():
            par = p if p in SPINE else f'{p}.{side}'
            defs[f'{n}.{side}'] = ((h[0] * sx, h[1], h[2]), (t[0] * sx, t[1], t[2]), par)
    for n, (h, t, p) in defs.items():
        b = eb.new(n)
        b.head, b.tail = h, t
    for n, (h, t, p) in defs.items():
        b = eb[n]
        if p:
            b.parent = eb[p]
            b.use_connect = (tuple(eb[p].tail) == tuple(b.head)) and n not in ('thigh.L', 'thigh.R', 'shoulder.L', 'shoulder.R')
        # every bone's Z axis points forward (-Y): rotating about local X swings it in the side-view plane
        b.align_roll((0, -1, 0))
    eb['root'].use_deform = False
    bpy.ops.object.mode_set(mode='OBJECT')

    # automatic (heat) weights
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    empty = [g.name for g in mesh.vertex_groups if not any(g.index == vg.group for v in mesh.data.vertices[:2000] for vg in v.groups)]
    print('groups', len(mesh.vertex_groups), 'possibly-empty (sampled)', empty)
    unweighted = sum(1 for v in mesh.data.vertices if not v.groups)
    print('unweighted vertices', unweighted, 'of', len(mesh.data.vertices))
    bpy.ops.wm.save_as_mainfile(filepath=OUT)


main()
