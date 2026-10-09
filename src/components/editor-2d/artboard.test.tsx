// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { footprint, type Chair } from "@/core/layout";
import { useLiveValidation } from "@/components/validation/use-live-validation";
import { layoutStore, selectUndoDepth } from "@/store/use-layout-store";
import { block, cafeLayout } from "@/test/fixtures/layouts";
import { Artboard } from "./artboard";
import { clientToMeters, deltaToMeters, nearestWallPosition, objectAriaLabel, percent } from "./stage-math";

function Harness() {
  const live = useLiveValidation();
  return <Artboard live={live} />;
}

const STAGE = { left: 100, top: 50, width: 800, height: 600, right: 900, bottom: 650, x: 100, y: 50, toJSON: () => ({}) };
const state = () => layoutStore.getState();
const find = (id: string) => state().layout.objects.find((o) => o.id === id)!;

beforeEach(() => {
  state().loadLayout(cafeLayout());
  state().setZoom(1);
  // ห้อง 8 × 6 ม. แสดงที่ 800 × 600 px → 1 ม. = 100 px
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(STAGE as DOMRect);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("stage-math", () => {
  it("แปลง px ↔ เมตร", () => {
    expect(clientToMeters({ x: 400, y: 350 }, STAGE, { width: 8, depth: 6 })).toEqual({ x: 3, y: 3 });
    expect(deltaToMeters(50, -25, STAGE, { width: 8, depth: 6 })).toEqual({ x: 0.5, y: -0.25 });
    expect(percent(2, 8)).toBe("25%");
  });

  it.each([
    [{ x: 4, y: 0.2 }, "north", 3.4],
    [{ x: 4, y: 5.9 }, "south", 3.4],
    [{ x: 0.1, y: 3 }, "west", 2.4],
    [{ x: 7.8, y: 3 }, "east", 2.4],
  ] as const)("จุด %j → ผนัง %s", (point, wall, position) => {
    const r = nearestWallPosition(point, { width: 8, depth: 6 }, 1.2);
    expect(r.wall).toBe(wall);
    expect(r.position).toBeCloseTo(position, 9);
  });

  it("aria-label ภาษาไทยระบุตำแหน่ง มุม และปัญหา", () => {
    const kitchen = cafeLayout().objects[0]!;
    expect(objectAriaLabel(kitchen)).toBe("ครัว ตำแหน่ง x 0.50 ม. y 0.50 ม. หมุน 0 องศา");
    expect(objectAriaLabel(kitchen, "ครัวทับโต๊ะ")).toMatch(/— ครัวทับโต๊ะ$/);
  });
});

describe("Hybrid DOM rendering", () => {
  it("วัตถุทุกชิ้นเป็น <button> วางตำแหน่งเป็น % ของขนาดร้าน", () => {
    render(<Harness />);
    const layout = state().layout;
    for (const obj of layout.objects) {
      const el = document.querySelector<HTMLButtonElement>(`[data-id="${obj.id}"]`)!;
      const r = footprint(obj);
      expect(el.tagName).toBe("BUTTON");
      expect(el.style.left).toBe(`${(r.x / 8) * 100}%`);
      expect(el.style.top).toBe(`${(r.y / 6) * 100}%`);
      expect(el.style.width).toBe(`${(r.width / 8) * 100}%`);
    }
    expect(screen.getByRole("application", { name: "ผังร้านขนาด 8 × 6 เมตร" })).toBeInTheDocument();
  });

  it("กริดเป็น SVG non-scaling-stroke (คมชัดทุก DPR): ย่อย 0.25 ม. และหลัก 1 ม.", () => {
    render(<Harness />);
    const paths = screen.getByTestId("grid-overlay").querySelectorAll("path");
    expect(paths).toHaveLength(2);
    paths.forEach((p) => expect(p.getAttribute("vector-effect")).toBe("non-scaling-stroke"));
    const majorCount = (paths[1]!.getAttribute("d")!.match(/M/g) ?? []).length;
    const minorCount = (paths[0]!.getAttribute("d")!.match(/M/g) ?? []).length;
    expect(majorCount).toBe(7 + 5);
    expect(minorCount).toBe(31 + 23 - 12);
  });

  it("เลือกโต๊ะแล้วแสดงกรอบเน้นทั้งชุด", () => {
    render(<Harness />);
    const table = state().layout.objects.find((o) => o.type === "table")!;
    fireEvent.click(document.querySelector(`[data-id="${table.id}"]`)!);
    expect(state().selectedObjectId).toBe(table.id);
    expect(screen.getByTestId("table-group-ring")).toBeInTheDocument();
    expect(document.querySelector(`[data-id="${table.id}"]`)).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Keyboard", () => {
  it("ลูกศรย้าย 0.25 ม., Shift+ลูกศร 1 ม., R หมุน, Delete ลบทั้งชุด", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const table = state().layout.objects.find((o) => o.type === "table")!;
    const el = () => document.querySelector<HTMLButtonElement>(`[data-id="${table.id}"]`)!;
    el().focus();
    await user.keyboard("{ArrowRight}");
    expect(find(table.id)).toMatchObject({ x: 3.25, y: 3 });
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(find(table.id)).toMatchObject({ x: 3.25, y: 4 });
    el().focus();
    await user.keyboard("r");
    expect(find(table.id).rotation).toBe(90);
    el().focus();
    await user.keyboard("{Delete}");
    expect(state().layout.objects.some((o) => o.id === table.id || (o.type === "chair" && o.tableId === table.id))).toBe(false);
  });

  it("ลูกศรบนเก้าอี้ย้ายทั้งชุดโต๊ะ", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const chair = state().layout.objects.find((o): o is Chair => o.type === "chair")!;
    const table = find(chair.tableId);
    document.querySelector<HTMLButtonElement>(`[data-id="${chair.id}"]`)!.focus();
    await user.keyboard("{ArrowLeft}");
    expect(find(chair.tableId).x).toBe(table.x - 0.25);
  });

  it("Escape ยกเลิกการเลือก", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const kitchen = state().layout.objects[0]!;
    const el = document.querySelector<HTMLButtonElement>(`[data-id="${kitchen.id}"]`)!;
    fireEvent.click(el);
    el.focus(); // เบราว์เซอร์จริงโฟกัสปุ่มเมื่อคลิก
    await user.keyboard("{Escape}");
    expect(state().selectedObjectId).toBeNull();
  });
});

describe("Pointer drag", () => {
  it("ลากโต๊ะ → snap 0.25 ม., เก้าอี้ตามทั้งชุด, ทั้งการลากเป็น Undo ขั้นเดียว", () => {
    render(<Harness />);
    const table = state().layout.objects.find((o) => o.type === "table")!;
    const el = document.querySelector<HTMLButtonElement>(`[data-id="${table.id}"]`)!;
    const depth = selectUndoDepth(state());
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 400, clientY: 400 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 430, clientY: 400 }); // +0.30 → 3.25
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 472, clientY: 362 }); // +0.72, −0.38 → snap 3.75, 2.5
    fireEvent.pointerUp(el, { pointerId: 1 });
    expect(find(table.id)).toMatchObject({ x: 3.75, y: 2.5 });
    expect(selectUndoDepth(state())).toBe(depth + 1);
    act(() => state().undo());
    expect(find(table.id)).toMatchObject({ x: 3, y: 3 });
  });

  it("Non-blocking: ลากไปทับครัวได้ และ Issue Ring ขึ้นทันที", () => {
    render(<Harness />);
    const table = state().layout.objects.find((o) => o.type === "table")!;
    const el = document.querySelector<HTMLButtonElement>(`[data-id="${table.id}"]`)!;
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 400, clientY: 400 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 150, clientY: 150 }); // ไป (0.5, 0.5)
    fireEvent.pointerUp(el, { pointerId: 1 });
    expect(find(table.id)).toMatchObject({ x: 0.5, y: 0.5 });
    expect(document.querySelector(`[data-id="${table.id}"]`)).toHaveAttribute("data-issue", "blocked");
  });

  it("pointer อื่น / ปุ่มขวา ไม่เริ่มการลาก", () => {
    render(<Harness />);
    const kitchen = state().layout.objects[0]!;
    const el = document.querySelector<HTMLButtonElement>(`[data-id="${kitchen.id}"]`)!;
    fireEvent.pointerDown(el, { pointerId: 1, button: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerDown(el, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(el, { pointerId: 2, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(el, { pointerId: 1 });
    expect(find(kitchen.id)).toMatchObject({ x: 0.5, y: 0.5 });
  });

  it("ลาก handle ปรับขนาดเคาน์เตอร์ (snap 0.05 ม.) และใช้ลูกศรบน handle ได้", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const counter = state().layout.objects.find((o) => o.type === "counter")!;
    fireEvent.click(document.querySelector(`[data-id="${counter.id}"]`)!);
    const handle = screen.getByTestId("resize-handle");
    fireEvent.pointerDown(handle, { pointerId: 3, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 3, clientX: -42, clientY: 31 }); // −0.42, +0.31
    fireEvent.pointerUp(handle, { pointerId: 3 });
    expect(find(counter.id)).toMatchObject({ width: 2, depth: 1 });
    handle.focus();
    await user.keyboard("{ArrowRight}");
    expect(find(counter.id).width).toBeCloseTo(2.05, 9);
  });

  it("ลากป้ายทางเข้าไปผนังตะวันออก", () => {
    render(<Harness />);
    const door = screen.getByTestId("entrance-marker");
    fireEvent.pointerDown(door, { pointerId: 4, button: 0, clientX: 285, clientY: 650 });
    fireEvent.pointerMove(door, { pointerId: 4, clientX: 895, clientY: 350 }); // (7.95, 3)
    fireEvent.pointerUp(door, { pointerId: 4 });
    expect(state().layout.entrance).toMatchObject({ wall: "east", position: 2.5 });
  });

  it("ป้ายทางเข้าเลื่อนด้วยลูกศรตามแนวผนัง", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByTestId("entrance-marker").focus();
    await user.keyboard("{ArrowRight}{ArrowUp}");
    expect(state().layout.entrance!.position).toBe(1.5);
  });
});

describe("Issue rings", () => {
  it("วัตถุที่มีปัญหาแสดง data-issue และข้อความปัญหาใน aria-label", () => {
    state().loadLayout({ ...cafeLayout(), objects: [...cafeLayout().objects, block("k2", 0.5, 0.5, 1, 1)] });
    render(<Harness />);
    const el = document.querySelector('[data-id="k2"]')!;
    expect(el).toHaveAttribute("data-issue", "blocked");
    expect(el.getAttribute("aria-label")).toMatch(/ครัวทับครัวตัวอื่น/);
    expect(el.className).toContain("issue-ring-blocked");
  });

  it("ทางเข้าถูกบัง → ป้ายทางเข้ามี ring", () => {
    state().loadLayout({ ...cafeLayout(), objects: [...cafeLayout().objects, block("blocker", 1, 5.5, 1.75, 0.5)] });
    render(<Harness />);
    expect(screen.getByTestId("entrance-marker")).toHaveAttribute("data-issue", "blocked");
  });
});
