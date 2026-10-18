/**
 * Issue Humanizer & Formatter — Pure TypeScript
 * แปลง Validation Issue เป็นหัวข้อ + คำแนะนำภาษาไทยพร้อมตัวเลขระยะรูปธรรม (PRD §9 ข้อ 14, feat-054)
 * ห้าม import React, DOM, หรือ Zustand (Pure TS)
 */
import { CLEARANCE } from "../layout/constants";
import type { LayoutObject, Rect, StoreLayout, ValidationIssue } from "../layout/types";
import { issueCode } from "./issues";

export interface FormattedIssue {
  title: string;
  hint: string;
  targetLabel: string;
  measured?: number;
  required?: number;
  delta?: number;
  rect?: Rect;
}

export function cm(meters: number): number {
  return Math.round(meters * 100);
}

/**
 * คำนวณลำดับหมายเลขโต๊ะในร้าน (1, 2, 3...)
 */
export function getTableNumbers(layout: StoreLayout): Map<string, number> {
  const numbers = new Map<string, number>();
  let n = 1;
  for (const obj of layout.objects) {
    if (obj.type === "table") {
      numbers.set(obj.id, n++);
    }
  }
  return numbers;
}

/**
 * ดึงชื่อเรียกที่เป็นภาษาคน เช่น "โต๊ะ 1", "เคาน์เตอร์", "ครัว"
 */
export function getObjectName(
  objOrId: LayoutObject | string | undefined,
  layout?: StoreLayout,
  tableNumbers?: Map<string, number>,
): string {
  if (!objOrId) return "ชิ้นงาน";
  const obj = typeof objOrId === "string" ? layout?.objects.find((o) => o.id === objOrId) : objOrId;
  if (!obj) {
    if (typeof objOrId === "string" && layout?.entrance?.id === objOrId) return "ทางเข้าร้าน";
    if (typeof objOrId === "string" && layout?.kitchenDoor?.id === objOrId) return "ประตูครัว";
    return "ชิ้นงาน";
  }

  const tNums = tableNumbers ?? (layout ? getTableNumbers(layout) : new Map<string, number>());
  switch (obj.type) {
    case "table": {
      const num = tNums.get(obj.id);
      return num ? `โต๊ะ ${num}` : "ชุดโต๊ะ";
    }
    case "chair": {
      const parentNum = tNums.get(obj.tableId);
      return parentNum ? `เก้าอี้โต๊ะ ${parentNum}` : "เก้าอี้";
    }
    case "counter":
      return "เคาน์เตอร์";
    default:
      return "ชิ้นงาน";
  }
}

/**
 * แปลง Issue เป็นหัวข้อสั้นและคำแนะนำภาษาไทยรูปธรรม
 */
