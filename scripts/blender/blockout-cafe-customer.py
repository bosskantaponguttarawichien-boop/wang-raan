"""
ขั้นที่ 1 ของการปั้น mannequin ใหม่: โครงตาข่ายสี่เหลี่ยมหยาบ (box modeling cage)
ก่อนเกลาผิวจริง — ทุกหน้าเป็นสี่เหลี่ยม เส้นวิ่งเป็นวงรอบแขนขา

แยกชิ้นแบบตุ๊กตาไวนิลในภาพอ้างอิง (มีรอยต่อที่คอ ไหล่ สะโพก):
- หัว: กล่องแบ่ง 4×4 ช่องต่อหน้า → ดันเป็นทรงกลม → ปั้นเป็นทรงไข่ตามเงาภาพอ้างอิง
- ลำตัว แขน มือ ขา รองเท้า ปลอกคอ: ท่อวงละ 8 จุด (tube) ปิดปลายด้วยสี่เหลี่ยม 4 ช่อง
- หู: ขอบรูปตัว C + แผ่นหลัง เป็นแอ่งหันไปด้านหน้า

ตัวเลขวัดจากเงาภาพอ้างอิงทีละแถว (ตุ๊กตาขาวยืนตรง) ที่ความสูง 1.03 ม. เท่าโมเดลตอนนี้
พิกัดแบบ glTF: X ข้าง, Y ขึ้น (พื้น = 0), Z หน้า — หน่วยเมตร

บันทึกเป็น .blend (ไม่ใช่ GLB) เพราะ glTF แตกสี่เหลี่ยมเป็นสามเหลี่ยม เส้นตาข่ายจะเสีย
รัน: python scripts/blender/blockout-cafe-customer.py [ไฟล์ปลายทาง.blend]
"""
import math
import sys
from pathlib import Path

import bpy
import bmesh  # ต้อง import หลัง bpy เมื่อใช้ bpy แบบ pip
from mathutils import Vector

OUT = Path(sys.argv[-1]) if sys.argv[-1].endswith(".blend") else Path(__file__).resolve().parent / "cafe-customer-cage.blend"
RING = 8
# Subdivision ทำวง 8 จุดหดเข้าราว 13% (วัดจากภาพ render เทียบภาพอ้างอิง)
SMOOTH_SHRINK = 1.15


def b(x, y, z=0.0):
    """glTF (Y ขึ้น, หน้า +Z) → Blender (Z ขึ้น, หน้า -Y)"""
    return Vector((x, -z, y))


