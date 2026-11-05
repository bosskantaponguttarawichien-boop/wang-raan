import { describe, expect, it } from "vitest";
import type { Counter, StoreLayout } from "@/core/layout/types";
import { paySpots } from "@/core/preview/staff-spots";
import { CASHIER_REACH, PAY_QUEUE_REACH, facingTowardPos } from "./pay-facing";

const counter: Counter = { id: "c", type: "counter", x: 3, y: 1, width: 2.4, depth: 0.7, rotation: 0 };
const layout: StoreLayout = { id: "room", version: 1, units: "m", width: 8, depth: 6, entrance: null, kitchenDoor: null, objects: [counter] };

describe("หันหน้าเข้าจอ POS ตอนจ่าย/รับเงิน", () => {
  const spots = paySpots(layout);
  const [spot] = spots;

  it("ลูกค้าหน้าจอและคนที่ต่อคิวถัดไปหันเข้าหาจอ (ไม่ใช่ทิศที่เดินมา)", () => {
    const front = facingTowardPos(spots, spot!.customer.x, spot!.customer.y, PAY_QUEUE_REACH)!;
    // ฝั่งลูกค้าของเคาน์เตอร์ rotation 0 คือ +y → หันกลับไปทาง −y (มุม π)
    expect(Math.abs(Math.abs(front) - Math.PI)).toBeLessThan(1e-6);
    const behind = facingTowardPos(spots, spot!.customer.x - 0.5, spot!.customer.y + 0.7, PAY_QUEUE_REACH)!;
    expect(Math.cos(behind)).toBeLessThan(0);
    expect(facingTowardPos(spots, 7.5, 5.5, PAY_QUEUE_REACH)).toBeNull();
  });

  it("พนักงานหลังจอหันเข้าหาจอ (ไม่ใช่โต๊ะที่ใกล้ที่สุด) เฉพาะเมื่อยืนตรงจุดรับเงิน", () => {
    const cashier = facingTowardPos(spots, spot!.staff!.x, spot!.staff!.y, CASHIER_REACH, "staff")!;
    expect(Math.abs(cashier)).toBeLessThan(1e-6); // หันไปทาง +y เข้าหาเคาน์เตอร์
    expect(facingTowardPos(spots, spot!.staff!.x - 1, spot!.staff!.y, CASHIER_REACH, "staff")).toBeNull();
  });
});
