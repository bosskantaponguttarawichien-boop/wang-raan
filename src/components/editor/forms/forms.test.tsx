// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { layoutStore } from "@/store/use-layout-store";
import { cafeLayout } from "@/test/fixtures/layouts";
import { ObjectInspector } from "./object-inspector";
import { RoomSettingsForm } from "./room-settings-form";
import { ObjectInspectorSchema, RoomSettingsSchema } from "./schemas";

const state = () => layoutStore.getState();

beforeEach(() => state().loadLayout(cafeLayout()));
afterEach(cleanup);

describe("RoomSettingsSchema", () => {
  const base = { width: 8, depth: 6, entranceWall: "south" as const, entrancePosition: 3.5, entranceWidth: 1.2 };

  it("ยอมรับค่าที่ถูกต้อง", () => {
    expect(RoomSettingsSchema.safeParse(base).success).toBe(true);
  });

  it.each([
    [{ width: 1.75 }, "อย่างน้อย 2"],
    [{ depth: 30.25 }, "ไม่เกิน 30"],
    [{ width: 8.1 }, "ลงกริด"],
    [{ width: Number.NaN }, "เป็นตัวเลข"],
    [{ entranceWidth: 0.5 }, "อย่างน้อย 0.6"],
    [{ entrancePosition: 7.5 }, "เลยผนัง"],
    [{ entranceWall: "east" as const, entrancePosition: 5 }, "เลยผนัง"],
    [{ width: 2, depth: 2, entranceWidth: 2.5 }, "เกินผนัง"],
  ])("ปฏิเสธ %o", (patch, message) => {
    const result = RoomSettingsSchema.safeParse({ ...base, ...patch });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((i) => i.message).join(" ")).toContain(message);
  });
});

describe("ObjectInspectorSchema", () => {
  const base = { x: 1, y: 1.25, rotation: "90" as const, width: 2.4, depth: 0.7 };
  it("ขนาดลงทีละ 0.05 ม. ตำแหน่งลงกริด 0.25 ม.", () => {
    expect(ObjectInspectorSchema.safeParse(base).success).toBe(true);
    expect(ObjectInspectorSchema.safeParse({ ...base, x: 1.1 }).success).toBe(false);
    expect(ObjectInspectorSchema.safeParse({ ...base, width: 0.72 }).success).toBe(false);
    expect(ObjectInspectorSchema.safeParse({ ...base, depth: 0.2 }).success).toBe(false);
  });
});

