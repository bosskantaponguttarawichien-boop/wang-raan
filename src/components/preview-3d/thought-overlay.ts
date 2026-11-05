import * as THREE from "three";
import type { CustomerThought, StaffThought } from "@/core/simulation/presentation-contract";
import { getEmoteConfig } from "../simulation/character-thought-bubble";
import { BADGE_ASPECT, badgeArtFor, thoughtBadgeSvg } from "../simulation/thought-badge-art";
import type { VisualPresentation } from "../simulation/motion/visual-sync";

export interface ThoughtOverlayHost {
  readonly element: HTMLElement;
}

export interface ThoughtOverlayManager {
  update(
    presentation: VisualPresentation | undefined,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    customers: Map<number, { model: THREE.Object3D }>,
    staff: Array<{ model: THREE.Object3D }>,
    showThoughts: boolean,
    /** หยุดชั่วคราว = ภาพต้องนิ่งทั้งหมด ก้อนความคิดจึงต้องไม่เด้งต่อ */
    paused?: boolean,
  ): void;
  clear(): void;
  dispose(): void;
}

/** ขนาดก้อนความคิดที่ scale 1 (px) */
// The illustration needs enough physical pixels to remain legible after the
// camera scale on a phone. Smaller "notification" markers lose the character
// of the coloured badge entirely.
const BUBBLE_WIDTH = 42;
const BUBBLE_HEIGHT = Math.round(BUBBLE_WIDTH * BADGE_ASPECT);
/** ยอมให้ขอบก้อนเกยกันได้เท่านี้ (px) ก่อนเลื่อนขึ้น */
const BUBBLE_GAP = 3;
/** ตัวละครสูงราวเท่านี้ (px ต่อเมตร) ถือเป็นขนาดปกติ scale 1 */
const REFERENCE_PIXELS_PER_METER = 70;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

const scaleA = new THREE.Vector3();
const scaleB = new THREE.Vector3();
/** ก้อนความคิดโตตามการซูม (เดิมคงที่ 80×64 px จึงเล็กมากบนจอใหญ่/ซูมเข้า) */
function bubbleScale(camera: THREE.Camera, width: number, height: number) {
  scaleA.set(0, 0, 0).project(camera);
  scaleB.set(0, 1, 0).project(camera);
  const pixels = Math.hypot((scaleB.x - scaleA.x) * width / 2, (scaleB.y - scaleA.y) * height / 2);
  if (!Number.isFinite(pixels) || pixels <= 0) return 1;
  // คงให้เป็น badge เล็กเสมอ แม้บนจอใหญ่หรือซูมเข้า
  return Math.min(1.2, Math.max(0.82, pixels / REFERENCE_PIXELS_PER_METER));
}

function thoughtBadgeMarkup(thought: CustomerThought | StaffThought) {
  return `<div style="position:relative;width:${BUBBLE_WIDTH}px;height:${BUBBLE_HEIGHT}px;display:flex;filter:drop-shadow(0 1px 2px rgb(15 23 42 / 0.2))">${thoughtBadgeSvg(thought, BUBBLE_WIDTH)}</div>`;
}

/** ข้อความอ่านออกเสียง/tooltip ตามสถานะล่าสุด (เขียน DOM เฉพาะเมื่อเปลี่ยน) */
function updateLabel(el: HTMLDivElement, label: string) {
  if (el.title === label) return;
  el.title = label;
  el.setAttribute("aria-label", label);
}

