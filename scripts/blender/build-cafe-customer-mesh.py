"""
สร้างผิว mannequin ลูกค้าด้วย Blender แบบ box modeling: โครงหยาบที่เส้นเรียงเป็นวงรอบแขน ขา และข้อต่อ
แล้วเกลาผิวให้มนด้วย Subdivision Surface — ข้อต่องอได้เรียบ ไม่ยับเหมือนผิวที่ให้โปรแกรมวางสามเหลี่ยมเอง

- ลำตัว แขน ขา: Skin modifier จากเส้นโครงกระดูก (ได้วงเหลี่ยมรอบแขนขาเหมือนดึงจากทรงกระบอก)
- หัวและหู: ทรงรีแยกชิ้น ต่อบนคอ
- มือ/เท้า: ตัดรายละเอียดออก มือเป็นก้อนแบบถุงมือ เท้าเป็นรองเท้าทรงมน ไม่มีนิ้ว

ผลลัพธ์คือ GLB มีแค่ผิว + โครงกระดูก + น้ำหนักผิว (ชื่อกระดูกตรงกับ create-cafe-customer-model.mjs)
สคริปต์ Node จะอ่านไฟล์นี้ไปใส่ animation ต่อ

รัน (ต้องมี Blender หรือ pip install bpy):
  python scripts/blender/build-cafe-customer-mesh.py
"""
from pathlib import Path

import bpy

OUT_DIR = Path(__file__).resolve().parent
# ระดับการเกลาผิว: ละเอียดสำหรับ Character Lab / เบาสำหรับฉากร้านที่มีลูกค้าหลายสิบคน
LEVELS = {"cafe-customer-mesh.glb": 2, "cafe-customer-mesh-lite.glb": 1}


def b(x, y, z=0.0):
    """พิกัดแบบ glTF (Y ขึ้น, หน้าตัวละคร +Z) → Blender (Z ขึ้น, หน้า -Y)"""
    return (x, -z, y)


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
        bone.head = b(*head)
        bone.tail = b(*tail)
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

    def add(position, radius):
        points.append(b(*position))
        radii.append(radius)
        return len(points) - 1

    def chain(*ids):
        edges.extend(zip(ids, ids[1:]))

    pelvis = add((0, 0.45, -0.008), (0.13, 0.09))
    waist = add((0, 0.53), (0.118, 0.082))
    chest = add((0, 0.62), (0.13, 0.086))
    neck_base = add((0, 0.71), (0.042, 0.04))
    neck_top = add((0, 0.77), (0.036, 0.036))
    chain(pelvis, waist, chest, neck_base, neck_top)
    for sign in (-1, 1):
        shoulder = add((sign * 0.13, 0.664), (0.05, 0.05))
        elbow = add((sign * 0.163, 0.54), (0.039, 0.039))
        wrist = add((sign * 0.18, 0.392), (0.03, 0.029))
        # มือแบบถุงมือ: ก้อนแบนเล็กน้อยปลายมน ไม่มีนิ้ว
        palm = add((sign * 0.182, 0.36, 0.004), (0.03, 0.036))
        fingertip = add((sign * 0.183, 0.33, 0.006), (0.022, 0.026))
        chain(chest, shoulder, elbow, wrist, palm, fingertip)

        hip = add((sign * 0.072, 0.41), (0.066, 0.07))
        knee = add((sign * 0.07, 0.23), (0.06, 0.06))
        ankle = add((sign * 0.07, 0.07), (0.046, 0.046))
        # รองเท้าทรงมน: ส้นอยู่ใต้ข้อเท้า ปลายยื่นไปหน้า ไม่มีนิ้วเท้า
        heel = add((sign * 0.07, 0.048, -0.014), (0.05, 0.04))
        toe = add((sign * 0.078, 0.046, 0.105), (0.056, 0.038))
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
        for modifier in list(part.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
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
