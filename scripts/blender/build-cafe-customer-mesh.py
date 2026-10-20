"""
สร้างผิว mannequin ลูกค้าจากโครงตาข่ายสี่เหลี่ยม (blockout-cafe-customer.py) แล้วผูกกับกระดูก

- แต่ละชิ้นเกลาผิวด้วย Subdivision Surface 2 ขั้น (โครงตาข่ายตั้งขนาดไว้สำหรับ 2 ขั้น) แล้วลดจำนวนสามเหลี่ยม
  (Decimate) ให้เท่างบของรุ่นเดิม — รูปทรงยังเป็นผิวเรียบแบบ 2 ขั้น แค่ใช้สามเหลี่ยมน้อยลง
- ชิ้นส่วนแยกตามรอยต่อตุ๊กตา: ชิ้นละกระดูก (หัว คอ มือ รองเท้า แข็งทั้งชิ้น)
- รอบข้อต่อ (ศอก ข้อมือ เข่า ข้อเท้า สะโพก-เอว) น้ำหนักค่อย ๆ ส่งต่อจากกระดูกแม่ไปกระดูกลูกในระยะ BLEND
  ผิวสองฝั่งรอยต่อได้น้ำหนักเท่ากัน รอยต่อจึงไม่แยกเป็นช่องตอนงอ

ผลลัพธ์คือ GLB มีแค่ผิว + กระดูก + น้ำหนักผิว ชื่อกระดูกตรงกับ create-cafe-customer-model.mjs
(ตำแหน่งข้อต่อจริงอยู่ใน JOINTS ด้านล่าง — สคริปต์ Node ต้องใช้ตำแหน่งเดียวกัน)

รัน (ต้องมี Blender หรือ pip install bpy==5.2.2 บน Python 3.13):
  python scripts/blender/build-cafe-customer-mesh.py
แล้วรัน node scripts/create-cafe-customer-model.mjs (และ --lite) เพื่อสร้างไฟล์ที่แอปใช้
"""
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib  # noqa: E402

cage = importlib.import_module("blockout-cafe-customer")

OUT_DIR = Path(__file__).resolve().parent
# ระดับการเกลาผิว: ละเอียดสำหรับ Character Lab / เบาสำหรับฉากร้านที่มีลูกค้าหลายสิบคน
# สัดส่วนสามเหลี่ยมที่เก็บไว้หลังเกลา 2 ขั้น (~30k): งบเท่ารุ่นเดิม ราว 9k (Character Lab / ลูกค้าใกล้)
# และ 2.2k (ลูกค้าไกลในฉากร้าน ที่มีพร้อมกันหลายสิบคน)
LEVELS = {"cafe-customer-mesh.glb": 0.3, "cafe-customer-mesh-lite.glb": 0.075}
# ระยะ (เมตร) ทั้งสองข้างของข้อต่อที่น้ำหนักผิวค่อย ๆ เปลี่ยนจากกระดูกแม่ไปกระดูกลูก
BLEND = 0.014
SOLE_Z = 0.002

# ข้อต่อแบบ glTF (X ข้าง, Y ขึ้น, Z หน้า) — ต้องตรงกับตำแหน่งกระดูกใน create-cafe-customer-model.mjs
JOINTS = {
    "Hips": (0, 0.40, 0),
    "Spine": (0, 0.52, 0),
    "Neck": (0, 0.70, 0),
    "Head": (0, 0.722, 0),
}
for _side, _sign in (("Left", -1), ("Right", 1)):
    JOINTS.update({
        f"{_side}Arm": (_sign * 0.09, 0.635, 0),        # หัวไหล่ (กลางโดมต้นแขน)
        f"{_side}ForeArm": (_sign * 0.141, 0.521, 0),   # รอยต่อศอก
        f"{_side}Hand": (_sign * 0.175, 0.425, 0),      # รอยต่อข้อมือ
        f"{_side}Leg": (_sign * 0.068, 0.36, 0),        # ข้อสะโพก
        f"{_side}LowerLeg": (_sign * 0.068, 0.231, 0),  # รอยต่อเข่า
        f"{_side}Foot": (_sign * 0.066, 0.065, 0),      # ข้อเท้า (ในรองเท้า)
    })
PARENT = {
    "Spine": "Hips", "Neck": "Spine", "Head": "Neck",
    **{f"{s}Arm": "Spine" for s in ("Left", "Right")},
    **{f"{s}ForeArm": f"{s}Arm" for s in ("Left", "Right")},
    **{f"{s}Hand": f"{s}ForeArm" for s in ("Left", "Right")},
    **{f"{s}Leg": "Hips" for s in ("Left", "Right")},
    **{f"{s}LowerLeg": f"{s}Leg" for s in ("Left", "Right")},
    **{f"{s}Foot": f"{s}LowerLeg" for s in ("Left", "Right")},
}