export function createThoughtOverlayManager(container: HTMLElement): ThoughtOverlayManager {
  const nodes = new Map<number, HTMLDivElement>();
  const popAfterRender: { el: HTMLDivElement; bouncing: boolean }[] = [];
  const projVec = new THREE.Vector3();
  const viewport = new THREE.Vector2();
  // Keep the bubble DOM stable across animation frames.
  const contentKeys = new WeakMap<HTMLDivElement, string>();

  const update = (
    presentation: VisualPresentation | undefined,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    customers: Map<number, { model: THREE.Object3D }>,
    staff: Array<{ model: THREE.Object3D }>,
    showThoughts: boolean,
    paused = false,
  ) => {
    if (!showThoughts || !presentation) {
      if (nodes.size > 0) clear();
      return;
    }

    // ขนาดจาก renderer (ตั้งไว้ตอน resize) ไม่ใช่ clientWidth/clientHeight: การอ่านค่าจาก DOM
    // หลังเพิ่งย้ายก้อนความคิดหลายสิบก้อนในเฟรมก่อน บังคับให้เบราว์เซอร์คำนวณ layout ใหม่ทุกเฟรม
    renderer.getSize(viewport);
    const width = viewport.x || 800;
    const height = viewport.y || 600;
    const activeIds = new Set<number>();
    /** ตำแหน่งปลายหางของก้อนความคิดแต่ละก้อนบนจอ — จัดไม่ให้ซ้อนกันก่อนเขียน transform */
    const placements: { el: HTMLDivElement; x: number; y: number }[] = [];

    // 1. Process customer thoughts (รวมคนที่การจำลองให้ออกไปแล้วแต่ภาพยังเดินออกอยู่)
    for (const customer of [...presentation.customers, ...(presentation.departing ?? [])]) {
      if (!customer.thought) continue;
      const id = customer.renderAgentId;
      const rig = customers.get(id);
      if (!rig) continue;

      activeIds.add(id);
      rig.model.getWorldPosition(projVec);
      projVec.y += 1.75; // Clear the full customer head
      projVec.project(camera);

      // Check if behind camera or far off screen
      if (projVec.z >= 1) {
        const existing = nodes.get(id);
        if (existing) existing.style.display = "none";
        continue;
      }

      const screenX = ((projVec.x + 1) * width) / 2;
      const screenY = ((-projVec.y + 1) * height) / 2 - 9;

      if (screenX < -60 || screenX > width + 60 || screenY < -60 || screenY > height + 60) {
        const existing = nodes.get(id);
        if (existing) existing.style.display = "none";
        continue;
      }

      let el = nodes.get(id);
      if (!el) {
        el = document.createElement("div");
        // ไม่ใส่ transition ให้ transform: ตำแหน่งถูกเขียนใหม่ทุกเฟรมอยู่แล้ว การสั่ง transition ซ้อนกัน
        // ทำให้เบราว์เซอร์ต้อง composite ก้อนความคิดทุกก้อนต่อเนื่อง และภาพยังตามหลังตัวละครอีก
        el.className = "absolute left-0 top-0 pointer-events-auto select-none cursor-default";
        el.dataset.agentId = String(id);
        el.setAttribute("role", "status");
        container.appendChild(el);
        nodes.set(id, el);
      }

      const config = getEmoteConfig(customer.thought);

      el.style.display = "block";
      placements.push({ el, x: screenX, y: screenY });
      // วาดใหม่ (และเด้ง) เฉพาะเมื่อรูปบนป้ายเปลี่ยน — ข้อความมีนาทีที่รอซึ่งเปลี่ยนทุกไม่กี่วินาทีที่เวลาเร่ง
      // ถ้านับรวมด้วย ป้ายจะเด้งจากโปร่งใสซ้ำ ๆ ดูเหมือนกะพริบ
      updateLabel(el, config.label);
      const contentKey = JSON.stringify([badgeArtFor(customer.thought), config.severity]);
      if (contentKeys.get(el) !== contentKey) {
        contentKeys.set(el, contentKey);
        popAfterRender.push({ el, bouncing: false });
        el.innerHTML = `
          <div class="relative flex items-center justify-center select-none" style="width:${BUBBLE_WIDTH}px;height:${BUBBLE_HEIGHT}px;">
            ${thoughtBadgeMarkup(customer.thought)}
          </div>
        `;
      }
    }

    // 2. Process staff thoughts
    for (const member of presentation.staff) {
      if (!member.thought) continue;
      const staffIdx = member.staffId;
      const staffMember = staff[staffIdx];
      if (!staffMember) continue;

      const staffKey = -(staffIdx + 1);
      activeIds.add(staffKey);

      staffMember.model.getWorldPosition(projVec);
      projVec.y += 2.15; // Staff model is taller: keep a clear gap above the head
      projVec.project(camera);

      if (projVec.z >= 1) {
        const existing = nodes.get(staffKey);
        if (existing) existing.style.display = "none";
        continue;
      }

      const screenX = ((projVec.x + 1) * width) / 2;
      const screenY = ((-projVec.y + 1) * height) / 2 - 11;

      let el = nodes.get(staffKey);
      if (!el) {
        el = document.createElement("div");
        // ไม่ใส่ transition ให้ transform: ตำแหน่งถูกเขียนใหม่ทุกเฟรมอยู่แล้ว การสั่ง transition ซ้อนกัน
        // ทำให้เบราว์เซอร์ต้อง composite ก้อนความคิดทุกก้อนต่อเนื่อง และภาพยังตามหลังตัวละครอีก
        el.className = "absolute left-0 top-0 pointer-events-auto select-none cursor-default";
        el.dataset.staffId = String(staffIdx);
        el.setAttribute("role", "status");
        container.appendChild(el);
        nodes.set(staffKey, el);
      }

      const config = getEmoteConfig(member.thought);
      el.style.display = "block";
      placements.push({ el, x: screenX, y: screenY });
      updateLabel(el, config.label);
      const contentKey = badgeArtFor(member.thought);
      if (contentKeys.get(el) !== contentKey) {
        contentKeys.set(el, contentKey);
        popAfterRender.push({ el, bouncing: false });
        el.innerHTML = `
          <div class="relative flex items-center justify-center select-none" style="width:${BUBBLE_WIDTH}px;height:${BUBBLE_HEIGHT}px;">
            ${thoughtBadgeMarkup(member.thought)}
          </div>
        `;
      }
    }

    // 3. ขนาดตามการซูม แล้วเลื่อนก้อนที่ซ้อนกันขึ้นไปทีละชั้น (ลูกค้าโต๊ะเดียวกันมักอยู่ชิดกัน)
    const scale = bubbleScale(camera, width, height);
    const boxWidth = BUBBLE_WIDTH * scale;
    const boxHeight = BUBBLE_HEIGHT * scale;
    placements.sort((a, b) => b.y - a.y);
    const placed: { left: number; top: number }[] = [];
    for (const placement of placements) {
      let top = placement.y - boxHeight;
      const left = placement.x - boxWidth * 0.5;
      for (let guard = 0; guard < 8; guard++) {
        const hit = placed.find(box => Math.abs(box.left - left) < boxWidth - BUBBLE_GAP && Math.abs(box.top - top) < boxHeight - BUBBLE_GAP);
        if (!hit) break;
        top = hit.top - boxHeight + BUBBLE_GAP;
      }
      placed.push({ left, top });
      const lift = placement.y - boxHeight - top;
      placement.el.style.transformOrigin = "50% 100%";
      placement.el.style.zIndex = String(Math.round(placement.y));
      placement.el.style.transform = `translate3d(${placement.x}px, ${placement.y - lift}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
    }

    // 4. ก้อนใหม่/เปลี่ยนสถานะเด้งเข้าเล็กน้อย ให้เห็นว่ามีอะไรเปลี่ยน (ไม่ทำตอนหยุดชั่วคราวหรือผู้ใช้ลดการเคลื่อนไหว)
    if (!paused && !prefersReducedMotion()) {
      for (const { el, bouncing } of popAfterRender) {
        const inner = el.firstElementChild as HTMLElement | null;
        if (!inner || bouncing || typeof inner.animate !== "function") continue;
        inner.animate(
          [{ transform: "scale(0.55)", opacity: 0 }, { transform: "scale(1.08)", opacity: 1, offset: 0.7 }, { transform: "scale(1)", opacity: 1 }],
          { duration: 220, easing: "ease-out", transformOrigin: "50% 100%" } as KeyframeAnimationOptions,
        );
      }
    }
    popAfterRender.length = 0;

    // 5. Remove inactive nodes
    for (const [id, el] of nodes) {
      if (!activeIds.has(id)) {
        el.remove();
        nodes.delete(id);
      }
    }
  };

  const clear = () => {
    for (const el of nodes.values()) el.remove();
    nodes.clear();
  };

  const dispose = () => {
    clear();
  };

  return { update, clear, dispose };
}