export function formatIssueHuman(
  issue: ValidationIssue & Partial<FormattedIssue>,
  layout?: StoreLayout,
): FormattedIssue {
  // หาก issue มี title และ hint แนบมาแล้ว ให้ใช้ค่านั้นเป็นหลัก
  if (issue.title && issue.hint) {
    const targetLabel = issue.objectIds[0] ? getObjectName(issue.objectIds[0], layout) : "ร้าน";
    return {
      title: issue.title,
      hint: issue.hint,
      targetLabel,
      measured: issue.measured,
      required: issue.required,
      delta: issue.delta,
      rect: issue.rect,
    };
  }

  const code = issueCode(issue);
  const tNums = layout ? getTableNumbers(layout) : undefined;
  const firstObj = issue.objectIds[0] ? getObjectName(issue.objectIds[0], layout, tNums) : "";
  const secondObj = issue.objectIds[1] ? getObjectName(issue.objectIds[1], layout, tNums) : "";

  switch (code) {
    // ── Completeness ──────────────────────────────────────────────
    case "missing-entrance":
      return {
        title: "ยังไม่มีทางเข้าร้าน",
        hint: "กำหนดผนังและตำแหน่งทางเข้าในแท็บ 'ร้าน'",
        targetLabel: "ทางเข้าร้าน",
      };
    case "missing-kitchen":
      return {
        title: "ยังไม่มีประตูครัว",
        hint: "เพิ่มประตูครัวจากแท็บ 'เพิ่ม' หรือแท็บ 'ร้าน' แล้วเลือกผนังที่ต่อกับห้องครัว",
        targetLabel: "ประตูครัว",
      };
    case "missing-counter":
      return {
        title: "ยังไม่มีเคาน์เตอร์",
        hint: "เพิ่มเคาน์เตอร์จากแท็บ 'เพิ่ม' สำหรับสั่งอาหารและชำระเงิน",
        targetLabel: "เคาน์เตอร์",
      };
    case "missing-table":
      return {
        title: "ยังไม่มีโต๊ะในร้าน",
        hint: "เพิ่มชุดโต๊ะอย่างน้อย 1 ชุดจากแท็บ 'เพิ่ม'",
        targetLabel: "ชุดโต๊ะ",
      };
    case "missing-chair":
      return {
        title: "ยังไม่มีเก้าอี้ที่ใช้งานได้",
        hint: "เพิ่มชุดโต๊ะที่มีเก้าอี้จากแท็บ 'เพิ่ม'",
        targetLabel: "เก้าอี้",
      };
    case "orphan-chair":
      return {
        title: "เก้าอี้ไม่ได้สังกัดโต๊ะใด",
        hint: "ลบเก้าอี้ตัวนี้ออก หรือวางชุดโต๊ะใหม่",
        targetLabel: firstObj || "เก้าอี้",
      };
    case "chair-not-listed":
      return {
        title: "เก้าอี้ไม่อยู่ในรายการของโต๊ะ",
        hint: "ลบแล้วเพิ่มชุดโต๊ะใหม่เพื่อให้ข้อมูลสมบูรณ์",
        targetLabel: firstObj || "เก้าอี้",
      };
    case "chair-in-multiple-tables":
      return {
        title: "เก้าอี้สังกัดหลายโต๊ะพร้อมกัน",
        hint: "ลบแล้วเพิ่มชุดโต๊ะใหม่",
        targetLabel: firstObj || "เก้าอี้",
      };
    case "table-without-chairs":
      return {
        title: `${firstObj || "โต๊ะ"}ไม่มีเก้าอี้`,
        hint: "ลบโต๊ะนี้แล้วเลือกวางชุดโต๊ะ 2 หรือ 4 ที่นั่งใหม่",
        targetLabel: firstObj || "โต๊ะ",
      };

    // ── Collision ─────────────────────────────────────────────────
    case "out-of-bounds":
      return {
        title: `${firstObj || "ชิ้นงาน"} ล้นออกนอกผนัง`,
        hint: "ลากกลับเข้ามาให้อยู่ภายในร้าน",
        targetLabel: firstObj || "ชิ้นงาน",
      };
    case "chair-tuck-side":
      return {
        title: `${firstObj || "เก้าอี้"}สอดโต๊ะผิดทิศ`,
        hint: "เก้าอี้สอดเข้าใต้โต๊ะได้เฉพาะจากด้านหน้าเท่านั้น",
        targetLabel: firstObj || "เก้าอี้",
      };
    case "chair-tuck-too-deep": {
      const tuckMaxCm = cm(CLEARANCE.chairTuckMax);
      return {
        title: `${firstObj || "เก้าอี้"}สอดลึกเกินไป`,
        hint: `สอดลึกได้ไม่เกิน ${tuckMaxCm} ซม. เพื่อไม่ชนขาโต๊ะ`,
        targetLabel: firstObj || "เก้าอี้",
      };
    }
    case "overlap":
      return {
        title: secondObj ? `${firstObj} ชนกับ ${secondObj}` : `${firstObj || "ชิ้นงาน"} วางซ้อนทับกัน`,
        hint: "ลากแยกออกจากกันให้มีระยะห่าง",
        targetLabel: firstObj || "ชิ้นงาน",
      };

    // ── Clearance ─────────────────────────────────────────────────
    case "chair-access": {
      const accessCm = cm(CLEARANCE.chairAccess);
      return {
        title: `พื้นที่เข้าถึง${firstObj || "เก้าอี้"}แคบเกินไป`,
        hint: `ด้านหลังหรือด้านข้างต้องมีที่ว่างอย่างน้อย ${accessCm} ซม. ให้ลูกค้าเลื่อนเก้าอี้ได้`,
        targetLabel: firstObj || "เก้าอี้",
      };
    }
    case "main-aisle": {
      const reqCm = cm(CLEARANCE.mainAisle);
      const measured = issue.measured !== undefined ? cm(issue.measured) : undefined;
      const delta = issue.delta !== undefined ? cm(issue.delta) : measured !== undefined ? reqCm - measured : 20;
      return {
        title: `ทางเดินหลักแคบไป ${delta} ซม.`,
        hint: `ระหว่างทางเข้าถึง${firstObj || "เคาน์เตอร์"} ต้องกว้างอย่างน้อย ${reqCm} ซม. (1.20 ม.)`,
        targetLabel: firstObj || "ทางเดินหลัก",
      };
    }
    case "secondary-aisle": {
      const reqCm = cm(CLEARANCE.secondaryAisle);
      const measured = issue.measured !== undefined ? cm(issue.measured) : undefined;
      const delta = issue.delta !== undefined ? cm(issue.delta) : measured !== undefined ? reqCm - measured : 20;
      return {
        title: `ทางเดินรองแคบไป ${delta} ซม.`,
        hint: `ทางเดินไปยัง${firstObj || "โต๊ะ"} ต้องกว้างอย่างน้อย ${reqCm} ซม. (0.90 ม.)`,
        targetLabel: firstObj || "ทางเดินรอง",
      };
    }

    // ── Accessibility ─────────────────────────────────────────────
    case "entrance-off-wall":
      return {
        title: "ทางเข้าอยู่เลยแนวผนังร้าน",
        hint: "เลื่อนตำแหน่งประตูให้อยู่บนแนวผนังร้าน",
        targetLabel: "ทางเข้าร้าน",
      };
    case "entrance-disconnected":
      return {
        title: "ทางเข้าถูกปิดกั้น",
        hint: "มีสิ่งกีดขวางหน้าประตู ต้องเว้นว่างลึกอย่างน้อย 1.20 ม.",
        targetLabel: "ทางเข้าร้าน",
      };
    case "unreachable-chair":
      return {
        title: `เดินไปไม่ถึง${firstObj || "เก้าอี้"}`,
        hint: "ลูกค้าเดินจากทางเข้าถึงเก้าอี้ไม่ได้ ลองขยับขยายทางเดิน",
        targetLabel: firstObj || "เก้าอี้",
      };
    case "unreachable-table":
      return {
        title: `เข้าไม่ถึงจุดบริการ${firstObj || "โต๊ะ"}`,
        hint: "พนักงานเดินไปเสิร์ฟที่โต๊ะนี้ไม่ได้ ลองเว้นทางเดินอย่างน้อย 60 ซม.",
        targetLabel: firstObj || "โต๊ะ",
      };
    case "unreachable-kitchen":
      return {
        title: "เดินไปไม่ถึงประตูครัว",
        hint: "พนักงานเดินจากทางเข้าไปหน้าประตูครัวไม่ได้ ย้ายของที่ขวางหน้าประตู หรือย้ายประตูครัว",
        targetLabel: "ประตูครัว",
      };
    case "kitchen-door-off-wall":
      return {
        title: "ประตูครัวเลยแนวผนัง",
        hint: "ปรับตำแหน่งหรือความกว้างประตูครัวในแท็บ 'ร้าน' ให้อยู่บนผนัง",
        targetLabel: "ประตูครัว",
      };
    case "kitchen-door-overlaps-entrance":
      return {
        title: "ประตูครัวทับทางเข้าร้าน",
        hint: "ลากประตูครัวไปตำแหน่งอื่นบนผนัง หรือย้ายไปผนังอื่น",
        targetLabel: "ประตูครัว",
      };
    case "unreachable-counter":
      return {
        title: "เดินไปไม่ถึงเคาน์เตอร์",
        hint: "ลูกค้าหรือพนักงานเดินไปที่เคาน์เตอร์ไม่ได้",
        targetLabel: "เคาน์เตอร์",
      };

    default:
      return {
        title: issue.message || "พบปัญหาที่ผังร้าน",
        hint: "ปรับตำแหน่งหรือระยะของชิ้นงาน",
        targetLabel: firstObj || "ชิ้นงาน",
      };
  }
}
