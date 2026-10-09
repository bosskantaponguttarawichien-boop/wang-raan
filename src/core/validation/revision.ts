/**
 * Layout revision (PRD P-02 / C-07) — hash ที่ขึ้นกับ geometry, ขนาดร้าน, Entrance และ hierarchy เท่านั้น
 * ลำดับของ objects ใน array ไม่มีผล (เรียงตาม id ก่อน hash)
 */
import type { StoreLayout } from "../layout/types";

function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function computeLayoutRevision(layout: StoreLayout): string {
  const objects = [...layout.objects]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((o) => {
      const base = [o.id, o.type, o.x, o.y, o.width, o.depth, o.rotation];
      if (o.type === "table") return [...base, [...o.chairIds].sort().join(",")];
      if (o.type === "chair") return [...base, o.tableId];
      return base;
    });
  const e = layout.entrance;
  const canonical = JSON.stringify([
    layout.id,
    layout.width,
    layout.depth,
    e ? [e.id, e.wall, e.position, e.width] : null,
    objects,
  ]);
  const hi = fnv1a(canonical, 0x811c9dc5).toString(16).padStart(8, "0");
  const lo = fnv1a(canonical, 0x050c5d1f).toString(16).padStart(8, "0");
  return `rev-${hi}${lo}`;
}
