"""
สร้างผิว mannequin ลูกค้าด้วย Blender แบบ box modeling: โครงหยาบที่เส้นเรียงเป็นวงรอบแขน ขา และข้อต่อ
แล้วเกลาผิวให้มนด้วย Subdivision Surface — ข้อต่องอได้เรียบ ไม่ยับเหมือนผิวที่ให้โปรแกรมวางสามเหลี่ยมเอง

- ลำตัว แขน ขา: Skin modifier จากเส้นโครงกระดูก (ได้วงเหลี่ยมรอบแขนขาเหมือนดึงจากทรงกระบอก)
- หัวและหู: ทรงรีแยกชิ้น ต่อบนคอ
- มือ/เท้า: ตัดรายละเอียดออก มือเป็นถุงมือมีนิ้วโป้ง เท้าเป็นรองเท้าทรงมน ไม่มีนิ้วเท้า

ผลลัพธ์คือ GLB มีแค่ผิว + โครงกระดูก + น้ำหนักผิว (ชื่อกระดูกตรงกับ create-cafe-customer-model.mjs)
สคริปต์ Node จะอ่านไฟล์นี้ไปใส่ animation ต่อ

รัน (ต้องมี Blender หรือ pip install bpy):
  python scripts/blender/build-cafe-customer-mesh.py
"""
from pathlib import Path

import math

import bpy
import bmesh  # noqa: E402 — ต้อง import หลัง bpy
from mathutils import Matrix, Vector

OUT_DIR = Path(__file__).resolve().parent
# ระดับการเกลาผิว: ละเอียดสำหรับ Character Lab / เบาสำหรับฉากร้านที่มีลูกค้าหลายสิบคน
LEVELS = {"cafe-customer-mesh.glb": 2, "cafe-customer-mesh-lite.glb": 1}


# ตัวป้อม: ขาสั้นลง (ข้อเท้าอยู่ที่เดิม สะโพก .43 → .375) ส่วนเหนือสะโพกทั้งหมดเลื่อนลงตาม
# ตัวเลขในไฟล์นี้เขียนตามสัดส่วนเดิม แล้วแปลงความสูงผ่าน squash_y — ต้องตรงกับ create-cafe-customer-model.mjs
ANKLE_Y = 0.055
HIP_JOINT_Y = 0.43
SHORT_HIP_JOINT_Y = 0.375
LEG_SCALE = (SHORT_HIP_JOINT_Y - ANKLE_Y) / (HIP_JOINT_Y - ANKLE_Y)


def squash_y(y, leg):
    """ขา: ย่อช่วงข้อเท้า→สะโพกตามสัดส่วน / ส่วนอื่น (ลำตัว แขน หัว): เลื่อนลงทั้งก้อน รูปทรงไม่บิด"""
    if not leg:
        return y - (HIP_JOINT_Y - SHORT_HIP_JOINT_Y)
    if y <= ANKLE_Y:
        return y
    return ANKLE_Y + (y - ANKLE_Y) * LEG_SCALE


def b(x, y, z=0.0, leg=False):
    """พิกัดแบบ glTF (Y ขึ้น, หน้าตัวละคร +Z) → Blender (Z ขึ้น, หน้า -Y)"""
    return (x, -z, squash_y(y, leg))


# ---- ปั้นตอนกางแขน (A-pose) แล้วค่อยหุบแขนลง ----
# แขนห้อยแนบตัวตั้งแต่ตอนปั้น ผิวแขนกับลำตัวจะชนกันจนไม่มีหัวไหล่ ช่างปั้นจริงจึงปั้นแขนกาง
# แล้วให้กระดูกพับแขนลงมา ผิวหัวไหล่จะโค้งตามการพับเหมือนไหล่จริง
SHOULDER_PIVOT = (0.148, 0.65)
A_POSE_DEGREES = 25


def a_pose(sign, x, y, z=0.0):
    """หมุนจุดของแขน (ท่าห้อย) รอบข้อไหล่ออกด้านข้างเป็นท่ากางแขน"""
    angle = math.radians(A_POSE_DEGREES) * sign
    px, py = sign * SHOULDER_PIVOT[0], SHOULDER_PIVOT[1]
    dx, dy = x - px, y - py
    return (px + dx * math.cos(angle) - dy * math.sin(angle), py + dx * math.sin(angle) + dy * math.cos(angle), z)