def add_object(name, verts, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.validate()
    part = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(part)
    return part


def tube(name, rings, up=(0, 0, 1), cap_start=0.6, cap_end=0.6, floor=None, grow=SMOOTH_SHRINK, level=False):
    """
    ท่อผ่านจุดกึ่งกลาง rings = [((x, y, z), รัศมีด้านข้าง, รัศมีแกน up)] วงละ RING จุด
    รัศมีเป็นขนาดหลังเกลาผิว — โครงจริงขยายด้วย grow เพราะ Subdivision ทำวง 8 จุดหดเข้า
    ปลายปิดด้วยสี่เหลี่ยม 4 ช่องรอบจุดกลาง (ดันออกเป็นโดม cap × รัศมี); floor = ตัดใต้ให้เรียบที่ความสูงนี้
    level = ทุกวงขนานพื้น (ท่อแนวตั้งที่จุดกลางเยื้องไปหน้า-หลัง เช่นรองเท้า) แทนการตั้งฉากกับแนวท่อ
    """
    rings = [(center, side_r * grow, up_r * grow) for center, side_r, up_r in rings]
    centers = [b(*c) for c, _, _ in rings]
    up = b(*up).normalized()
    verts, faces = [], []
    for index, (center, (_, side_r, up_r)) in enumerate(zip(centers, rings)):
        tangent = (centers[min(index + 1, len(centers) - 1)] - centers[max(index - 1, 0)]).normalized()
        if level:
            tangent = Vector((0, 0, 1 if tangent.z >= 0 else -1))
        front = (up - tangent * up.dot(tangent)).normalized()
        side = front.cross(tangent).normalized()
        for k in range(RING):
            angle = 2 * math.pi * k / RING
            verts.append(center + side * (side_r * math.cos(angle)) + front * (up_r * math.sin(angle)))
    for ring in range(len(rings) - 1):
        for k in range(RING):
            a, c = ring * RING + k, ring * RING + (k + 1) % RING
            faces.append((a, c, c + RING, a + RING))
    for ring, cap, direction in ((0, cap_start, -1), (len(rings) - 1, cap_end, 1)):
        neighbor = centers[ring + (1 if direction < 0 else -1)]
        out = (centers[ring] - neighbor).normalized()
        if level:
            out = Vector((0, 0, 1 if out.z >= 0 else -1))
        radius = (rings[ring][1] + rings[ring][2]) / 2
        verts.append(centers[ring] + out * radius * cap)
        middle = len(verts) - 1
        base = ring * RING
        for k in range(0, RING, 2):
            quad = (middle, base + k, base + (k + 1) % RING, base + (k + 2) % RING)
            faces.append(quad if direction > 0 else quad[::-1])
    if floor is not None:
        for vertex in verts:
            vertex.z = max(vertex.z, floor)
    part = add_object(name, verts, faces)
    # ด้านในต้องหันเข้า: ให้ normal ชี้ออกทุกหน้า
    shape = bmesh.new()
    shape.from_mesh(part.data)
    bmesh.ops.recalc_face_normals(shape, faces=shape.faces)
    shape.to_mesh(part.data)
    shape.free()
    return part


# เงาหัวในภาพอ้างอิง: (ความสูง, ครึ่งความกว้าง) จากบนลงล่าง — กว้างสุดกลางหัว แล้วเรียวลงเป็นคาง
HEAD_PROFILE = [
    (1.046, 0.0), (1.032, 0.062), (1.018, 0.086), (1.004, 0.102), (0.99, 0.114), (0.977, 0.124),
    (0.962, 0.137), (0.948, 0.144), (0.92, 0.153), (0.89, 0.158), (0.865, 0.157), (0.835, 0.155),
    (0.805, 0.148), (0.785, 0.136), (0.771, 0.124), (0.757, 0.11), (0.744, 0.1), (0.733, 0.088),
    (0.724, 0.07), (0.712, 0.0),
]
# หัว 4×4 ช่องหดเข้าหลังเกลาราว 6% → ตัวเลขข้างบนขยายจากเงาภาพอ้างอิงแล้ว
HEAD_DEPTH = 0.93


def head_radius(height):
    for (y0, r0), (y1, r1) in zip(HEAD_PROFILE, HEAD_PROFILE[1:]):
        if y1 <= height <= y0:
            return r0 + (r1 - r0) * (y0 - height) / (y0 - y1)
    return 0.0


def head():
    """กล่องแบ่ง 4×4 → ลูกบอล → ยืดแต่ละชั้นให้กว้างเท่าเงาภาพอ้างอิงที่ความสูงนั้น"""
    shape = bmesh.new()
    bmesh.ops.create_cube(shape, size=2)
    bmesh.ops.subdivide_edges(shape, edges=shape.edges[:], cuts=3, use_grid_fill=True)
    top, bottom = HEAD_PROFILE[0][0], HEAD_PROFILE[-1][0]
    for vertex in shape.verts:
        unit = vertex.co.normalized()
        height = bottom + (unit.z + 1) / 2 * (top - bottom)
        ring = math.hypot(unit.x, unit.y)
        scale = head_radius(height) / ring if ring > 1e-6 else 0
        vertex.co = Vector((unit.x * scale, unit.y * scale * HEAD_DEPTH, height))
    mesh = bpy.data.meshes.new("Head")
    shape.to_mesh(mesh)
    shape.free()
    part = bpy.data.objects.new("Head", mesh)
    bpy.context.scene.collection.objects.link(part)
    return part


def ear(sign):
    """
    หูเปลือกหนารูปถ้วย: กล่องแบ่ง 3×3 ช่อง → ดันช่องกลางของหน้าด้านนอกลึกเข้าไปเป็นแอ่ง
    → มนมุม → หมุนให้แอ่งหันไปด้านหน้าเกือบตรง (มองหน้าเห็นขอบรูปตัว C แบบภาพอ้างอิง) ฝั่งในจมในหัว
    """
    shape = bmesh.new()
    bmesh.ops.create_cube(shape, size=2)
    bmesh.ops.subdivide_edges(shape, edges=shape.edges[:], cuts=2, use_grid_fill=True)
    for vertex in shape.verts:
        x, y, z = vertex.co
        if x > 0.99 and abs(y) < 0.5 and abs(z) < 0.5:
            vertex.co.x = -0.3  # ก้นแอ่ง
        else:
            vertex.co = vertex.co.lerp(vertex.co.normalized(), 0.75)  # มนมุมกล่องจนเกือบกลม
    angle = math.radians(70)
    center = (0.156, 0.822, 0.0)
    for vertex in shape.verts:
        # หน่วยกล่อง → ขนาดหู (หนา 4.8 ซม., สูง 10 ซม., ลึก 7.2 ซม.) ในพิกัด glTF; หน้าด้านนอก = +x
        x, y, z = vertex.co.x * 0.024, vertex.co.z * 0.05, -vertex.co.y * 0.036
        # หมุนรอบแกนตั้งให้แอ่งหันไปหน้า แล้วสะท้อนไปฝั่งซ้ายตาม sign
        x, z = x * math.cos(angle) - z * math.sin(angle), x * math.sin(angle) + z * math.cos(angle)
        vertex.co = b(sign * (center[0] + x), center[1] + y, center[2] + z)
    if sign < 0:
        bmesh.ops.reverse_faces(shape, faces=shape.faces[:])
    mesh = bpy.data.meshes.new(f"Ear{'LR'[sign > 0]}")
    shape.to_mesh(mesh)
    shape.free()
    part = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.scene.collection.objects.link(part)
    return [part]


def seam(center, side_r, up_r, toward):
    """วงคู่ห่างกัน 1.5 มม. ที่ปลายชิ้น: ผิวเกลาแล้วปลายยังเรียบเกือบเป็นมุม
    สองชิ้นชนกันพอดี รอยต่อจึงเป็นเส้นบาง ๆ แบบตุ๊กตา ไม่เป็นร่องลึก"""
    x, y, z = center
    dx, dy, dz = toward
    length = math.sqrt(dx * dx + dy * dy + dz * dz)
    step = 0.0015 / length
    return [(center, side_r, up_r), ((x + dx * step, y + dy * step, z + dz * step), side_r, up_r)]


def body_parts():
    """ชิ้นส่วนแยกตามรอยต่อของตุ๊กตาในภาพอ้างอิง: คอ ไหล่ ศอก ข้อมือ สะโพก เข่า ข้อเท้า
    รอยต่อเหล่านี้ใช้เป็นข้อต่อกระดูกได้ทีหลัง (ชิ้นละกระดูก ผิวไม่ยืด)"""
    parts = []
    up, down = (0, 1, 0), (0, -1, 0)
    # ลำตัว: ไหล่กว้างลาดจากคอ ข้างตรง พุงยื่นหน้านิด สะโพกกว้างสุด
    parts.append(tube("Torso", [
        # ก้นลำตัวมนซ่อนระหว่างต้นขา รอยต่อสะโพกคือเส้นที่ผิวลำตัวชนต้นขา; กว้างเท่าต้นขาจึงไม่ยื่นเป็นขอบ
        ((0, 0.335, 0.0), 0.1, 0.075),
        ((0, 0.355, 0.0), 0.12, 0.087),
        ((0, 0.39, 0.0), 0.124, 0.092),
        ((0, 0.45, 0.008), 0.123, 0.095),
        ((0, 0.52, 0.01), 0.118, 0.092),
        ((0, 0.58, 0.004), 0.112, 0.084),
        ((0, 0.64, 0.0), 0.108, 0.078),
        ((0, 0.67, 0.0), 0.1, 0.072),
        ((0, 0.69, 0.0), 0.084, 0.064),
        ((0, 0.703, 0.0), 0.062, 0.052),
    ], cap_start=0.15, cap_end=0.12))
    # ปลอกคอ: แผ่นกลมบางระหว่างหัวกับลำตัว
    parts.append(tube("Collar", [*seam((0, 0.703, 0), 0.047, 0.043, up)[::-1], *seam((0, 0.72, 0), 0.047, 0.043, down)], cap_start=0.05, cap_end=0.05))
    for sign in (-1, 1):
        side = "LR"[sign > 0]
        # ต้นแขน: โดมหัวไหล่จมในลำตัว (รอยต่อไหล่) → รอยต่อศอก
        parts.append(tube(f"UpperArm{side}", [
            ((sign * 0.082, 0.66, 0), 0.026, 0.026),
            ((sign * 0.095, 0.625, 0), 0.032, 0.032),
            ((sign * 0.116, 0.575, 0), 0.034, 0.034),
            *seam((sign * 0.1405, 0.5215, 0), 0.035, 0.035, (sign * -0.28, 1, 0))[::-1],
        ], cap_start=0.7, cap_end=0.05))
        # ปลายแขน: บานออกนิด ๆ ไปทางข้อมือ
        parts.append(tube(f"ForeArm{side}", [
            *seam((sign * 0.1415, 0.5205, 0), 0.035, 0.035, (sign * 0.28, -1, 0)),
            ((sign * 0.16, 0.47, 0), 0.037, 0.036),
            *seam((sign * 0.1747, 0.4255, 0), 0.037, 0.035, (sign * -0.3, 1, 0))[::-1],
        ], cap_start=0.05, cap_end=0.05))
        # มือถุงมือรูปตัว C: สี่นิ้วติดกันงอเข้าหาขา นิ้วโป้งชี้เข้าจากด้านบน เว้นช่องตัว C ระหว่างกัน
        parts.append(tube(f"Hand{side}", [
            *seam((sign * 0.175, 0.4245, 0), 0.036, 0.034, (sign * 0.3, -1, 0)),
            ((sign * 0.188, 0.39, 0), 0.03, 0.03),
            ((sign * 0.197, 0.356, 0.002), 0.022, 0.027),
            ((sign * 0.19, 0.326, 0.004), 0.019, 0.025),
            ((sign * 0.172, 0.322, 0.004), 0.015, 0.021),
        ], cap_start=0.05, cap_end=0.6))
        parts.append(tube(f"Thumb{side}", [
            ((sign * 0.172, 0.385, 0.004), 0.014, 0.016),
            ((sign * 0.152, 0.366, 0.006), 0.011, 0.013),
        ], cap_start=0.2, cap_end=0.8))
        # ต้นขา: โคนจมในลำตัว (รอยต่อสะโพก) → รอยต่อเข่า
        parts.append(tube(f"Thigh{side}", [
            ((sign * 0.069, 0.385, 0), 0.048, 0.05),
            ((sign * 0.069, 0.33, 0), 0.052, 0.054),
            ((sign * 0.068, 0.28, 0), 0.05, 0.052),
            *seam((sign * 0.068, 0.2315, 0), 0.047, 0.05, up)[::-1],
        ], cap_start=0.3, cap_end=0.05))
        # หน้าแข้ง: เรียวลงหาข้อเท้า ปลายจมในรองเท้า (รอยต่อข้อเท้า)
        parts.append(tube(f"Shin{side}", [
            *seam((sign * 0.068, 0.2305, 0), 0.047, 0.05, down),
            ((sign * 0.067, 0.16, 0), 0.04, 0.043),
            ((sign * 0.066, 0.1, 0), 0.036, 0.039),
            ((sign * 0.066, 0.035, 0), 0.034, 0.037),
        ], cap_start=0.05, cap_end=0.3))
        # รองเท้าหัวมน: ซ้อนวงแนวนอนจากก้นแบน (ขอบคม) ขึ้นเป็นโดม หน้าแข้งจมลงด้านบนค่อนหลัง
        # ตั้งบนพื้นรองเท้าบางที่กว้างกว่า 2–3 มม. เห็นเป็นขอบรอบล่างแบบภาพอ้างอิง
        x = sign * 0.069
        parts.append(tube(f"Shoe{side}", [
            # ส้นโค้งมนยื่นพ้นหน้าแข้งไปข้างหลัง แล้วลาดลงหาข้อเท้า (ไม่เป็นผนังตั้งตรง)
            # วงละความสูง: (หลังสุด, หน้าสุด) — ส้นเสมอหลังหน้าแข้ง ไม่ยื่นออกไปข้างหลัง มีแต่ปลายเท้าที่ยื่นไปหน้า
            *seam((x, 0.008, 0.0325), 0.047, 0.074, up),
            ((x, 0.02, 0.0335), 0.049, 0.076),
            ((x, 0.032, 0.033), 0.049, 0.0755),
            ((x, 0.044, 0.0295), 0.046, 0.0711),
            ((x, 0.054, 0.0235), 0.041, 0.0632),
            ((x, 0.062, 0.0135), 0.033, 0.0515),
        ], cap_start=0.02, cap_end=0.12, level=True))
        parts.append(tube(f"Sole{side}", [
            *seam((x, 0.0, 0.0325), 0.05, 0.077, up),
            *seam((x, 0.0085, 0.0325), 0.05, 0.077, down)[::-1],
        ], cap_start=0.02, cap_end=0.02, level=True))
        parts.extend(ear(sign))
    return parts


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts = [head(), *body_parts()]
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = "MannequinCage"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
    faces = parts[0].data.polygons
    print(f"สร้าง {OUT}: {len(faces)} หน้า, สี่เหลี่ยม {sum(len(face.vertices) == 4 for face in faces)} หน้า")


build()
