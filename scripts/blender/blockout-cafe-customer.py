"""
ขั้นที่ 1 ของการปั้น mannequin ใหม่: โครงตาข่ายสี่เหลี่ยมหยาบ (box modeling cage)
ก่อนเกลาผิวจริง — ทุกหน้าเป็นสี่เหลี่ยม เส้นวิ่งเป็นวงรอบแขนขา

ผู้ชายสูง 1.70 ม. ใส่เสื้อยืดแขนสั้น กางเกงยีนส์ รองเท้าผ้าใบ (ตามภาพอ้างอิง character sheet)
สัดส่วนผู้ใหญ่จริง (หัวราว 1/7.5 ของความสูง, ข้อสะโพก 0.88 ม., เข่า 0.49 ม., ไหล่ 1.36 ม.) —
ยืนข้างโต๊ะ 0.74 ม. / เคาน์เตอร์ 1.05 ม. และนั่งเบาะ 0.45 ม. ได้สมจริงที่ขนาด 1:1
เสื้อผ้าเป็นชิ้นแยก (ชายเสื้อ/ปลายแขนเสื้อ/ปลายขากางเกงซ้อนทับผิวข้างใต้) แต่ผูกกระดูกชุดเดียวกับตัว:
- หัว: กล่องแบ่ง 4×4 ช่องต่อหน้า → ดันเป็นทรงกลม → ปั้นเป็นทรงไข่ (หน้า-หลังยาวกว่าด้านข้าง) + จมูก + ผม
- เสื้อ กางเกง แขน นิ้ว รองเท้า คอ: ท่อวงละ 8 จุด (tube) ปิดปลายด้วยสี่เหลี่ยม 4 ช่อง
- หู: ขอบรูปตัว C + แผ่นหลัง เป็นแอ่งหันไปด้านหน้า
แต่ละชิ้นมีหมวดสี (PART) ให้สคริปต์ Node ระบายสีตามบทบาท (ลูกค้า/พนักงาน)

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
# วงละ 12 จุด: พอให้ปั้นกล้ามเนื้อหน้า-หลัง (อก สะบัก ก้น น่อง) และหัวรองเท้ามน ๆ ได้
RING = 12
# Subdivision ทำวง 12 จุดหดเข้าราว 6%
SMOOTH_SHRINK = 1.065


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


def tube(name, rings, up=(0, 0, 1), cap_start=0.6, cap_end=0.6, floor=None, grow=SMOOTH_SHRINK, level=False, power=2.0):
    """
    ท่อผ่านจุดกึ่งกลาง rings = [((x, y, z), รัศมีด้านข้าง, รัศมีแกน up[, รัศมีด้านตรงข้าม up])] วงละ RING จุด
    ใส่รัศมีตัวที่ 4 เมื่อด้านหน้า-หลังไม่เท่ากัน (อกยื่น/หลังแบน, ก้น, น่อง, หัวรองเท้ายาวกว่าส้น)
    power > 2 = วงเหลี่ยมมนแบบ superellipse (ลำตัว, หัวรองเท้า) แทนวงรีที่ปลายแหลม
    รัศมีเป็นขนาดหลังเกลาผิว — โครงจริงขยายด้วย grow เพราะ Subdivision ทำวงหดเข้า
    ปลายปิดด้วยสี่เหลี่ยมรอบจุดกลาง (ดันออกเป็นโดม cap × รัศมี); floor = ตัดใต้ให้เรียบที่ความสูงนี้
    level = ทุกวงขนานพื้น (ท่อแนวตั้งที่จุดกลางเยื้องไปหน้า-หลัง เช่นรองเท้า) แทนการตั้งฉากกับแนวท่อ
    """
    rings = [(ring[0], ring[1] * grow, ring[2] * grow, (ring[3] if len(ring) > 3 else ring[2]) * grow) for ring in rings]
    centers = [b(*ring[0]) for ring in rings]
    up = b(*up).normalized()
    exponent = 2 / power
    verts, faces = [], []
    for index, (center, (_, side_r, up_r, back_r)) in enumerate(zip(centers, rings)):
        tangent = (centers[min(index + 1, len(centers) - 1)] - centers[max(index - 1, 0)]).normalized()
        if level:
            tangent = Vector((0, 0, 1 if tangent.z >= 0 else -1))
        front = (up - tangent * up.dot(tangent)).normalized()
        side = front.cross(tangent).normalized()
        for k in range(RING):
            angle = 2 * math.pi * k / RING
            c, s_ = math.cos(angle), math.sin(angle)
            c, s_ = math.copysign(abs(c) ** exponent, c), math.copysign(abs(s_) ** exponent, s_)
            verts.append(center + side * (side_r * c) + front * ((up_r if s_ >= 0 else back_r) * s_))
    for ring in range(len(rings) - 1):
        for k in range(RING):
            a, c = ring * RING + k, ring * RING + (k + 1) % RING
            faces.append((a, c, c + RING, a + RING))
    for ring, cap, direction in ((0, cap_start, -1), (len(rings) - 1, cap_end, 1)):
        neighbor = centers[ring + (1 if direction < 0 else -1)]
        out = (centers[ring] - neighbor).normalized()
        if level:
            out = Vector((0, 0, 1 if out.z >= 0 else -1))
        radius = (rings[ring][1] + (rings[ring][2] + rings[ring][3]) / 2) / 2
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
# ตัวเลขขยายเผื่อหัวหดเข้าหลังเกลาไว้แล้ว (กว้างจริง ~0.155 ม., สูง ~0.23 ม.)
HEAD_PROFILE = [
    (1.700, 0.0), (1.695, 0.037), (1.686, 0.058), (1.672, 0.072), (1.655, 0.081), (1.635, 0.085),
    (1.612, 0.086), (1.59, 0.085), (1.57, 0.083), (1.55, 0.079), (1.53, 0.073), (1.512, 0.066),
    (1.497, 0.057), (1.486, 0.045), (1.479, 0.026), (1.476, 0.0),
]
# กล่องแบ่ง 6×6 ช่องหดน้อยกว่า 4×4 ที่ตัวเลขข้างบนวัดไว้ (~3%)
HEAD_GRID = 5
HEAD_SCALE = 0.975
# หน้า-หลังยาวกว่าด้านข้าง (ลึก ~0.195 ม.) และหัวเยื้องไปหน้าคอเล็กน้อย
HEAD_DEPTH = 1.18
HEAD_FORWARD = 0.012
HEAD_CENTER = Vector((0, -HEAD_FORWARD, 1.59))


def head_radius(height):
    for (y0, r0), (y1, r1) in zip(HEAD_PROFILE, HEAD_PROFILE[1:]):
        if y1 <= height <= y0:
            return r0 + (r1 - r0) * (y0 - height) / (y0 - y1)
    return 0.0


def bump(value, center, width):
    return math.exp(-((value - center) / width) ** 2)


def head_point(unit):
    """จุดบนผิวหัวในทิศ unit (ลูกบอลหน่วย): ทรงไข่ตาม HEAD_PROFILE + รายละเอียดหน้า-หลัง
    คางยื่น สันคิ้วนูน หน้าแบนกว่าข้างหัว ท้ายทอยนูน — คืน (จุด, ความสูง, ทิศหน้า −1…1)"""
    top, bottom = HEAD_PROFILE[0][0], HEAD_PROFILE[-1][0]
    height = bottom + (unit.z + 1) / 2 * (top - bottom)
    ring = math.hypot(unit.x, unit.y)
    scale = head_radius(height) * HEAD_SCALE / ring if ring > 1e-6 else 0
    # unit.y < 0 คือด้านหน้า (Blender หน้า = −Y)
    front = -unit.y / ring if ring > 1e-6 else 0
    facing = max(0.0, front) ** 2
    forward = (
        0.009 * bump(height, 1.494, 0.016) * facing  # คาง
        + 0.004 * bump(height, 1.618, 0.01) * facing  # สันคิ้ว
        - 0.004 * bump(height, 1.56, 0.03) * facing  # หน้าแบนช่วงแก้ม
    )
    backward = 0.007 * bump(height, 1.6, 0.03) * max(0.0, -front) ** 2  # ท้ายทอย
    y = unit.y * scale * HEAD_DEPTH - HEAD_FORWARD - forward + backward
    # กรามเป็นเหลี่ยมนิด ๆ: ด้านข้างล่างใต้หูกว้างออก
    x = unit.x * scale * (1 + 0.05 * bump(height, 1.515, 0.02) * (1 - abs(front)))
    return Vector((x, y, height)), height, front


def head_shell(name, keep=None, offset=0.0):
    shape = bmesh.new()
    bmesh.ops.create_cube(shape, size=2)
    bmesh.ops.subdivide_edges(shape, edges=shape.edges[:], cuts=HEAD_GRID, use_grid_fill=True)
    drop = []
    for vertex in shape.verts:
        point, height, front = head_point(vertex.co.normalized())
        if keep and not keep(height, front):
            drop.append(vertex)
        vertex.co = point + (point - HEAD_CENTER).normalized() * offset if offset else point
    if drop:
        bmesh.ops.delete(shape, geom=drop, context="VERTS")
    mesh = bpy.data.meshes.new(name)
    shape.to_mesh(mesh)
    shape.free()
    part = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(part)
    return part


def head():
    """กล่องแบ่ง 6×6 → ลูกบอล → ยืดแต่ละชั้นให้กว้างเท่าเงาหัวที่ความสูงนั้น + รายละเอียดหน้า"""
    return head_shell("Head")


def hair():
    """ผมสั้นแนบหัว: ผิวหัวดันออกจากกลางหัว 9 มม. (หนาเท่ากันทั้งข้างหัวและกลางกระหม่อม) แล้วตัดส่วนล่างทิ้ง
    — ไรผมหน้าผากสูง ข้างหูต่ำลง ท้ายทอยต่ำสุด"""
    return head_shell("Hair", keep=lambda height, front: height >= 1.592 + 0.052 * front, offset=0.009)


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
    # กางเกง (เชิงกราน): สะโพกกว้าง ก้นนูนไปหลัง ขอบเอวซ่อนใต้ชายเสื้อ
    # วง: (กึ่งกลาง, ครึ่งกว้าง, ครึ่งลึกด้านหน้า, ครึ่งลึกด้านหลัง)
    parts.append(tube("Pelvis", [
        ((0, 0.79, 0.0), 0.11, 0.085, 0.09),
        ((0, 0.83, -0.004), 0.152, 0.098, 0.112),
        ((0, 0.88, -0.006), 0.17, 0.104, 0.122),
        ((0, 0.93, -0.006), 0.17, 0.106, 0.114),
        ((0, 0.975, -0.004), 0.162, 0.102, 0.104),
        ((0, 1.0, 0.0), 0.156, 0.1, 0.1),
    ], cap_start=0.15, cap_end=0.3, power=2.2))
    # เสื้อยืด: ชายเสื้อพับหนา, อกยื่นไปหน้า, สะบักนูนด้านหลัง, ไหล่ลาด, คอกลมมีขอบยาง
    parts.append(tube("Shirt", [
        ((0, 0.945, -0.004), 0.179, 0.118, 0.118),
        ((0, 0.955, -0.004), 0.181, 0.12, 0.12),
        ((0, 0.968, -0.004), 0.175, 0.114, 0.114),
        ((0, 1.04, 0.0), 0.158, 0.104, 0.108),
        ((0, 1.12, 0.004), 0.163, 0.11, 0.104),
        ((0, 1.19, 0.006), 0.176, 0.124, 0.106),
        ((0, 1.26, 0.004), 0.183, 0.118, 0.114),
        ((0, 1.32, 0.0), 0.186, 0.102, 0.104),
        ((0, 1.365, -0.004), 0.172, 0.088, 0.088),
        # บ่าลาดขึ้นหาคอ (กล้ามบ่า) แล้วเป็นขอบคอเสื้อรอบคอ
        ((0, 1.395, -0.006), 0.142, 0.076, 0.074),
        ((0, 1.418, -0.006), 0.098, 0.072, 0.07),
        ((0, 1.432, -0.006), 0.08, 0.068, 0.066),
        ((0, 1.44, -0.006), 0.075, 0.065, 0.063),
    ], cap_start=0.1, cap_end=0.05, power=2.3))
    # คอ: ท่อสั้นจากในคอเสื้อขึ้นไปซ่อนใต้คาง (ชิ้น "Collar" ผูกกระดูก Neck)
    parts.append(tube("Collar", [
        ((0, 1.39, -0.008), 0.056, 0.058, 0.054),
        ((0, 1.45, -0.004), 0.053, 0.056, 0.052),
        ((0, 1.53, 0.004), 0.049, 0.053, 0.049),
    ], cap_start=0.2, cap_end=0.2))
    # จมูก: สันจมูกจากหว่างคิ้วลาดลงมา ปลายจมูกกว้างกว่าสัน
    parts.append(tube("Nose", [
        ((0, 1.61, 0.094), 0.008, 0.005),
        ((0, 1.59, 0.103), 0.01, 0.008),
        ((0, 1.573, 0.111), 0.015, 0.011),
    ], up=(0, 1, 0), cap_start=0.3, cap_end=0.7))
    for sign in (-1, 1):
        side = "LR"[sign > 0]
        # แขนผิวจากในไหล่ถึงข้อมือ (งอได้ด้วยน้ำหนักผิว) — ต้นแขนซ่อนในแขนเสื้อ
        # หน้า (+z) = กล้ามแขนท่อนบน/ปลายแขนด้านงอ, หลัง (−z) = ไตรเซ็ปส์และปุ่มศอก
        parts.append(tube(f"Arm{side}", [
            ((sign * 0.15, 1.385, 0), 0.038, 0.038),
            ((sign * 0.178, 1.345, 0), 0.048, 0.048),
            ((sign * 0.187, 1.27, 0), 0.045, 0.044, 0.047),
            ((sign * 0.192, 1.2, 0), 0.042, 0.045, 0.043),
            ((sign * 0.195, 1.13, 0), 0.039, 0.041, 0.04),
            # วงถี่รอบศอกให้ผิวงอโค้งไม่หัก
            ((sign * 0.197, 1.09, 0), 0.036, 0.036, 0.038),
            ((sign * 0.198, 1.065, 0), 0.035, 0.035, 0.04),
            ((sign * 0.2, 1.035, 0), 0.037, 0.039, 0.038),
            ((sign * 0.202, 0.99, 0), 0.037, 0.038, 0.036),
            ((sign * 0.205, 0.93, 0), 0.032, 0.033, 0.031),
            ((sign * 0.208, 0.87, 0), 0.026, 0.027, 0.026),
            ((sign * 0.21, 0.83, 0.001), 0.021, 0.026),
            ((sign * 0.21, 0.812, 0.002), 0.02, 0.027),
        ], cap_start=0.7, cap_end=0.3))
        # แขนเสื้อสั้นถึงกลางต้นแขน: โคนจมในตัวเสื้อ ปลายพับหนาเล็กน้อย หลวมกว่าแขน ~1 ซม.
        parts.append(tube(f"Sleeve{side}", [
            ((sign * 0.152, 1.4, 0), 0.044, 0.044),
            ((sign * 0.181, 1.35, 0), 0.055, 0.055),
            ((sign * 0.191, 1.29, 0), 0.053, 0.053),
            ((sign * 0.197, 1.225, 0), 0.052, 0.053),
            ((sign * 0.199, 1.207, 0), 0.054, 0.055),
            ((sign * 0.2, 1.196, 0), 0.052, 0.053),
        ], cap_start=0.3, cap_end=0.04))
        # ฝ่ามือแบน (ฝ่ามือหันเข้าหาต้นขา) กว้างขึ้นจนถึงข้อนิ้ว
        parts.append(tube(f"Palm{side}", [
            ((sign * 0.21, 0.815, 0.004), 0.02, 0.027),
            ((sign * 0.211, 0.795, 0.006), 0.018, 0.038),
            ((sign * 0.212, 0.77, 0.008), 0.017, 0.044),
            ((sign * 0.211, 0.745, 0.008), 0.016, 0.045),
            ((sign * 0.21, 0.731, 0.008), 0.014, 0.043),
        ], cap_start=0.3, cap_end=0.3))
        # นิ้วสี่นิ้วเรียงหน้า-หลัง (ชี้ลงข้างขา) — วงที่ข้อนิ้วให้งอโค้งเข้าหาฝ่ามือทีละข้อ
        for index, (z, length) in enumerate(((0.031, 0.074), (0.011, 0.082), (-0.009, 0.077), (-0.027, 0.062))):
            x = sign * 0.21
            curl = -sign * 0.016  # ปลายนิ้วโค้งเข้าหาลำตัว (ฝั่งฝ่ามือ)
            parts.append(tube(f"Finger{index}{side}", [
                ((x, 0.735, 0.008 + z), 0.0088, 0.009),
                ((x + curl * 0.15, 0.735 - length * 0.25, 0.008 + z), 0.0083, 0.0085),
                ((x + curl * 0.4, 0.735 - length * 0.5, 0.008 + z * 0.98), 0.0079, 0.008),
                ((x + curl * 0.7, 0.735 - length * 0.76, 0.008 + z * 0.96), 0.0072, 0.0074),
                ((x + curl, 0.735 - length, 0.008 + z * 0.95), 0.0065, 0.0067),
            ], cap_start=0.3, cap_end=0.7))
        parts.append(tube(f"Thumb{side}", [
            ((sign * 0.207, 0.8, 0.026), 0.012, 0.013),
            ((sign * 0.204, 0.78, 0.042), 0.011, 0.011),
            ((sign * 0.2, 0.758, 0.052), 0.0095, 0.0095),
            ((sign * 0.196, 0.738, 0.056), 0.0085, 0.0085),
        ], cap_start=0.2, cap_end=0.7))
        # ขากางเกงยีนส์ทรงกระบอก: หน้าขาอูมกว่าหลังขา, ผ้าเผื่อรอบเข่า/น่อง, ปลายขาพับคลุมขอบรองเท้า
        parts.append(tube(f"Leg{side}", [
            ((sign * 0.09, 0.9, 0), 0.082, 0.088, 0.092),
            ((sign * 0.09, 0.84, 0), 0.086, 0.09, 0.094),
            ((sign * 0.092, 0.74, 0), 0.077, 0.084, 0.08),
            ((sign * 0.094, 0.63, 0), 0.066, 0.072, 0.068),
            # วงถี่รอบเข่าให้ผ้างอโค้งไม่หัก
            ((sign * 0.095, 0.54, 0), 0.059, 0.064, 0.06),
            ((sign * 0.095, 0.49, 0), 0.058, 0.064, 0.06),
            ((sign * 0.095, 0.44, -0.003), 0.057, 0.06, 0.063),
            ((sign * 0.095, 0.34, -0.004), 0.056, 0.058, 0.064),
            ((sign * 0.095, 0.22, -0.002), 0.054, 0.057, 0.058),
            ((sign * 0.095, 0.14, 0), 0.055, 0.059, 0.06),
            ((sign * 0.095, 0.115, 0.002), 0.057, 0.062, 0.062),
            ((sign * 0.095, 0.1, 0.002), 0.056, 0.061, 0.061),
        ], cap_start=0.3, cap_end=0.05))
        # รองเท้าผ้าใบ: วงเหลี่ยมมน (หัวมนกว้างไม่แหลม) ซ้อนจากพื้นขึ้นไป หัวรองเท้าลาดลงหาปลายเท้า
        # ยาว ~0.27 ม. (ส้น −0.062 ถึงปลาย +0.206 จากข้อเท้า) ข้อรองเท้าจมในปลายขากางเกง
        x = sign * 0.095
        parts.append(tube(f"Shoe{side}", [
            # วงละความสูง: (กึ่งกลาง, ครึ่งกว้าง, ครึ่งยาวไปหน้า, ครึ่งยาวไปหลัง)
            # วงคู่ชิดกันที่ขอบล่าง = รอยต่อคมกับพื้นรองเท้า
            ((x, 0.022, 0.03), 0.052, 0.176, 0.092),
            ((x, 0.0235, 0.03), 0.052, 0.176, 0.092),
            ((x, 0.036, 0.03), 0.054, 0.178, 0.094),
            ((x, 0.052, 0.03), 0.052, 0.172, 0.09),
            ((x, 0.068, 0.026), 0.046, 0.15, 0.084),
            ((x, 0.084, 0.018), 0.04, 0.11, 0.078),
            ((x, 0.098, 0.01), 0.035, 0.07, 0.07),
            ((x, 0.108, 0.006), 0.032, 0.05, 0.058),
        ], cap_start=0.02, cap_end=0.12, level=True, power=3.2))
        # พื้นรองเท้าหนา 2.2 ซม. ขอบคมบน-ล่าง (วงคู่) กว้างกว่าตัวรองเท้า 2–4 มม.
        parts.append(tube(f"Sole{side}", [
            ((x, 0.0, 0.03), 0.054, 0.18, 0.095),
            ((x, 0.0015, 0.03), 0.054, 0.18, 0.095),
            ((x, 0.0205, 0.03), 0.054, 0.18, 0.095),
            ((x, 0.022, 0.03), 0.054, 0.18, 0.095),
        ], cap_start=0.02, cap_end=0.02, level=True, power=3.2))
        # เชือกผูก/ลิ้นรองเท้า: แถบนูนบาง ๆ บนหลังเท้า
        parts.append(tube(f"Laces{side}", [
            ((x, 0.113, 0.05), 0.017, 0.005),
            ((x, 0.1, 0.09), 0.018, 0.005),
            ((x, 0.088, 0.126), 0.016, 0.005),
        ], up=(0, 1, 0), cap_start=0.4, cap_end=0.4))
        parts.extend(ear(sign))
    return parts


def cage_parts():
    """ชิ้นโครงตาข่ายแยกกัน (ยังไม่รวม) — build-cafe-customer-mesh.py ใช้ผูกแต่ละชิ้นกับกระดูก"""
    return [head(), hair(), *body_parts()]


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
