import { CLEARANCE, DEFAULT_SIZES, GRID_STEP, TABLE_SET_PRESETS } from "./constants";
import { EPSILON } from "./epsilon";
import { footprint, rectsIntersect, roundMeters, snapPoint, snapToGrid } from "./geometry";
import type { Meters, Point, Rect, StoreLayout, TableSetPreset, WallDoor } from "./types";

export type PaletteCatalogItem = TableSetPreset | "counter";

/** พื้นที่หน้าประตูลึก `depth` เข้าไปในร้าน */
export function doorFrontZone(layout: Pick<StoreLayout, "width" | "depth">, entrance: WallDoor, depth: Meters): Rect {
  switch (entrance.wall) {
    case "north":
      return { x: entrance.position, y: 0, width: entrance.width, depth };
    case "south":
      return { x: entrance.position, y: Math.max(0, layout.depth - depth), width: entrance.width, depth };
    case "west":
      return { x: 0, y: entrance.position, width: depth, depth: entrance.width };
    case "east":
      return { x: Math.max(0, layout.width - depth), y: entrance.position, width: depth, depth: entrance.width };
  }
}

/**
 * คำนวณระยะเว้นหน้าประตู (Door Clearance Zone) ลึก 1.2 ม.
 */
export function getDoorZone(layout: StoreLayout): Rect | null {
  return layout.entrance ? doorFrontZone(layout, layout.entrance, CLEARANCE.mainAisle) : null;
}

/** พื้นที่หน้าประตูครัวลึก 0.90 ม. (ทางเดินรองของพนักงาน) */
export function getKitchenDoorZone(layout: StoreLayout): Rect | null {
  return layout.kitchenDoor ? doorFrontZone(layout, layout.kitchenDoor, CLEARANCE.secondaryAisle) : null;
}

/**
 * คำนวณ Bounding Box รวมของชิ้นส่วนที่จะวางที่พิกัด (x, y)
 * (x, y) คือจุดอ้างอิง Top-Left ของโต๊ะ/เคาน์เตอร์
 */
export function getItemBoundingBox(kind: PaletteCatalogItem, pos: Point): Rect {
  const tuck = CLEARANCE.chairTuckMax;
  const { width: chairW, depth: chairD } = DEFAULT_SIZES.chair;

  if (kind === "table-2-seats") {
    const { tableWidth, tableDepth } = TABLE_SET_PRESETS["table-2-seats"];
    // เก้าอี้อยู่ North & South
    const minY = pos.y - chairD + tuck;
    const maxY = pos.y + tableDepth - tuck + chairD;
    return {
      x: pos.x,
      y: minY,
      width: tableWidth,
      depth: roundMeters(maxY - minY),
    };
  }

  if (kind === "table-4-seats") {
    const { tableWidth, tableDepth } = TABLE_SET_PRESETS["table-4-seats"];
    // เก้าอี้อยู่ 4 ด้าน: North, South, West, East
    const minX = pos.x - chairW + tuck;
    const maxX = pos.x + tableWidth - tuck + chairW;
    const minY = pos.y - chairD + tuck;
    const maxY = pos.y + tableDepth - tuck + chairD;
    return {
      x: minX,
      y: minY,
      width: roundMeters(maxX - minX),
      depth: roundMeters(maxY - minY),
    };
  }

  return {
    x: pos.x,
    y: pos.y,
    width: DEFAULT_SIZES.counter.width,
    depth: DEFAULT_SIZES.counter.depth,
  };
}

/**
 * ขยาย Rect ออกรอบทิศด้วยระยะ margin
 */
function expandRect(rect: Rect, margin: Meters): Rect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    depth: rect.depth + margin * 2,
  };
}

/**
 * หาจุดว่างที่ใกล้ที่สุดบนกริด 0.25 ม. สำหรับวางวัตถุชนิดที่ระบุ
 * - ไม่ล้นออกนอกผนังร้าน
 * - ไม่ทับ Door Clearance Zone (1.2 ม. หน้าประตู) และหน้าประตูครัว (0.9 ม.)
 * - ไม่ชนกับวัตถุเดิมในร้าน (ลองเว้นระยะทางเดิน 0.9 ม. -> 0.6 ม. -> ไม่ชน 0 ม.)
 */
export function findAvailableSpot(layout: StoreLayout, kind: PaletteCatalogItem): Point {
  const doorZones = [getDoorZone(layout), getKitchenDoorZone(layout)].filter((z): z is Rect => z !== null);
  const existingFootprints = layout.objects.map((obj) => footprint(obj));

  // กำหนดขอบเขตการค้นหาตามขนาด Bounding Box
  const dummyAtOrigin = getItemBoundingBox(kind, { x: 0, y: 0 });
  const offsetX = -dummyAtOrigin.x; // ระยะชดเชยจาก BBox.minX ถึง pos.x
  const offsetY = -dummyAtOrigin.y; // ระยะชดเชยจาก BBox.minY ถึง pos.y

  const minX = snapToGrid(offsetX);
  const maxX = snapToGrid(layout.width - dummyAtOrigin.width + offsetX);
  const minY = snapToGrid(offsetY);
  const maxY = snapToGrid(layout.depth - dummyAtOrigin.depth + offsetY);

  // เลือกลอง clearance margins: 0.9m (ทางเดินรองสะดวก) -> 0.6m (ทางเข้าเก้าอี้) -> 0.05m (ไม่ชน)
  const clearanceLevels = [CLEARANCE.secondaryAisle, CLEARANCE.chairAccess, 0.05];

  for (const margin of clearanceLevels) {
    for (let y = minY; y <= maxY + EPSILON; y = roundMeters(y + GRID_STEP)) {
      for (let x = minX; x <= maxX + EPSILON; x = roundMeters(x + GRID_STEP)) {
        const candidatePos: Point = { x, y };
        const bbox = getItemBoundingBox(kind, candidatePos);

        // ตรวจสอบว่า Bounding box อยู่ในขอบเขตร้าน
        if (
          bbox.x < -EPSILON ||
          bbox.y < -EPSILON ||
          bbox.x + bbox.width > layout.width + EPSILON ||
          bbox.y + bbox.depth > layout.depth + EPSILON
        ) {
          continue;
        }

        // ตรวจสอบว่าไม่ทับ Door Clearance Zone
        if (doorZones.some((zone) => rectsIntersect(bbox, zone))) {
          continue;
        }

        // ตรวจสอบว่าไม่ชนกับวัตถุเดิม (ขยาย bbox ด้วย margin)
        const expanded = expandRect(bbox, margin);
        const collidesWithExisting = existingFootprints.some((fp) => rectsIntersect(expanded, fp));
        if (!collidesWithExisting) {
          return candidatePos;
        }
      }
    }
  }

  // Fallback: ถ้าแน่นมาก วางกึ่งกลางร้าน (snap กริด)
  return snapPoint({
    x: Math.max(minX, Math.min(maxX, (layout.width - dummyAtOrigin.width) / 2 + offsetX)),
    y: Math.max(minY, Math.min(maxY, (layout.depth - dummyAtOrigin.depth) / 2 + offsetY)),
  });
}
