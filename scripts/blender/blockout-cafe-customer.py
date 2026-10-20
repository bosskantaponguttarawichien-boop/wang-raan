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


def tube(name, rings, up=(0, 0, 1), cap_start=0.6, cap_end=0.6, floor=None):
    """
    ท่อผ่านจุดกึ่งกลาง rings = [((x, y, z), รัศมีด้านข้าง, รัศมีแกน up)] วงละ RING จุด
    ปลายปิดด้วยสี่เหลี่ยม 4 ช่องรอบจุดกลาง (ดันออกเป็นโดม cap × รัศมี); floor = ตัดใต้ให้เรียบที่ความสูงนี้
    """
    centers = [b(*c) for c, _, _ in rings]
    up = b(*up).normalized()
    verts, faces = [], []
    for index, (center, (_, side_r, up_r)) in enumerate(zip(centers, rings)):
        tangent = (centers[min(index + 1, len(centers) - 1)] - centers[max(index - 1, 0)]).normalized()
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
    (1.035, 0.0), (1.021, 0.061), (1.007, 0.086), (0.993, 0.103), (0.979, 0.116), (0.965, 0.126),
    (0.951, 0.134), (0.938, 0.139), (0.91, 0.146), (0.882, 0.149), (0.86, 0.151), (0.83, 0.148),
    (0.80, 0.14), (0.785, 0.13), (0.771, 0.117), (0.757, 0.104), (0.744, 0.088), (0.73, 0.062), (0.72, 0.0),
]
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
    """หูรูปตัว C: ขอบโค้งจากบนหัว ออกข้าง แล้ววนลงมาติดหัวด้านล่าง + แผ่นหลังทำให้เป็นแอ่งหันหน้า"""
    rim = []
    for step in range(7):
        angle = math.pi / 2 - math.pi * step / 6
        rim.append(((sign * (0.147 + 0.022 * math.cos(angle)), 0.822 + 0.034 * math.sin(angle), 0.004), 0.022, 0.025))
    rim_part = tube(f"EarRim{'LR'[sign > 0]}", rim, up=(0, 0, 1), cap_start=0.3, cap_end=0.3)
    back = tube(
        f"EarBack{'LR'[sign > 0]}",
        [((sign * 0.136, 0.822, -0.012), 0.014, 0.042), ((sign * 0.168, 0.822, -0.012), 0.014, 0.036)],
        up=(0, 1, 0), cap_start=0.2, cap_end=0.9,
    )
    return [rim_part, back]


def body_parts():
    parts = []
    # ลำตัวทรงระฆัง: ไหล่ลาดยาวจากคอลงมา พุงกลมยื่นหน้า สะโพกกว้างสุด
    parts.append(tube("Torso", [
        ((0, 0.34, 0.0), 0.11, 0.08),
        ((0, 0.37, 0.0), 0.125, 0.088),
        ((0, 0.45, 0.008), 0.126, 0.095),
        ((0, 0.53, 0.01), 0.118, 0.092),
        ((0, 0.6, 0.004), 0.11, 0.082),
        ((0, 0.65, 0.0), 0.104, 0.074),
        ((0, 0.685, 0.0), 0.088, 0.064),
        ((0, 0.706, 0.0), 0.06, 0.05),
    ], up=(0, 0, 1), cap_start=0.15, cap_end=0.15))
    # ปลอกคอสั้น ๆ ระหว่างหัวกับลำตัว
    parts.append(tube("Collar", [((0, 0.704, 0), 0.054, 0.048), ((0, 0.724, 0), 0.054, 0.048)], up=(0, 0, 1), cap_start=0.1, cap_end=0.1))
    for sign in (-1, 1):
        side = "LR"[sign > 0]
        # แขนเริ่มในหัวไหล่ (โดมจมในลำตัว) แล้วกางออกนิด ๆ ลงถึงต้นขา
        parts.append(tube(f"Arm{side}", [
            ((sign * 0.08, 0.655, 0), 0.03, 0.03),
            ((sign * 0.107, 0.61, 0), 0.035, 0.035),
            ((sign * 0.134, 0.53, 0), 0.034, 0.034),
            ((sign * 0.16, 0.465, 0), 0.033, 0.033),
            ((sign * 0.18, 0.395, 0), 0.031, 0.03),
        ], up=(0, 0, 1), cap_start=0.7, cap_end=0.3))
        # มือถุงมือรูปตัว C: นิ้วทั้งสี่ติดกันงอเข้าหาขา นิ้วโป้งชี้เข้าหาขาจากด้านบน
        parts.append(tube(f"Hand{side}", [
            ((sign * 0.182, 0.405, 0), 0.03, 0.032),
            ((sign * 0.195, 0.37, 0), 0.034, 0.036),
            ((sign * 0.2, 0.338, 0.004), 0.031, 0.035),
            ((sign * 0.186, 0.312, 0.008), 0.026, 0.031),
            ((sign * 0.163, 0.314, 0.008), 0.02, 0.026),
        ], up=(0, 0, 1), cap_start=0.2, cap_end=0.6))
        parts.append(tube(f"Thumb{side}", [
            ((sign * 0.176, 0.378, 0.006), 0.019, 0.021),
            ((sign * 0.152, 0.362, 0.01), 0.016, 0.018),
        ], up=(0, 0, 1), cap_start=0.2, cap_end=0.8))
        # ขาตรงยาว ชิดกัน (ช่องระหว่างขาราว 3.5 ซม.) โคนขาจมในลำตัวเหมือนข้อต่อตุ๊กตา
        parts.append(tube(f"Leg{side}", [
            ((sign * 0.067, 0.40, 0), 0.05, 0.054),
            ((sign * 0.067, 0.34, 0), 0.057, 0.06),
            ((sign * 0.066, 0.2, 0), 0.051, 0.054),
            ((sign * 0.065, 0.11, 0), 0.043, 0.046),
            ((sign * 0.065, 0.07, 0), 0.04, 0.044),
        ], up=(0, 0, 1), cap_start=0.3, cap_end=0.3))
        # รองเท้าทรงมน: ท่อจากส้นไปปลายเท้า สูงสุดตรงข้อเท้า ตัดพื้นให้เรียบ
        parts.append(tube(f"Shoe{side}", [
            ((sign * 0.067, 0.042, -0.055), 0.04, 0.035),
            ((sign * 0.067, 0.048, -0.032), 0.053, 0.049),
            ((sign * 0.068, 0.05, 0.02), 0.057, 0.05),
            ((sign * 0.069, 0.046, 0.072), 0.058, 0.048),
            ((sign * 0.069, 0.04, 0.105), 0.05, 0.04),
        ], up=(0, 1, 0), cap_start=0.4, cap_end=0.5, floor=0.0))
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
