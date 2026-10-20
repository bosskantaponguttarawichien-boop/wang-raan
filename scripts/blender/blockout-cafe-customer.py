"""
ขั้นที่ 1 ของการปั้น mannequin ใหม่: blockout = ร่างตัวละครด้วยกล่องสี่เหลี่ยมก่อนปั้นจริง
ใช้เช็กสัดส่วน (หัว ลำตัว แขน ขา มือ เท้า) เทียบภาพอ้างอิงให้ลงตัวก่อนเสียเวลาเกลาผิว

ตัวเลขวัดจากภาพอ้างอิง (ตุ๊กตาขาวยืนตรง) แล้วแปลงให้สูง 1.03 ม. เท่าโมเดลตอนนี้
พิกัดแบบ glTF: X ข้าง, Y ขึ้น (พื้น = 0), Z หน้า — หน่วยเมตร

รัน: python scripts/blender/blockout-cafe-customer.py [ไฟล์ปลายทาง.glb]
"""
import math
import sys
from pathlib import Path

import bpy

OUT = Path(sys.argv[-1]) if sys.argv[-1].endswith(".glb") else Path(__file__).resolve().parent / "cafe-customer-blockout.glb"


def b(x, y, z=0.0):
    """glTF (Y ขึ้น, หน้า +Z) → Blender (Z ขึ้น, หน้า -Y)"""
    return (x, -z, y)


def box(name, center, size, tilt=0.0):
    """กล่องขนาด (กว้าง, สูง, ลึก) ที่จุดกึ่งกลาง; tilt = เอียงซ้าย-ขวาในมุมมองด้านหน้า (เรเดียน)"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=b(*center))
    part = bpy.context.active_object
    part.name = name
    part.scale = (size[0], size[2], size[1])
    part.rotation_euler = (0, tilt, 0)
    return part


def limb(name, top, bottom, width, depth, z=0.0):
    """กล่องแขน/ขาจากข้อต่อบนถึงข้อต่อล่าง (มุมมองด้านหน้า)"""
    dx, dy = bottom[0] - top[0], bottom[1] - top[1]
    center = ((top[0] + bottom[0]) / 2, (top[1] + bottom[1]) / 2, z)
    return box(name, center, (width, math.hypot(dx, dy), depth), tilt=-math.atan2(dx, -dy))


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # หัวกลมใหญ่ กว้างกว่าลำตัว ~1.2 เท่า สูงราว 30% ของตัว
    box("Head", (0, 0.876), (0.30, 0.31, 0.28))
    # หูอยู่ครึ่งล่างของหัว ยื่นออกข้างเล็กน้อย
    for sign in (-1, 1):
        box(f"Ear{'LR'[sign > 0]}", (sign * 0.16, 0.824), (0.05, 0.088, 0.05))
    # คอสั้นมาก เห็นเป็นแค่ขอบปลอกคอ
    box("Neck", (0, 0.714), (0.088, 0.016, 0.08))
    # ลำตัวทรงลูกแพร์: อก (แคบ) → พุง (กว้างสุด ยื่นหน้า) → สะโพก
    box("Chest", (0, 0.655), (0.20, 0.105, 0.15))
    box("Belly", (0, 0.525, 0.012), (0.245, 0.15, 0.19))
    box("Pelvis", (0, 0.40), (0.235, 0.10, 0.17))
    for sign in (-1, 1):
        side = "LR"[sign > 0]
        # แขนห้อยกางออกนิด ๆ ยาวถึงต้นขา
        shoulder, elbow, wrist, hand_end = (sign * 0.11, 0.69), (sign * 0.155, 0.545), (sign * 0.172, 0.42), (sign * 0.178, 0.314)
        limb(f"UpperArm{side}", shoulder, elbow, 0.07, 0.066)
        limb(f"ForeArm{side}", elbow, wrist, 0.058, 0.058)
        # มือถุงมือ: แบนข้าง ลึกหน้า-หลัง, นิ้วโป้งเป็นกล่องเล็กด้านหน้า
        limb(f"Hand{side}", wrist, hand_end, 0.055, 0.075)
        box(f"Thumb{side}", (sign * 0.165, 0.375, 0.045), (0.022, 0.05, 0.025))
        # ขาตรงยาว ชิดกัน
        limb(f"Thigh{side}", (sign * 0.063, 0.38), (sign * 0.063, 0.20), 0.115, 0.12)
        limb(f"Shin{side}", (sign * 0.063, 0.20), (sign * 0.063, 0.075), 0.09, 0.095)
        # รองเท้า: ตัวรองเท้า + พื้นรองเท้าที่ใหญ่กว่านิดเป็นขอบ
        box(f"Shoe{side}", (sign * 0.063, 0.045, 0.035), (0.10, 0.06, 0.16))
        box(f"Sole{side}", (sign * 0.063, 0.008, 0.035), (0.106, 0.016, 0.166))

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", use_selection=True, export_yup=True)
    print(f"สร้าง {OUT}")


build()
