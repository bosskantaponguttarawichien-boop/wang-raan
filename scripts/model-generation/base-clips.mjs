import * as THREE from "three";

/** The unchanged legacy clips; providers append new clips without editing this file. */
export function createBaseClips(rig, role) {
  const { model, dimensions: { ANKLE_Y, THIGH, SHIN, LEG_DROP, HIPS_Y } } = rig;
  // ---- Animation: keyframe ถี่จากคลื่น sine เพื่อให้ข้อต่อเคลื่อนแบบนุ่ม ไม่หักมุมที่ปลายวงสวิง ----
  const quaternionFrames = (angles) =>
    angles.flatMap((angle) => new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0)).toArray());

  function sampled(duration, frames) {
    const times = Array.from({ length: frames + 1 }, (_, i) => (duration * i) / frames);
    const phases = times.map((time) => (time / duration) * Math.PI * 2);
    return { times, phases };
  }

  /** track หมุนจากฟังก์ชันมุม [x, y, z] ต่อ phase (0..2π ต่อรอบคลิป) — ทุกเทอมเป็น sin/cos ของ phase จำนวนเต็มเท่า คลิปจึงวนต่อกันเนียน */
  const eulerTrack = (name, cycle, angles, order = "XYZ") =>
    new THREE.QuaternionKeyframeTrack(name + ".quaternion", cycle.times,
      cycle.phases.flatMap((phase) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles(phase), order)).toArray()));

  // ---- Idle: ยืนรอ 6 วิ — หายใจ 2 รอบ (อกพองนิด ไหล่ยกตาม), ถ่ายน้ำหนักซ้าย-ขวา 1 รอบ (สะโพกเลื่อน ขาเอียงให้เท้าอยู่ที่เดิม
  // ลำตัวเอียงกลับให้หัวตรง), หันมองรอบ ๆ ช้า ๆ
  const IDLE_DURATION = 6;
  const idleCycle = sampled(IDLE_DURATION, 72);
  const IDLE_SHIFT = 0.014;
  const shift = (phase) => IDLE_SHIFT * Math.sin(phase);
  const breath = (phase) => 0.5 - 0.5 * Math.cos(phase * 2);
  // เท้าอยู่กับที่: สะโพกเลื่อน x → ขาทั้งสองเอียงรอบแกน z ด้วยมุมเท่ากัน แล้วข้อเท้าเอียงกลับ
  const relaxedKnee = (phase) => 0.05 * Math.max(0, Math.sin(phase));
  const legLean = (phase) => Math.atan2(shift(phase), HIPS_Y - LEG_DROP - ANKLE_Y);
  const idle = new THREE.AnimationClip("Idle", IDLE_DURATION, [
    new THREE.VectorKeyframeTrack("Hips.position", idleCycle.times,
      // เชิงกรานเอียง → ข้อสะโพกข้างรับน้ำหนักต่ำลง (0.09 ม. × มุมเอียง) ยกสะโพกชดเชยให้เท้าข้างนั้นไม่จมพื้น
      idleCycle.phases.flatMap((phase) => [shift(phase), HIPS_Y + 0.0026 * Math.abs(Math.sin(phase)), 0])),
    eulerTrack("Hips", idleCycle, (phase) => [0, 0, 0.025 * Math.sin(phase)]),
    eulerTrack("LeftLeg", idleCycle, (phase) => [0, 0, -legLean(phase) - 0.025 * Math.sin(phase)]),
    eulerTrack("RightLeg", idleCycle, (phase) => [0, 0, -legLean(phase) - 0.025 * Math.sin(phase)]),
    // ขาที่รับน้ำหนักน้อยลงงอเข่านิด ข้อเท้างอกลับให้ฝ่าเท้าราบ (ไม่จิกปลายเท้าลงพื้น)
    eulerTrack("LeftFoot", idleCycle, (phase) => [-relaxedKnee(phase), 0, legLean(phase)]),
    eulerTrack("RightFoot", idleCycle, (phase) => [-relaxedKnee(phase + Math.PI), 0, legLean(phase)]),
    eulerTrack("LeftLowerLeg", idleCycle, (phase) => [relaxedKnee(phase), 0, 0]),
    eulerTrack("RightLowerLeg", idleCycle, (phase) => [relaxedKnee(phase + Math.PI), 0, 0]),
    eulerTrack("Spine", idleCycle, (phase) => [-0.012 * breath(phase), 0.02 * Math.sin(phase + 0.8), -0.04 * Math.sin(phase)]),
    eulerTrack("Neck", idleCycle, (phase) => [0.01 * breath(phase), 0.08 * Math.sin(phase) + 0.03 * Math.sin(phase * 3 + 1), 0.015 * Math.sin(phase)]),
    eulerTrack("Head", idleCycle, (phase) => [0.02 * Math.sin(phase * 2 + 0.5), 0.2 * Math.sin(phase) + 0.07 * Math.sin(phase * 3 + 1), 0]),
    // แขนผ่อนคลาย: กางออกจากตัวนิด ศอกงอ ~13° ข้อมือห้อยงอเข้า — ไม่ห้อยตรงแข็งชิดลำตัว
    eulerTrack("LeftArm", idleCycle, (phase) => [-0.04 + 0.015 * Math.sin(phase), 0, -0.07 - 0.01 * breath(phase)]),
    eulerTrack("RightArm", idleCycle, (phase) => [-0.04 - 0.015 * Math.sin(phase), 0, 0.07 + 0.01 * breath(phase)]),
    eulerTrack("LeftForeArm", idleCycle, (phase) => [-0.22 + 0.03 * Math.sin(phase * 2), 0, 0.04]),
    eulerTrack("RightForeArm", idleCycle, (phase) => [-0.22 - 0.03 * Math.sin(phase * 2), 0, -0.04]),
    eulerTrack("LeftHand", idleCycle, () => [-0.06, 0, 0.06]),
    eulerTrack("RightHand", idleCycle, () => [-0.06, 0, -0.06]),
  ]);

  // ---- Work (พนักงาน): ยืนหลังเคาน์เตอร์ มือสองข้างวางทำงานบนเคาน์เตอร์ (ข้อมือสูง ~1 ม. หน้าตัว ~0.3 ม.) ก้มมองมือ
  // มือขยับสลับกันเหมือนกดเครื่องคิดเงิน/จัดของ, ราวกลางคลิปเงยหน้ามองไปหน้าร้าน แล้วก้มกลับ, ตัวโยกช้า ๆ
  const WORK_DURATION = 8;
  const workCycle = sampled(WORK_DURATION, 96);
  // 0 → 1 → 0 ช่วงเงยหน้า (กลางคลิป) แบบนุ่ม
  const lookUp = (phase) => Math.max(0, Math.cos(phase - Math.PI)) ** 3;
  /** ปลายแขน: งอ (x) แล้วหันเข้าหากลางตัว (yaw) โดยบิดรอบแกนท่อนแขนก่อน (roll) */
  const pronatedTrack = (name, bendYaw, roll) =>
    new THREE.QuaternionKeyframeTrack(name + ".quaternion", workCycle.times, workCycle.phases.flatMap((phase) => {
      const [bend, yaw] = bendYaw(phase);
      return new THREE.Quaternion().setFromEuler(new THREE.Euler(bend, yaw, 0, "YXZ"))
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, roll, 0))).toArray();
    }));
  const work = new THREE.AnimationClip("Work", WORK_DURATION, [
    new THREE.VectorKeyframeTrack("Hips.position", workCycle.times,
      workCycle.phases.flatMap((phase) => [0.008 * Math.sin(phase), HIPS_Y - 0.003, 0])),
    eulerTrack("LeftLeg", workCycle, (phase) => [0, 0, -0.01 * Math.sin(phase)]),
    eulerTrack("RightLeg", workCycle, (phase) => [0, 0, -0.01 * Math.sin(phase)]),
    eulerTrack("LeftFoot", workCycle, (phase) => [0, 0, 0.01 * Math.sin(phase)]),
    eulerTrack("RightFoot", workCycle, (phase) => [0, 0, 0.01 * Math.sin(phase)]),
    eulerTrack("Spine", workCycle, (phase) => [0.09 - 0.05 * lookUp(phase) - 0.01 * (0.5 - 0.5 * Math.cos(phase * 4)), 0.03 * Math.sin(phase * 2), -0.012 * Math.sin(phase)]),
    eulerTrack("Neck", workCycle, (phase) => [0.16 - 0.16 * lookUp(phase), 0.04 * Math.sin(phase * 3), 0]),
    eulerTrack("Head", workCycle, (phase) => [0.2 - 0.22 * lookUp(phase), 0.06 * Math.sin(phase * 2 + 0.4) + 0.12 * lookUp(phase), 0]),
    // ต้นแขนยื่นไปหน้า ปลายแขนเกือบขนานพื้นและหมุนเข้าหากลางตัว — มือขยับขึ้นลงสลับกัน (ความถี่สูงกว่าตัวโยก)
    eulerTrack("LeftArm", workCycle, (phase) => [-0.32 + 0.04 * Math.sin(phase * 5), 0, 0.1], "YXZ"),
    eulerTrack("RightArm", workCycle, (phase) => [-0.3 + 0.04 * Math.sin(phase * 5 + 2.2), 0, -0.1], "YXZ"),
    // คว่ำมือลงบนเคาน์เตอร์: บิดรอบแกนท่อนแขน แบ่งครึ่งระหว่างปลายแขนกับข้อมือ (บิดที่เดียวผิวจะเป็นเกลียว)
    pronatedTrack("LeftForeArm", (phase) => [-1.16 - 0.06 * Math.sin(phase * 5 + 0.6) + 0.1 * lookUp(phase), 0.35], 0.75),
    pronatedTrack("RightForeArm", (phase) => [-1.14 - 0.06 * Math.sin(phase * 5 + 2.8) + 0.1 * lookUp(phase), -0.35], -0.8),
    eulerTrack("LeftHand", workCycle, (phase) => [0.12 + 0.08 * Math.sin(phase * 5 + 1.2), 0.75, 0], "YXZ"),
    eulerTrack("RightHand", workCycle, (phase) => [0.12 + 0.08 * Math.sin(phase * 5 + 3.4), -0.8, 0], "YXZ"),
  ]);

  // Solve a two-bone leg toward a planted/swinging ankle instead of swinging
  // every joint independently. ก้าวละ 0.45 ม. ราว 126 ก้าว/นาที (~0.95 ม./วิ) เท่าคนเดินในร้าน
  const WALK_DURATION = 0.95;
  const WALK_DISTANCE = 0.9;
  const walkCycle = sampled(WALK_DURATION, 60);
  model.userData.walkCycleDistance = WALK_DISTANCE;
  // สะโพกต่ำสุดตอนสองขากางสุด (ขาเหยียดถึงพื้นพอดี) สูงสุดตอนขาผ่านกัน — ตอนนั้นขาที่รับน้ำหนักเกือบเหยียดตรง
  // (ก้าวละ 0.45 ม.: ขากาง ±0.225 ม. ข้อสะโพกต้องต่ำลง ~3.3 ซม. จากท่ายืน)
  const hipHeights = walkCycle.phases.map((phase) => HIPS_Y - 0.034 + 0.015 * (1 - Math.cos(phase * 2)));
  function legPose(phase, hipY) {
    const t = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
    const swing = Math.max(0, (t - 0.5) * 2);
    const z = t <= 0.5
      ? WALK_DISTANCE / 4 - WALK_DISTANCE * t
      : -WALK_DISTANCE / 4 + WALK_DISTANCE / 2 * (swing * swing * (3 - 2 * swing));
    const ankleY = ANKLE_Y + 0.07 * Math.sin(Math.PI * swing) ** 2;
    const down = hipY - LEG_DROP - ankleY;
    const thigh = THIGH;
    const shin = SHIN;
    const knee = Math.acos(THREE.MathUtils.clamp((down * down + z * z - thigh * thigh - shin * shin) / (2 * thigh * shin), -1, 1));
    const hip = Math.atan2(-z, down) - Math.atan2(shin * Math.sin(knee), thigh + shin * Math.cos(knee));
    return { hip, knee, ankle: -hip - knee };
  }
  const legsAt = (offset) => walkCycle.phases.map((phase, i) => legPose(phase + offset, hipHeights[i]));
  const leftPoses = legsAt(0);
  const rightPoses = legsAt(Math.PI);
  const jointTrack = (name, poses, key) => new THREE.QuaternionKeyframeTrack(name + ".quaternion", walkCycle.times, quaternionFrames(poses.map((pose) => pose[key])));
  // แขนแกว่งสวนขา: ไปหน้ามากกว่าไปหลัง (ศูนย์กลางเอนหน้า 0.05 rad) และกางออกจากลำตัวนิดหนึ่งไม่ให้มือถูขา
  const ARM_SWING = 0.24;
  const armAngles = (offset) => walkCycle.phases.map((phase) => -0.05 + ARM_SWING * Math.cos(phase + offset));
  // ศอกงอเสมอเล็กน้อย และงอมากขึ้นตอนแขนแกว่งไปหน้า (ท่อนแขนตามแรงเหวี่ยง) งอน้อยลงตอนแกว่งไปหลัง
  const foreArmAngles = (offset) => armAngles(offset).map((a) => -0.22 + Math.min(0, a) * 0.9 + Math.max(0, a) * 0.35);
  // ข้อมือห้อยผ่อนคลาย ตามจังหวะแขนช้ากว่านิดหน่อย
  const handAngles = (offset) => walkCycle.phases.map((phase) => -0.03 + 0.04 * Math.cos(phase + offset - 0.5));
  const armTrack = (name, angles, outward) =>
    new THREE.QuaternionKeyframeTrack(name + ".quaternion", walkCycle.times, angles.flatMap((angle) => new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, outward, "XYZ")).toArray()));
  const upperBodyFrames = (sign) => walkCycle.phases.flatMap((phase) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sign * 0.012 * Math.sin(phase), sign * 0.006 * Math.cos(phase))).toArray());
  const walk = new THREE.AnimationClip("Walk", WALK_DURATION, [
    jointTrack("LeftLeg", leftPoses, "hip"), jointTrack("RightLeg", rightPoses, "hip"),
    jointTrack("LeftLowerLeg", leftPoses, "knee"), jointTrack("RightLowerLeg", rightPoses, "knee"),
    jointTrack("LeftFoot", leftPoses, "ankle"), jointTrack("RightFoot", rightPoses, "ankle"),
    // Left leg forward → left arm back, right arm forward.
    // ต้นแขนกางออก ~3° (แกน z: ซ้าย −, ขวา +) มือจึงผ่านข้างสะโพก ไม่ทะลุกางเกง
    armTrack("LeftArm", armAngles(0), -0.05),
    armTrack("RightArm", armAngles(Math.PI), 0.05),
    new THREE.QuaternionKeyframeTrack("LeftForeArm.quaternion", walkCycle.times, quaternionFrames(foreArmAngles(0))),
    new THREE.QuaternionKeyframeTrack("RightForeArm.quaternion", walkCycle.times, quaternionFrames(foreArmAngles(Math.PI))),
    new THREE.QuaternionKeyframeTrack("LeftHand.quaternion", walkCycle.times, quaternionFrames(handAngles(0))),
    new THREE.QuaternionKeyframeTrack("RightHand.quaternion", walkCycle.times, quaternionFrames(handAngles(Math.PI))),
    new THREE.QuaternionKeyframeTrack("Spine.quaternion", walkCycle.times, upperBodyFrames(1)),
    new THREE.QuaternionKeyframeTrack("Head.quaternion", walkCycle.times, upperBodyFrames(-0.6)),
    new THREE.VectorKeyframeTrack("Hips.position", walkCycle.times, hipHeights.flatMap((y) => [0, y, 0])),
  ]);

  // ใต้ต้นขาอยู่บนเบาะเก้าอี้ในฉากร้าน (ผิวบน 0.45 ม. มาตรฐานเก้าอี้ทานอาหาร) = เบาะ + ข้อสะโพกต่ำกว่า Hips + ครึ่งความหนาต้นขา
  const SEAT_TOP = 0.45;
  const THIGH_UNDER = 0.09;
  const SIT_HIPS_Y = SEAT_TOP + LEG_DROP + THIGH_UNDER;
  // ต้นขาลาดลงหาเข่าเล็กน้อย หน้าแข้งเอนไปหน้านิด → เท้าวางราบบนพื้นพอดี (ข้อเท้ากลับมาที่ ANKLE_Y)
  const SIT_SHIN_LEAN = 0.05;
  const SIT_THIGH_SLOPE = Math.asin((SIT_HIPS_Y - LEG_DROP - ANKLE_Y - SHIN * Math.cos(SIT_SHIN_LEAN)) / THIGH);
  // ท่านั่งลงค่อย ๆ เร่งแล้วชะลอ (ease in-out) และโน้มตัวไปหน้าเล็กน้อยกลางจังหวะเหมือนคนหย่อนตัวลงเก้าอี้
  // ฉากเล่นคลิปนี้ย้อนกลับ = ท่าลุกขึ้น
  const SIT_DURATION = 0.9;
  const sitTimes = Array.from({ length: 19 }, (_, i) => (SIT_DURATION * i) / 18);
  const sitEase = sitTimes.map((time) => {
    const t = time / SIT_DURATION;
    return t * t * (3 - 2 * t);
  });
  // ก้ม/เงยก่อน (X) แล้วค่อยหมุนเข้าหาลำตัว (Y) — ท่อนแขนที่ยื่นไปหน้าจึงหันเข้าด้านในได้
  const pose = (x, z = 0, y = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, "YXZ"));
  const sitTrack = (name, to) =>
    new THREE.QuaternionKeyframeTrack(name + ".quaternion", sitTimes, sitEase.flatMap((e) => new THREE.Quaternion().slerp(to, e).toArray()));
  // แขนท่านั่ง: กำหนดทิศของแต่ละท่อนในพิกัดตัว (ลำตัวตั้งตรงตอนจบท่า) แล้วหมุนกระดูกจากทิศตอนยืนไปหา
  // ศอกห้อยข้างตัวใต้ไหล่ → ข้อมืออยู่เหนือต้นขากลางตัก (ไหล่ → ข้อมือ: ข้าง +0.05, ลง 0.385, หน้า 0.24 ม.)
  // → ถุงมือวางตะแคง (นิ้วโป้งขึ้น) บนต้นขาชี้ไปทางเข่า — ทิศหาจากความยาวต้นแขน 0.29 / ปลายแขน 0.25 ม.
  const unit = (v) => new THREE.Vector3(...v).normalize();
  const sitArm = (sign) => {
    const upper = new THREE.Quaternion().setFromUnitVectors(unit([sign * 0.023, -0.29, 0]), unit([sign * 0.04, -0.286, 0.031]));
    const foreTarget = unit([-sign * 0.09, -0.099, 0.209]).applyQuaternion(upper.clone().invert());
    const fore = new THREE.Quaternion().setFromUnitVectors(unit([sign * 0.012, -0.25, 0]), foreTarget);
    const handTarget = unit([0, -0.3, 0.95]).applyQuaternion(upper.clone().multiply(fore).invert());
    const hand = new THREE.Quaternion().setFromUnitVectors(unit([0, -1, 0]), handTarget);
    return { upper, fore, hand };
  };
  const [leftSitArm, rightSitArm] = [sitArm(-1), sitArm(1)];
  const sit = new THREE.AnimationClip("Sit", SIT_DURATION, [
    // สะโพกลดตามมุมขาที่งอ (ไม่ใช่เส้นตรง) ข้อเท้าจึงอยู่ระดับพื้นตลอดท่า — เท้าไม่จมพื้นระหว่างนั่งลง/ลุก
    new THREE.VectorKeyframeTrack("Hips.position", sitTimes, sitEase.flatMap((e) => {
      const thighAngle = e * (Math.PI / 2 - SIT_THIGH_SLOPE);
      return [0, LEG_DROP + ANKLE_Y + THIGH * Math.cos(thighAngle) + SHIN * Math.cos(e * SIT_SHIN_LEAN), 0];
    })),
    new THREE.QuaternionKeyframeTrack("Spine.quaternion", sitTimes, quaternionFrames(sitTimes.map((time) => 0.22 * Math.sin((Math.PI * time) / SIT_DURATION)))),
    // GLB faces +Z. Rotate the character toward the chair front so thighs and
    // forearms move forward (+Z) while the knees fold down.
    sitTrack("LeftLeg", pose(SIT_THIGH_SLOPE - Math.PI / 2)),
    sitTrack("RightLeg", pose(SIT_THIGH_SLOPE - Math.PI / 2)),
    sitTrack("LeftLowerLeg", pose(Math.PI / 2 - SIT_THIGH_SLOPE - SIT_SHIN_LEAN)),
    sitTrack("RightLowerLeg", pose(Math.PI / 2 - SIT_THIGH_SLOPE - SIT_SHIN_LEAN)),
    sitTrack("LeftFoot", pose(SIT_SHIN_LEAN)),
    sitTrack("RightFoot", pose(SIT_SHIN_LEAN)),
    sitTrack("LeftArm", leftSitArm.upper),
    sitTrack("RightArm", rightSitArm.upper),
    sitTrack("LeftForeArm", leftSitArm.fore),
    sitTrack("RightForeArm", rightSitArm.fore),
    sitTrack("LeftHand", leftSitArm.hand),
    sitTrack("RightHand", rightSitArm.hand),
  ]);
  return role === "staff" ? [idle, walk, sit, work] : [idle, walk, sit];
}