describe("RoomSettingsForm (feat-027 gate: พิมพ์แล้วไม่ re-render Canvas)", () => {
  it("ระหว่างพิมพ์ store ไม่ถูกแจ้งเตือนเลย → Canvas ที่ subscribe store ไม่ re-render", async () => {
    const user = userEvent.setup();
    render(<RoomSettingsForm />);
    let notifications = 0;
    const unsubscribe = layoutStore.subscribe(() => notifications++);
    const width = screen.getByLabelText("กว้าง (ม.)");
    await user.clear(width);
    await user.type(width, "10");
    await user.clear(screen.getByLabelText("ลึก (ม.)"));
    await user.type(screen.getByLabelText("ลึก (ม.)"), "7.5");
    expect(notifications).toBe(0);
    expect(state().layout.width).toBe(8);

    await user.click(screen.getByRole("button", { name: "นำไปใช้" }));
    unsubscribe();
    expect(state().layout).toMatchObject({ width: 10, depth: 7.5 });
  });

  it("ขนาดร้าน + ทางเข้าเปลี่ยนพร้อมกันเป็น Undo ขั้นเดียว", async () => {
    const user = userEvent.setup();
    render(<RoomSettingsForm />);
    const before = state().historyIndex;
    await user.clear(screen.getByLabelText("กว้าง (ม.)"));
    await user.type(screen.getByLabelText("กว้าง (ม.)"), "12");
    await user.selectOptions(screen.getByLabelText("ผนังทางเข้า"), "west");
    await user.clear(screen.getByLabelText("ระยะจากมุม (ม.)"));
    await user.type(screen.getByLabelText("ระยะจากมุม (ม.)"), "1");
    await user.click(screen.getByRole("button", { name: "นำไปใช้" }));
    expect(state().layout.width).toBe(12);
    expect(state().layout.entrance).toMatchObject({ wall: "west", position: 1 });
    expect(state().historyIndex).toBe(before + 1);
    act(() => state().undo());
    expect(state().layout.width).toBe(8);
    expect(state().layout.entrance?.wall).toBe("south");
  });

  it("ค่าผิดแสดง error ภาษาไทยผูกกับช่องกรอก และไม่แก้ผัง", async () => {
    const user = userEvent.setup();
    render(<RoomSettingsForm />);
    const width = screen.getByLabelText("กว้าง (ม.)");
    await user.clear(width);
    await user.type(width, "45");
    await user.click(screen.getByRole("button", { name: "นำไปใช้" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ไม่เกิน 30 ม.");
    expect(width).toHaveAttribute("aria-invalid", "true");
    expect(width.getAttribute("aria-describedby")).toContain("error");
    expect(state().layout.width).toBe(8);
  });

  it("ค่าในฟอร์มตามผังเมื่อเปลี่ยนจากที่อื่น (เช่น Undo / ลากทางเข้า)", () => {
    render(<RoomSettingsForm />);
    act(() => state().setRoomDimensions(9, 6));
    expect(screen.getByLabelText("กว้าง (ม.)")).toHaveValue(9);
  });
});

describe("RoomSettingsForm: ผังที่ยังไม่มีทางเข้า", () => {
  it("ปรับขนาดร้านอย่างเดียว → ไม่สร้างทางเข้าให้เอง", async () => {
    const user = userEvent.setup();
    act(() => state().loadLayout({ ...cafeLayout(), entrance: null }));
    render(<RoomSettingsForm />);
    await user.clear(screen.getByLabelText("กว้าง (ม.)"));
    await user.type(screen.getByLabelText("กว้าง (ม.)"), "9");
    await user.click(screen.getByRole("button", { name: "นำไปใช้" }));
    expect(state().layout.width).toBe(9);
    expect(state().layout.entrance).toBeNull();
  });

  it("แก้ช่องทางเข้า → สร้างทางเข้าตามที่กรอก", async () => {
    const user = userEvent.setup();
    act(() => state().loadLayout({ ...cafeLayout(), entrance: null }));
    render(<RoomSettingsForm />);
    await user.selectOptions(screen.getByLabelText("ผนังทางเข้า"), "north");
    await user.click(screen.getByRole("button", { name: "นำไปใช้" }));
    expect(state().layout.entrance).toMatchObject({ wall: "north", position: 0 });
  });
});

describe("ObjectInspector: ชิ้นที่พิกัด/ขนาดไม่ลงกริด (ข้อมูลเก่า)", () => {
  it("เปลี่ยนแค่การหมุนได้ — ช่อง x/ขนาดที่ไม่ได้แตะไม่ทำให้ฟอร์มไม่ผ่าน และไม่ถูกย้าย/ปรับขนาด", async () => {
    const user = userEvent.setup();
    const base = cafeLayout();
    const counter = base.objects.find((o) => o.type === "counter")!;
    const odd = { ...counter, x: 5.13, width: 2.42 };
    act(() => state().loadLayout({ ...base, objects: base.objects.map((o) => (o.id === counter.id ? odd : o)) }));
    act(() => state().selectObject(counter.id));
    render(<ObjectInspector />);
    expect(screen.getByLabelText("ตำแหน่ง x (ม.)")).toHaveValue(5.25);
    await user.selectOptions(screen.getByLabelText("หมุน"), "180");
    await user.click(screen.getByRole("button", { name: "นำไปใช้" }));
    expect(screen.queryByRole("alert")).toBeNull();
    const after = state().layout.objects.find((o) => o.id === counter.id)!;
    expect(after.rotation).toBe(180);
    expect(after.width).toBe(2.42); // ไม่ได้แตะช่องขนาด → ไม่ปรับ
  });
});

describe("ObjectInspector", () => {
  it("ยังไม่เลือก → แสดงคำแนะนำ", () => {
    render(<ObjectInspector />);
    expect(screen.getByText(/เลือกชิ้นงานบนผัง/)).toBeInTheDocument();
  });

  it("แก้ขนาดและตำแหน่งครัว = Undo ขั้นเดียว และไม่แจ้ง store ระหว่างพิมพ์", async () => {
    const user = userEvent.setup();
    const kitchen = state().layout.objects.find((o) => o.type === "kitchen")!;
    act(() => state().selectObject(kitchen.id));
    render(<ObjectInspector />);
    let notifications = 0;
    const unsubscribe = layoutStore.subscribe(() => notifications++);
    await user.clear(screen.getByLabelText("กว้าง (ม.)"));
    await user.type(screen.getByLabelText("กว้าง (ม.)"), "1.8");
    await user.clear(screen.getByLabelText("ตำแหน่ง y (ม.)"));
    await user.type(screen.getByLabelText("ตำแหน่ง y (ม.)"), "1");
    expect(notifications).toBe(0);
    const before = state().historyIndex;
    await user.click(screen.getByRole("button", { name: "นำไปใช้" }));
    unsubscribe();
    expect(state().layout.objects.find((o) => o.id === kitchen.id)).toMatchObject({ width: 1.8, y: 1, x: kitchen.x });
    expect(state().historyIndex).toBe(before + 1);
  });

  it("เลือกเก้าอี้ → แก้ที่โต๊ะแม่ ย้ายทั้งชุด (ไม่มีช่องขนาด)", async () => {
    const user = userEvent.setup();
    const table = state().layout.objects.find((o) => o.type === "table")!;
    const chair = state().layout.objects.find((o) => o.type === "chair" && o.tableId === table.id)!;
    act(() => state().selectObject(chair.id));
    render(<ObjectInspector />);
    expect(screen.queryByLabelText("กว้าง (ม.)")).toBeNull();
    expect(screen.getByLabelText("ตำแหน่ง x (ม.)")).toHaveValue(table.x);
    await user.clear(screen.getByLabelText("ตำแหน่ง x (ม.)"));
    await user.type(screen.getByLabelText("ตำแหน่ง x (ม.)"), String(table.x - 1));
    await user.click(screen.getByRole("button", { name: "นำไปใช้" }));
    const movedChair = state().layout.objects.find((o) => o.id === chair.id)!;
    expect(movedChair.x).toBeCloseTo(chair.x - 1);
    expect(state().layout.objects.find((o) => o.id === table.id)!.x).toBe(table.x - 1);
  });

  it("เปลี่ยนการหมุนอย่างเดียว → หมุนรอบจุดศูนย์กลาง (ไม่ดึงกลับมุมเดิม)", async () => {
    const user = userEvent.setup();
    const counter = state().layout.objects.find((o) => o.type === "counter")!;
    act(() => state().selectObject(counter.id));
    render(<ObjectInspector />);
    await user.selectOptions(screen.getByLabelText("หมุน"), "90");
    await user.click(screen.getByRole("button", { name: "นำไปใช้" }));
    const rotated = state().layout.objects.find((o) => o.id === counter.id)!;
    expect(rotated.rotation).toBe(90);
    // หมุนผ่านปุ่มให้ผลเท่ากัน
    act(() => state().undo());
    act(() => state().rotateObject(counter.id, 90));
    expect(state().layout.objects.find((o) => o.id === counter.id)).toEqual(rotated);
  });

  it("ปุ่มลบชุดโต๊ะ → Cascade Delete เก้าอี้ลูก", async () => {
    const user = userEvent.setup();
    const table = state().layout.objects.find((o) => o.type === "table")!;
    act(() => state().selectObject(table.id));
    render(<ObjectInspector />);
    await user.click(screen.getByRole("button", { name: /ลบทั้งชุดโต๊ะ/ }));
    expect(state().layout.objects.some((o) => o.id === table.id || (o.type === "chair" && o.tableId === table.id))).toBe(false);
  });

  it("เลือกเก้าอี้แล้วกดลบ → ลบเฉพาะเก้าอี้ตัวนั้น โต๊ะและเก้าอี้ตัวอื่นยังอยู่ (feat-034)", async () => {
    const user = userEvent.setup();
    const table = state().layout.objects.find((o) => o.type === "table" && o.chairIds.length > 1)!;
    if (table.type !== "table") throw new Error("fixture");
    const [chairId, ...otherChairs] = table.chairIds;
    act(() => state().selectObject(chairId!));
    render(<ObjectInspector />);
    expect(screen.queryByRole("button", { name: /ลบทั้งชุดโต๊ะ/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "× ลบเก้าอี้ตัวนี้" }));
    const objects = state().layout.objects;
    expect(objects.some((o) => o.id === chairId)).toBe(false);
    const remaining = objects.find((o) => o.id === table.id);
    expect(remaining?.type === "table" && remaining.chairIds).toEqual(otherChairs);
    expect(otherChairs.every((id) => objects.some((o) => o.id === id))).toBe(true);
  });
});
