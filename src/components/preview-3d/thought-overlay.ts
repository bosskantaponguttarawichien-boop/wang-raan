import * as THREE from "three";
import type { PresentationSnapshot } from "@/core/simulation/presentation-contract";
import { CLOUD_PATH, getEmoteConfig } from "../simulation/character-thought-bubble";

export interface ThoughtOverlayHost {
  readonly element: HTMLElement;
}

export interface ThoughtOverlayManager {
  update(
    presentation: PresentationSnapshot | undefined,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    customers: Map<number, { model: THREE.Object3D }>,
    staff: Array<{ model: THREE.Object3D }>,
    showThoughts: boolean,
  ): void;
  clear(): void;
  dispose(): void;
}

export function createThoughtOverlayManager(container: HTMLElement): ThoughtOverlayManager {
  const nodes = new Map<number, HTMLDivElement>();
  const projVec = new THREE.Vector3();
  // Keep the bubble DOM stable across animation frames.
  const contentKeys = new WeakMap<HTMLDivElement, string>();

  const update = (
    presentation: PresentationSnapshot | undefined,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    customers: Map<number, { model: THREE.Object3D }>,
    staff: Array<{ model: THREE.Object3D }>,
    showThoughts: boolean,
  ) => {
    if (!showThoughts || !presentation) {
      if (nodes.size > 0) clear();
      return;
    }

    const width = renderer.domElement.clientWidth || 800;
    const height = renderer.domElement.clientHeight || 600;
    const activeIds = new Set<number>();

    // 1. Process customer thoughts
    for (const customer of presentation.customers) {
      if (!customer.thought) continue;
      const id = customer.renderAgentId;
      const rig = customers.get(id);
      if (!rig) continue;

      activeIds.add(id);
      rig.model.getWorldPosition(projVec);
      projVec.y += 1.55; // Floating above character head
      projVec.project(camera);

      // Check if behind camera or far off screen
      if (projVec.z >= 1) {
        const existing = nodes.get(id);
        if (existing) existing.style.display = "none";
        continue;
      }

      const screenX = ((projVec.x + 1) * width) / 2;
      const screenY = ((-projVec.y + 1) * height) / 2;

      if (screenX < -60 || screenX > width + 60 || screenY < -60 || screenY > height + 60) {
        const existing = nodes.get(id);
        if (existing) existing.style.display = "none";
        continue;
      }

      let el = nodes.get(id);
      if (!el) {
        el = document.createElement("div");
        el.className = "absolute left-0 top-0 pointer-events-auto select-none transition-transform duration-75 cursor-default";
        el.dataset.agentId = String(id);
        el.setAttribute("role", "status");
        container.appendChild(el);
        nodes.set(id, el);
      }

      const config = getEmoteConfig(customer.thought);
      const isCritical = config.severity === "critical";
      const isWarning = config.severity === "warning";

      // Softer, refined outline colors matching modern palette
      const fillColor = isCritical ? "#fff1f2" : isWarning ? "#fffbeb" : "#ffffff";
      const strokeColor = isCritical ? "#f43f5e" : isWarning ? "#f59e0b" : "#64748b";
      const badgeColor = isCritical ? "text-rose-800" : isWarning ? "text-amber-800" : "text-slate-600";
      const bounceClass = isCritical ? "animate-bounce" : "";

      const badgeHtml = config.badgeText
        ? `<span class="text-[11px] font-semibold tracking-tight ${badgeColor}">${config.badgeText}</span>`
        : "";

      el.style.display = "block";
      // Position tail circle (~70% x, 100% y) directly above customer's head
      el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-65%, -100%)`;
      const contentKey = JSON.stringify([config.label, config.emoji, config.badgeText, config.severity]);
      if (contentKeys.get(el) !== contentKey) {
        contentKeys.set(el, contentKey);
        el.setAttribute("aria-label", config.label);
        el.title = config.label;
        el.innerHTML = `
        <div class="relative flex items-center justify-center select-none transition-transform hover:scale-105 ${bounceClass}" style="width: 80px; height: 64px;">
          <svg viewBox="0 0 108 86" class="absolute inset-0 w-full h-full overflow-visible drop-shadow-[0_2px_4px_rgba(0,0,0,0.08)]">
            <path d="${CLOUD_PATH}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="66" cy="66" r="4.2" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" />
            <circle cx="75" cy="77" r="2.6" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" />
          </svg>
          <div class="absolute inset-x-1 top-0.5 flex items-center justify-center gap-1" style="height: 58%;">
            <span class="text-lg leading-none" role="img" aria-hidden="true">${config.emoji}</span>
            ${badgeHtml}
          </div>
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
      projVec.y += 1.58;
      projVec.project(camera);

      if (projVec.z >= 1) {
        const existing = nodes.get(staffKey);
        if (existing) existing.style.display = "none";
        continue;
      }

      const screenX = ((projVec.x + 1) * width) / 2;
      const screenY = ((-projVec.y + 1) * height) / 2;

      let el = nodes.get(staffKey);
      if (!el) {
        el = document.createElement("div");
        el.className = "absolute left-0 top-0 pointer-events-auto select-none transition-transform duration-75 cursor-default";
        el.dataset.staffId = String(staffIdx);
        el.setAttribute("role", "status");
        container.appendChild(el);
        nodes.set(staffKey, el);
      }

      const config = getEmoteConfig(member.thought);
      el.style.display = "block";
      el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-65%, -100%)`;
      const contentKey = JSON.stringify([config.label, config.emoji]);
      if (contentKeys.get(el) !== contentKey) {
        contentKeys.set(el, contentKey);
        el.setAttribute("aria-label", config.label);
        el.title = config.label;
        el.innerHTML = `
        <div class="relative flex items-center justify-center select-none transition-transform hover:scale-105" style="width: 80px; height: 64px;">
          <svg viewBox="0 0 108 86" class="absolute inset-0 w-full h-full overflow-visible drop-shadow-[0_2px_4px_rgba(0,0,0,0.08)]">
            <path d="${CLOUD_PATH}" fill="#ffffff" stroke="#64748b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="66" cy="66" r="4.2" fill="#ffffff" stroke="#64748b" stroke-width="1.5" />
            <circle cx="75" cy="77" r="2.6" fill="#ffffff" stroke="#64748b" stroke-width="1.5" />
          </svg>
          <div class="absolute inset-x-1 top-0.5 flex items-center justify-center gap-1" style="height: 58%;">
            <span class="text-lg leading-none" role="img" aria-hidden="true">${config.emoji}</span>
          </div>
        </div>
        `;
      }
    }

    // 3. Remove inactive nodes
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