# ---- โครงกระดูก: ตำแหน่งข้อต่อเดียวกับ create-cafe-customer-model.mjs ----
JOINTS = {
    "Hips": ((0, 0.46), (0, 0.61), None),
    "Spine": ((0, 0.61), (0, 0.74), "Hips"),
    "Neck": ((0, 0.74), (0, 0.825), "Spine"),
    "Head": ((0, 0.825), (0, 1.0), "Neck"),
}
for side, sign in (("Left", -1), ("Right", 1)):
    JOINTS.update({
        f"{side}Arm": ((sign * 0.148, 0.65), (sign * 0.163, 0.54), "Spine"),
        f"{side}ForeArm": ((sign * 0.163, 0.54), (sign * 0.18, 0.385), f"{side}Arm"),
        f"{side}Hand": ((sign * 0.18, 0.385), (sign * 0.183, 0.33), f"{side}ForeArm"),
        f"{side}Leg": ((sign * 0.07, 0.43), (sign * 0.07, 0.23), "Hips"),
        f"{side}LowerLeg": ((sign * 0.07, 0.23), (sign * 0.07, 0.055), f"{side}Leg"),
        f"{side}Foot": ((sign * 0.07, 0.055), (sign * 0.07, 0.04, 0.1), f"{side}LowerLeg"),
    })


LEG_BONES = ("Leg", "LowerLeg", "Foot")
ARM_SIDE = {f"{side}{part}": sign for side, sign in (("Left", -1), ("Right", 1)) for part in ("Arm", "ForeArm", "Hand")}


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build_armature():
    data = bpy.data.armatures.new("Skeleton")
    rig = bpy.data.objects.new("CafeMannequinRig", data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent) in JOINTS.items():
        bone = data.edit_bones.new(name)
        sign = ARM_SIDE.get(name)
        leg = name.endswith(LEG_BONES)
        bone.head = b(*(a_pose(sign, *head) if sign else head), leg=leg)
        bone.tail = b(*(a_pose(sign, *tail) if sign else tail), leg=leg)
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


# ---- ลำตัว แขน ขา: เส้นโครง + รัศมี (กว้าง, หนา) ต่อจุด ----
# รัศมีตั้งใหญ่กว่าขนาดจริงราว 20% เพราะ Subdivision เกลาผิวให้หดเข้าจากโครงหยาบ
def build_body(level):
    points = []
    edges = []
    radii = []

    def add(position, radius, leg=False):
        points.append(b(*position, leg=leg))
        radii.append(radius)
        return len(points) - 1

    def chain(*ids):
        edges.extend(zip(ids, ids[1:]))

    pelvis = add((0, 0.47, -0.004), (0.15, 0.104))
    # พุงกลมยื่นมาข้างหน้านิด ๆ
    waist = add((0, 0.525, 0.012), (0.142, 0.108))
    # อกกว้างเท่าเดิม ให้แขนห้อยพ้นลำตัว (ความป้อมไปอยู่ที่พุงกับสะโพก)
    chest = add((0, 0.615), (0.13, 0.092))
    # ไหล่ลาดมน: โคนคอกว้างเป็นเนินลาดลงหาหัวไหล่
    neck_base = add((0, 0.7), (0.07, 0.056))
    neck_top = add((0, 0.77), (0.036, 0.036))
    chain(pelvis, waist, chest, neck_base, neck_top)
    for sign in (-1, 1):
        # ตำแหน่งแขนเขียนเป็นท่าห้อย แล้วหมุนเป็นท่ากางแขนตอนปั้น (ดู a_pose)
        def arm(x, y, z=0.0, radius=(0.0, 0.0)):
            return add(a_pose(sign, sign * x, y, z), radius)

        shoulder = arm(0.146, 0.655, radius=(0.05, 0.05))
        elbow = arm(0.172, 0.54, radius=(0.043, 0.043))
        wrist = arm(0.186, 0.392, radius=(0.034, 0.033))
        # มือแบบถุงมือ: ก้อนแบนเล็กน้อยปลายมน นิ้วโป้งแยกออกไปทางหน้าและเข้าหาลำตัว
        palm = arm(0.188, 0.36, 0.004, radius=(0.036, 0.04))
        fingertip = arm(0.189, 0.33, 0.006, radius=(0.028, 0.031))
        chain(chest, shoulder, elbow, wrist, palm, fingertip)
        thumb_base = arm(0.176, 0.374, 0.034, radius=(0.018, 0.018))
        thumb_tip = arm(0.162, 0.35, 0.066, radius=(0.016, 0.016))
        chain(palm, thumb_base, thumb_tip)

        # ขาเยื้องออกด้านข้างเล็กน้อยและต้นขาด้านในบางลง ให้เห็นช่องระหว่างขาตั้งแต่เป้าลงมา
        hip = add((sign * 0.09, 0.385), (0.058, 0.072), leg=True)
        knee = add((sign * 0.082, 0.23), (0.054, 0.06), leg=True)
        ankle = add((sign * 0.077, 0.07), (0.048, 0.05), leg=True)
        # รองเท้าทรงมน: ส้นอยู่ใต้ข้อเท้า ปลายยื่นไปหน้า ไม่มีนิ้วเท้า
        heel = add((sign * 0.076, 0.054, -0.014), (0.056, 0.04), leg=True)
        toe = add((sign * 0.082, 0.052, 0.105), (0.062, 0.038), leg=True)
        chain(pelvis, hip, knee, ankle, heel, toe)

    mesh = bpy.data.meshes.new("Body")
    mesh.from_pydata(points, edges, [])
    body = bpy.data.objects.new("Body", mesh)
    bpy.context.scene.collection.objects.link(body)
    skin = body.modifiers.new("Skin", "SKIN")
    skin.use_smooth_shade = True
    skin.branch_smoothing = 0.6
    for vertex, radius in zip(mesh.skin_vertices[0].data, radii):
        vertex.radius = radius
    mesh.skin_vertices[0].data[pelvis].use_root = True
    body.modifiers.new("Smooth", "SUBSURF").levels = level
    return body


