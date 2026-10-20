"""
ขั้นที่ 1 ของการปั้น mannequin ใหม่: โครงตาข่ายสี่เหลี่ยมหยาบ (box modeling cage)
ก่อนเกลาผิวจริง — เหมือนช่างปั้นเริ่มจากกล่องที่แบ่งเป็นช่องสี่เหลี่ยม แล้วดึงจุดให้เป็นรูปทรง

- หัว: กล่องแบ่ง 4×4 ช่องต่อหน้า → ดันเป็นทรงกลม → ยืดเป็นทรงหัว (ทุกช่องเป็นสี่เหลี่ยม)
- ลำตัว แขน ขา: วงสี่เหลี่ยม 8 ช่องรอบแขนขา (Skin modifier จากเส้นโครง) ต่อกันเป็นผิวชิ้นเดียว
- หู: กล่องเล็กแบ่ง 2×2

สัดส่วนวัดจากภาพอ้างอิง (ตุ๊กตาขาวยืนตรง) ที่ความสูง 1.03 ม. เท่าโมเดลตอนนี้
พิกัดแบบ glTF: X ข้าง, Y ขึ้น (พื้น = 0), Z หน้า — หน่วยเมตร

บันทึกเป็น .blend (ไม่ใช่ GLB) เพราะ glTF แตกสี่เหลี่ยมเป็นสามเหลี่ยม เส้นตาข่ายจะเสีย
รัน: python scripts/blender/blockout-cafe-customer.py [ไฟล์ปลายทาง.blend]
"""
import sys
from pathlib import Path

import bpy
import bmesh  # ต้อง import หลัง bpy เมื่อใช้ bpy แบบ pip

OUT = Path(sys.argv[-1]) if sys.argv[-1].endswith(".blend") else Path(__file__).resolve().parent / "cafe-customer-cage.blend"


def b(x, y, z=0.0):
    """glTF (Y ขึ้น, หน้า +Z) → Blender (Z ขึ้น, หน้า -Y)"""
    return (x, -z, y)


def rounded_box(name, center, size, cuts, roundness):
    """กล่องแบ่งช่องเท่า ๆ กัน แล้วดันจุดออกเป็นทรงกลม (roundness 0 = กล่อง, 1 = ลูกบอล)"""
    mesh = bpy.data.meshes.new(name)
    shape = bmesh.new()
    bmesh.ops.create_cube(shape, size=2)
    bmesh.ops.subdivide_edges(shape, edges=shape.edges[:], cuts=cuts, use_grid_fill=True)
    for vertex in shape.verts:
        vertex.co = vertex.co.lerp(vertex.co.normalized(), roundness)
    shape.to_mesh(mesh)
    shape.free()
    part = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(part)
    part.location = b(*center)
    part.scale = (size[0] / 2, size[2] / 2, size[1] / 2)
    return part


def body_cage():
    points, edges, radii = [], [], []

    def add(position, radius):
        points.append(b(*position))
        radii.append(radius)
        return len(points) - 1

    def chain(*ids):
        edges.extend(zip(ids, ids[1:]))

    # ลำตัวทรงลูกแพร์: สะโพก → พุง (กว้างสุด ยื่นหน้า) → อกแคบ → คอสั้นมาก
    pelvis = add((0, 0.40), (0.118, 0.085))
    belly = add((0, 0.525, 0.012), (0.123, 0.095))
    chest = add((0, 0.655), (0.10, 0.075))
    neck_base = add((0, 0.705), (0.05, 0.045))
    neck_top = add((0, 0.738), (0.044, 0.04))
    chain(pelvis, belly, chest, neck_base, neck_top)
    for sign in (-1, 1):
        # แขนห้อยกางออกนิด ๆ ปลายมือถึงกลางต้นขา; มือเป็นถุงมือแบนข้าง + นิ้วโป้งด้านหน้า
        shoulder = add((sign * 0.11, 0.69), (0.035, 0.034))
        elbow = add((sign * 0.155, 0.545), (0.031, 0.031))
        wrist = add((sign * 0.172, 0.42), (0.027, 0.026))
        palm = add((sign * 0.176, 0.38), (0.038, 0.028))
        tip = add((sign * 0.178, 0.32), (0.032, 0.022))
        chain(chest, shoulder, elbow, wrist, palm, tip)
        thumb = add((sign * 0.163, 0.365, 0.05), (0.013, 0.013))
        chain(palm, thumb)
        # ขาตรงชิดกัน → รองเท้าทรงมน ปลายยื่นไปหน้า
        hip = add((sign * 0.063, 0.36), (0.058, 0.06))
        knee = add((sign * 0.063, 0.2), (0.05, 0.052))
        ankle = add((sign * 0.063, 0.08), (0.044, 0.046))
        instep = add((sign * 0.063, 0.04, 0.015), (0.05, 0.06))
        toe = add((sign * 0.063, 0.035, 0.1), (0.05, 0.035))
        chain(pelvis, hip, knee, ankle, instep, toe)

    mesh = bpy.data.meshes.new("BodyCage")
    mesh.from_pydata(points, edges, [])
    body = bpy.data.objects.new("BodyCage", mesh)
    bpy.context.scene.collection.objects.link(body)
    skin = body.modifiers.new("Skin", "SKIN")
    skin.branch_smoothing = 0.6
    for vertex, radius in zip(mesh.skin_vertices[0].data, radii):
        vertex.radius = radius
    mesh.skin_vertices[0].data[pelvis].use_root = True
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier="Skin")
    # พื้นรองเท้าเรียบ + อุดรูที่ Skin modifier อาจเว้นตรงจุดแตกแขนง
    shape = bmesh.new()
    shape.from_mesh(mesh)
    bmesh.ops.holes_fill(shape, edges=shape.edges, sides=0)
    for vertex in shape.verts:
        vertex.co.z = max(vertex.co.z, 0.0)
    shape.to_mesh(mesh)
    shape.free()
    # จุดแตกแขนง (ไหล่ สะโพก นิ้วโป้ง) เหลือสามเหลี่ยมเป็นเลขคี่ รวมเป็นสี่เหลี่ยมไม่ได้หมด
    # → แบ่งทุกหน้าครั้งเดียวแบบไม่เกลา: รูปทรงเหมือนเดิม แต่ทุกหน้ากลายเป็นสี่เหลี่ยม วงรอบแขนขาได้ 8 ช่อง
    split = body.modifiers.new("Split", "SUBSURF")
    split.subdivision_type = "SIMPLE"
    split.levels = 1
    bpy.ops.object.modifier_apply(modifier="Split")
    return body


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts = [
        body_cage(),
        # หัวกลมใหญ่ กว้างกว่าลำตัว ~1.2 เท่า สูงราว 30% ของตัว
        rounded_box("HeadCage", (0, 0.876), (0.30, 0.31, 0.28), cuts=3, roundness=0.95),
    ]
    # หูอยู่ครึ่งล่างของหัว ยื่นออกข้างเล็กน้อย
    for sign in (-1, 1):
        parts.append(rounded_box(f"Ear{'LR'[sign > 0]}Cage", (sign * 0.152, 0.824), (0.05, 0.088, 0.05), cuts=1, roundness=0.6))
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=True, scale=True)
    bpy.ops.object.join()
    parts[0].name = "MannequinCage"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
    faces = parts[0].data.polygons
    print(f"สร้าง {OUT}: {len(faces)} หน้า, สี่เหลี่ยม {sum(len(face.vertices) == 4 for face in faces)} หน้า")


build()
