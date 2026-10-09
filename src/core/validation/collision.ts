/**
 * Collision — PRD.md §5.4
 * V1 หมุนได้ทีละ 90° footprint ทุกชิ้นจึงเป็นสี่เหลี่ยมแนวแกน การตรวจแบบ AABB จึงแม่นยำทุกมุมหมุน
 * (เทียบเท่า SAT สำหรับกรณีนี้) โดยใช้ footprint() ที่สลับกว้าง/ลึกตาม rotation แล้ว
 *
 * - วัตถุทุกคู่ที่ทับกัน → Blocked
 * - ยกเว้น Chair กับ Table ของตัวเอง: สอดได้ ≤ 0.10 ม. และเฉพาะจากด้านหน้าของเก้าอี้
 * - วัตถุออกนอกขอบร้าน → Blocked
 */
import { CLEARANCE } from "../layout/constants";
import { footprint, rectOverlap } from "../layout/geometry";
import { chairTuck } from "../layout/table-set";
import type { Chair, LayoutObject, Rect, StoreLayout, Table, ValidationIssue } from "../layout/types";
import { OBJECT_LABEL, createIssue } from "./issues";

const EPSILON = 1e-9;

export function isInsideRoom(rect: Rect, layout: Pick<StoreLayout, "width" | "depth">): boolean {
  return (
    rect.x >= -EPSILON &&
    rect.y >= -EPSILON &&
    rect.x + rect.width <= layout.width + EPSILON &&
    rect.y + rect.depth <= layout.depth + EPSILON
  );
}

function ownTablePair(a: LayoutObject, b: LayoutObject): [Chair, Table] | null {
  if (a.type === "chair" && b.type === "table" && a.tableId === b.id) return [a, b];
  if (b.type === "chair" && a.type === "table" && b.tableId === a.id) return [b, a];
  return null;
}

function overlapMessage(a: LayoutObject, b: LayoutObject): string {
  if (a.type === b.type) return `${OBJECT_LABEL[a.type]}ทับ${OBJECT_LABEL[b.type]}ตัวอื่น`;
  if (a.type === "chair" && b.type === "table") return "เก้าอี้ทับโต๊ะตัวอื่น";
  if (b.type === "chair" && a.type === "table") return "เก้าอี้ทับโต๊ะตัวอื่น";
  return `${OBJECT_LABEL[a.type]}ทับ${OBJECT_LABEL[b.type]}`;
}

export function checkCollisions(layout: StoreLayout): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const items = layout.objects.map((obj) => ({ obj, rect: footprint(obj) }));

  for (const { obj, rect } of items) {
    if (!isInsideRoom(rect, layout)) {
      issues.push(
        createIssue("collision", "out-of-bounds", "blocked", [obj.id], `${OBJECT_LABEL[obj.type]}อยู่นอกขอบร้าน`),
      );
    }
  }

  // sweep ตามแกน x เพื่อตัดคู่ที่ห่างกันออกเร็ว
  const sorted = [...items].sort((p, q) => p.rect.x - q.rect.x);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (b.rect.x >= a.rect.x + a.rect.width - EPSILON) break;
      const overlap = rectOverlap(a.rect, b.rect);
      if (overlap.x <= EPSILON || overlap.y <= EPSILON) continue;

      const ids = [a.obj.id, b.obj.id].sort();
      const own = ownTablePair(a.obj, b.obj);
      if (own) {
        const [chair, table] = own;
        const tuck = chairTuck(chair, table);
        if (!tuck.fromFront) {
          issues.push(
            createIssue(
              "collision",
              "chair-tuck-side",
              "blocked",
              ids,
              "เก้าอี้ซ้อนโต๊ะของตัวเองจากด้านข้างหรือด้านหลัง (สอดได้เฉพาะด้านหน้า)",
            ),
          );
        } else if (tuck.depth > CLEARANCE.chairTuckMax + EPSILON) {
          issues.push(
            createIssue(
              "collision",
              "chair-tuck-too-deep",
              "blocked",
              ids,
              `เก้าอี้สอดใต้โต๊ะ ${tuck.depth.toFixed(2)} ม. เกินกำหนด ${CLEARANCE.chairTuckMax.toFixed(2)} ม.`,
            ),
          );
        }
        continue;
      }
      issues.push(createIssue("collision", "overlap", "blocked", ids, overlapMessage(a.obj, b.obj)));
    }
  }
  return issues;
}
