"""
ขั้นที่ 1 ของการปั้น mannequin ใหม่: โครงตาข่ายสี่เหลี่ยมหยาบ (box modeling cage)
ก่อนเกลาผิวจริง — ทุกหน้าเป็นสี่เหลี่ยม เส้นวิ่งเป็นวงรอบแขนขา

หุ่นผิวเรียบแบบไวนิล แยกชิ้นมีรอยต่อที่คอ ไหล่ สะโพก แต่สัดส่วนเท่าผู้ใหญ่จริง สูง 1.70 ม.
(หัวราว 1/7.5 ของความสูง, ข้อสะโพก 0.88 ม., เข่า 0.49 ม., ไหล่ 1.36 ม.) — ยืนข้างโต๊ะ 0.74 ม. /
เคาน์เตอร์ 1.05 ม. และนั่งเบาะ 0.48 ม. ได้สมจริงที่ขนาด 1:1:
- หัว: กล่องแบ่ง 4×4 ช่องต่อหน้า → ดันเป็นทรงกลม → ปั้นเป็นทรงไข่ (หน้า-หลังยาวกว่าด้านข้าง)
- ลำตัว แขน มือ ขา รองเท้า คอ: ท่อวงละ 8 จุด (tube) ปิดปลายด้วยสี่เหลี่ยม 4 ช่อง
- หู: ขอบรูปตัว C + แผ่นหลัง เป็นแอ่งหันไปด้านหน้า

ตัวเลขอ้างอิงขนาดร่างกายผู้ใหญ่ทั่วไป (ไหล่กว้าง ~0.38 ม., สะโพก ~0.36 ม., เท้ายาว ~0.27 ม.)
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


# เงาหัว: (ความสูง, ครึ่งความกว้าง) จากบนลงล่าง — กว้างสุดระดับขมับ แล้วเรียวลงเป็นกรามและคาง
# หัว 4×4 ช่องหดเข้าหลังเกลาราว 6% → ตัวเลขขยายเผื่อไว้แล้ว (กว้างจริง ~0.155 ม., สูง ~0.23 ม.)
HEAD_PROFILE = [
    (1.700, 0.0), (1.695, 0.037), (1.686, 0.058), (1.672, 0.072), (1.655, 0.081), (1.635, 0.085),
    (1.612, 0.086), (1.59, 0.085), (1.57, 0.082), (1.55, 0.076), (1.53, 0.068), (1.512, 0.059),
    (1.497, 0.049), (1.486, 0.037), (1.479, 0.021), (1.476, 0.0),
]
# หน้า-หลังยาวกว่าด้านข้าง (ลึก ~0.195 ม.) และหัวเยื้องไปหน้าคอเล็กน้อย
HEAD_DEPTH = 1.18
HEAD_FORWARD = 0.012


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
        vertex.co = Vector((unit.x * scale, unit.y * scale * HEAD_DEPTH - HEAD_FORWARD, height))
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
    center = (0.08, 1.575, 0.0)
    for vertex in shape.verts:
        # หน่วยกล่อง → ขนาดหู (หนา 2 ซม., สูง 6.4 ซม., ลึก 3.6 ซม.) ในพิกัด glTF; หน้าด้านนอก = +x
        x, y, z = vertex.co.x * 0.01, vertex.co.z * 0.032, -vertex.co.y * 0.018
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
    """ชิ้นส่วนแยกกัน: หัว ปลอกคอ ลำตัว แขน (ถึงปลายมือ) นิ้วโป้ง ขา รองเท้า พื้นรองเท้า หู
    แขนและขาเป็นท่อเดียวต่อเนื่อง ไม่มีเส้นรอยต่อที่ศอก ข้อมือ เข่า — ข้อต่องอได้ด้วยน้ำหนักผิว"""
    parts = []
    up, down = (0, 1, 0), (0, -1, 0)
    # ลำตัว: สะโพกกว้าง เอวคอด อกหนาไปหน้า ไหล่ลาดเข้าหาคอ — (กึ่งกลาง, ครึ่งกว้าง, ครึ่งลึก)
    parts.append(tube("Torso", [
        # ก้นลำตัวมนซ่อนระหว่างต้นขา รอยต่อสะโพกคือเส้นที่ผิวลำตัวชนต้นขา
        ((0, 0.79, 0.0), 0.11, 0.085),
        ((0, 0.83, -0.004), 0.15, 0.1),
        ((0, 0.9, -0.008), 0.172, 0.11),
        ((0, 0.97, -0.004), 0.158, 0.1),
        ((0, 1.04, 0.0), 0.142, 0.094),
        ((0, 1.12, 0.006), 0.148, 0.1),
        ((0, 1.2, 0.012), 0.162, 0.11),
        ((0, 1.27, 0.008), 0.168, 0.106),
        ((0, 1.33, 0.0), 0.17, 0.092),
        ((0, 1.375, -0.004), 0.148, 0.078),
        ((0, 1.405, -0.006), 0.104, 0.064),
        ((0, 1.42, -0.006), 0.07, 0.054),
    ], cap_start=0.15, cap_end=0.12))
    # คอ: ท่อสั้นจากบ่าขึ้นไปซ่อนใต้คาง (ชิ้น "Collar" ผูกกระดูก Neck)
    parts.append(tube("Collar", [
        ((0, 1.39, -0.008), 0.056, 0.058),
        ((0, 1.45, -0.004), 0.054, 0.056),
        ((0, 1.53, 0.004), 0.05, 0.054),
    ], cap_start=0.2, cap_end=0.2))
    for sign in (-1, 1):
        side = "LR"[sign > 0]
        # แขนทั้งท่อนเป็นท่อเดียวต่อเนื่องถึงปลายมือ (ไม่มีเส้นรอยต่อที่ศอก/ข้อมือ — งอได้ด้วยน้ำหนักผิว)
        # โดมหัวไหล่จมในลำตัว → ต้นแขน → ศอก → ปลายแขนเรียวลง → มือแบนแบบถุงมือ (ฝ่ามือหันเข้าหาขา)
        parts.append(tube(f"Arm{side}", [
            ((sign * 0.15, 1.385, 0), 0.038, 0.038),
            ((sign * 0.178, 1.345, 0), 0.05, 0.05),
            ((sign * 0.187, 1.27, 0), 0.046, 0.046),
            ((sign * 0.193, 1.17, 0), 0.041, 0.042),
            # วงถี่รอบศอกให้ผิวงอโค้งไม่หัก
            ((sign * 0.196, 1.105, 0), 0.037, 0.038),
            ((sign * 0.198, 1.065, 0), 0.036, 0.037),
            ((sign * 0.2, 1.025, 0), 0.037, 0.039),
            ((sign * 0.204, 0.95, 0), 0.034, 0.037),
            ((sign * 0.208, 0.86, 0), 0.026, 0.029),
            ((sign * 0.21, 0.815, 0), 0.022, 0.026),
            ((sign * 0.211, 0.775, 0.006), 0.016, 0.044),
            ((sign * 0.21, 0.725, 0.008), 0.015, 0.043),
            ((sign * 0.207, 0.685, 0.006), 0.013, 0.033),
        ], cap_start=0.7, cap_end=0.6))
        parts.append(tube(f"Thumb{side}", [
            ((sign * 0.206, 0.79, 0.03), 0.011, 0.012),
            ((sign * 0.2, 0.745, 0.05), 0.009, 0.01),
        ], cap_start=0.2, cap_end=0.8))
        # ขาทั้งท่อนเป็นท่อเดียว (ไม่มีเส้นรอยต่อที่เข่า): โคนจมในลำตัว ต้นขาใหญ่ เข่า น่องนูนด้านหลัง ปลายจมในรองเท้า
        parts.append(tube(f"Leg{side}", [
            ((sign * 0.09, 0.9, 0), 0.08, 0.088),
            ((sign * 0.09, 0.84, 0), 0.084, 0.09),
            ((sign * 0.092, 0.74, 0), 0.074, 0.078),
            ((sign * 0.094, 0.63, 0), 0.062, 0.066),
            # วงถี่รอบเข่าให้ผิวงอโค้งไม่หัก
            ((sign * 0.095, 0.54, 0), 0.052, 0.056),
            ((sign * 0.095, 0.49, 0), 0.05, 0.054),
            ((sign * 0.095, 0.44, -0.004), 0.05, 0.056),
            ((sign * 0.095, 0.36, -0.01), 0.052, 0.06),
            ((sign * 0.095, 0.25, -0.004), 0.042, 0.046),
            ((sign * 0.095, 0.15, 0), 0.032, 0.035),
            ((sign * 0.095, 0.075, 0), 0.031, 0.034),
        ], cap_start=0.3, cap_end=0.3))
        # รองเท้าหัวมน: ซ้อนวงแนวนอนจากก้นแบนขึ้นเป็นโดม หน้าแข้งจมลงด้านบนค่อนหลัง
        # ยาว ~0.27 ม. (ส้นเลยหน้าแข้งไปหลังนิด ปลายเท้ายื่นไปหน้า) ตั้งบนพื้นรองเท้าบางที่กว้างกว่า 2–3 มม.
        x = sign * 0.095
        parts.append(tube(f"Shoe{side}", [
            # วงละความสูง: (กึ่งกลางหน้า-หลัง, ครึ่งกว้าง, ครึ่งยาว)
            *seam((x, 0.012, 0.072), 0.048, 0.135, up),
            ((x, 0.03, 0.073), 0.05, 0.138),
            ((x, 0.05, 0.068), 0.048, 0.132),
            ((x, 0.07, 0.056), 0.043, 0.115),
            ((x, 0.088, 0.036), 0.036, 0.085),
            ((x, 0.104, 0.016), 0.031, 0.056),
        ], cap_start=0.02, cap_end=0.12, level=True))
        parts.append(tube(f"Sole{side}", [
            *seam((x, 0.0, 0.072), 0.051, 0.139, up),
            *seam((x, 0.012, 0.072), 0.051, 0.139, down)[::-1],
        ], cap_start=0.02, cap_end=0.02, level=True))
        parts.extend(ear(sign))
    return parts


def cage_parts():
    """ชิ้นโครงตาข่ายแยกกัน (ยังไม่รวม) — build-cafe-customer-mesh.py ใช้ผูกแต่ละชิ้นกับกระดูก"""
    return [head(), *body_parts()]


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts = cage_parts()
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = "MannequinCage"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
    faces = parts[0].data.polygons
    print(f"สร้าง {OUT}: {len(faces)} หน้า, สี่เหลี่ยม {sum(len(face.vertices) == 4 for face in faces)} หน้า")


if __name__ == "__main__":
    build()