def ellipsoid(name, center, radii, level):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1, location=b(*center))
    shape = bpy.context.active_object
    shape.name = name
    shape.scale = (radii[0], radii[2], radii[1])
    bpy.ops.object.shade_smooth()
    if level > 1:
        shape.modifiers.new("Smooth", "SUBSURF").levels = level - 1
    return shape


def lower_arms(rig, body):
    """พับแขนจากท่ากางลงมาท่าห้อย แล้วบันทึกเป็นท่าตั้งต้นทั้งผิวและกระดูก"""
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    for side, sign in (("Left", -1), ("Right", 1)):
        pose_bone = rig.pose.bones[f"{side}Arm"]
        pivot = Vector(b(sign * SHOULDER_PIVOT[0], SHOULDER_PIVOT[1]))
        # หมุนกลับรอบแกนหน้า-หลังของตัวละคร (แกน -Y ของ Blender = +Z ของ glTF)
        turn = Matrix.Rotation(-math.radians(A_POSE_DEGREES) * sign, 4, Vector((0, -1, 0)))
        pose_bone.matrix = Matrix.Translation(pivot) @ turn @ Matrix.Translation(-pivot) @ pose_bone.matrix
        bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=body.modifiers[0].name)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply()
    bpy.ops.object.mode_set(mode="OBJECT")
    deform = body.modifiers.new("Armature", "ARMATURE")
    deform.object = rig
    for name, (head, tail, _) in JOINTS.items():
        bone = rig.data.bones[name]
        assert (bone.head_local - Vector(b(*head, leg=name.endswith(LEG_BONES)))).length < 1e-4, name
        leg = name.endswith(LEG_BONES)
        assert (bone.tail_local - Vector(b(*tail, leg=leg))).length < 1e-4, name


def close_holes(part):
    """Skin modifier บางครั้งเว้นผิวเป็นรูตรงจุดแตกแขนง (เช่นหัวไหล่) — อุดก่อนเกลาผิว"""
    mesh = bmesh.new()
    mesh.from_mesh(part.data)
    bmesh.ops.delete(mesh, geom=[edge for edge in mesh.edges if edge.is_wire], context="EDGES")
    bmesh.ops.holes_fill(mesh, edges=mesh.edges, sides=0)
    bmesh.ops.recalc_face_normals(mesh, faces=mesh.faces)
    mesh.to_mesh(part.data)
    mesh.free()


def build(filename, level):
    reset_scene()
    rig = build_armature()
    parts = [
        build_body(level),
        # หัวกับหู: หัวเล็กลง 20% จากรุ่นแรก, หูระดับตาแนบหัว; หัววางต่ำลงให้คอสั้น (เห็นคอราว 3 ซม.)
        ellipsoid("Head", (0, 0.91), (0.178, 0.17, 0.15), level),
        ellipsoid("EarL", (-0.18, 0.898), (0.024, 0.036, 0.02), level),
        ellipsoid("EarR", (0.18, 0.898), (0.024, 0.036, 0.02), level),
    ]
    for part in parts:
        bpy.context.view_layer.objects.active = part
        for name, kind in [(modifier.name, modifier.type) for modifier in part.modifiers]:
            bpy.ops.object.modifier_apply(modifier=name)
            if kind == "SKIN":
                close_holes(part)
    body, *head_parts = parts
    body.name = "MannequinBody"
    body.data.name = "MannequinBody"
    material = bpy.data.materials.new("Mannequin")
    material.diffuse_color = (0.34, 0.37, 0.42, 1)
    body.data.materials.append(material)

    # น้ำหนักผิวอัตโนมัติ (heat) เฉพาะลำตัว: ผิวรอบข้อต่อเป็นวงเรียบ จึงแบ่งน้ำหนักเป็นแถบต่อเนื่อง
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    lower_arms(rig, body)

    # หัวและหูแข็งทั้งชิ้น ผูกกับกระดูก Head เต็มน้ำหนัก (heat คำนวณชิ้นที่ซ้อนกับคอไม่ได้)
    for part in head_parts:
        group = part.vertex_groups.new(name="Head")
        group.add([vertex.index for vertex in part.data.vertices], 1.0, "REPLACE")
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.data.validate()

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_DIR / filename),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_skins=True,
        export_materials="NONE",
        export_yup=True,
    )
    print(f"สร้าง {filename}: {len(body.data.vertices)} จุด, {len(body.data.polygons)} หน้า")


for name, subdivision in LEVELS.items():
    build(name, subdivision)