def joint(name):
    return Vector(cage.b(*JOINTS[name]))


def smoothstep(edge0, edge1, x):
    t = min(max((x - edge0) / (edge1 - edge0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def chain_weights(point, chain):
    """แขน/ขา: เริ่มที่กระดูกแรก แล้วส่งน้ำหนักให้กระดูกถัดไปเมื่อเลยข้อต่อ (วัดตามแนวท่อน)"""
    weights = {chain[0]: 1.0}
    for parent, child in zip(chain, chain[1:]):
        axis = (joint(child) - joint(parent)).normalized()
        share = smoothstep(-BLEND, BLEND, (point - joint(child)).dot(axis))
        weights = {name: weight * (1 - share) for name, weight in weights.items()}
        weights[child] = weights.get(child, 0.0) + share
    return weights


def part_weights(name, point):
    side = "Left" if name.endswith("L") else "Right"
    if name.startswith(("Head", "Ear")):
        return {"Head": 1.0}
    if name == "Collar":
        return {"Neck": 1.0}
    if name == "Torso":
        # เอว: ช่วงพุงงอตามกระดูกสันหลัง สะโพกนิ่งตาม Hips
        share = smoothstep(0.43, 0.51, point.z)
        return {"Hips": 1 - share, "Spine": share}
    if name.startswith(("UpperArm", "ForeArm", "Hand", "Thumb")):
        chain = [f"{side}Arm", f"{side}ForeArm", f"{side}Hand"]
        return {f"{side}Hand": 1.0} if name.startswith("Thumb") else chain_weights(point, chain)
    if name.startswith(("Thigh", "Shin")):
        return chain_weights(point, [f"{side}Leg", f"{side}LowerLeg", f"{side}Foot"])
    if name.startswith(("Shoe", "Sole")):
        return {f"{side}Foot": 1.0}
    raise ValueError(f"ไม่รู้ว่าชิ้น {name} ผูกกับกระดูกไหน")


def build_armature():
    data = bpy.data.armatures.new("Skeleton")
    rig = bpy.data.objects.new("CafeMannequinRig", data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    children = {name: [child for child, parent in PARENT.items() if parent == name] for name in JOINTS}
    for name in JOINTS:
        bone = data.edit_bones.new(name)
        bone.head = joint(name)
        # ปลายกระดูกชี้ไปข้อต่อลูก (ถ้ามีลูกเดียว) ไม่งั้นชี้ขึ้น/ลง 5 ซม.
        kids = children[name]
        direction = (joint(kids[0]) - joint(name)) if len(kids) == 1 else Vector((0, 0, -0.05 if "Foot" in name or "Hand" in name else 0.05))
        bone.tail = bone.head + (direction if direction.length > 0.01 else Vector((0, 0, 0.05)))
    for name, parent in PARENT.items():
        data.edit_bones[name].parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def build(filename, keep):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rig = build_armature()
    parts = cage.cage_parts()
    for part in parts:
        bpy.context.view_layer.objects.active = part
        smooth = part.modifiers.new("Smooth", "SUBSURF")
        smooth.levels = 2
        bpy.ops.object.modifier_apply(modifier=smooth.name)
        reduce = part.modifiers.new("Reduce", "DECIMATE")
        reduce.ratio = keep
        bpy.ops.object.modifier_apply(modifier=reduce.name)
        # การลดสามเหลี่ยมขยับจุดใต้พื้นรองเท้าลงต่ำกว่าพื้นได้เล็กน้อย — ยกให้ลอย 2 มม. (เผื่อเท้าเอียงตอนเดิน)
        for vertex in part.data.vertices:
            vertex.co.z = max(vertex.co.z, SOLE_Z)
        for polygon in part.data.polygons:
            polygon.use_smooth = True
        groups = {}
        for vertex in part.data.vertices:
            for bone, weight in part_weights(part.name, vertex.co).items():
                if weight < 1e-4:
                    continue
                if bone not in groups:
                    groups[bone] = part.vertex_groups.new(name=bone)
                groups[bone].add([vertex.index], weight, "REPLACE")
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    body = parts[0]
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = body.data.name = "MannequinBody"
    material = bpy.data.materials.new("Mannequin")
    body.data.materials.clear()
    body.data.materials.append(material)
    body.parent = rig
    body.modifiers.new("Armature", "ARMATURE").object = rig

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


for name, keep in LEVELS.items():
    build(name, keep)
