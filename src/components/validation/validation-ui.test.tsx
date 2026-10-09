// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { layoutStore } from "@/store/use-layout-store";
import { IsometricView } from "@/components/preview-3d/isometric-view";
import { cafeLayout, withObjects, withoutType } from "@/test/fixtures/layouts";
import { summarizeIssues, useLiveValidation } from "./use-live-validation";
import { ValidationStatusBar } from "./validation-status-bar";

function Bar() {
  const live = useLiveValidation();
  return <ValidationStatusBar live={live} />;
}
const state = () => layoutStore.getState();

beforeEach(() => state().loadLayout(cafeLayout()));
afterEach(cleanup);

describe("Validation Status Bar", () => {
  it("Ready → เขียว พร้อมจำลอง", () => {
    render(<Bar />);
    expect(screen.getByTestId("validation-status-bar")).toHaveAttribute("data-status", "ready");
    expect(screen.getByRole("status")).toHaveTextContent("พร้อมจำลอง · ผ่านทุกกฎ · เริ่มจำลองได้");
  });

  it("Instant feedback: ผังเปลี่ยน → สถานะเปลี่ยนใน render เดียวกัน (ไม่ต้องรอ timer)", () => {
    render(<Bar />);
    const kitchen = state().layout.objects.find((o) => o.type === "kitchen")!;
    act(() => state().deleteObject(kitchen.id));
    expect(screen.getByTestId("validation-status-bar")).toHaveAttribute("data-status", "blocked");
    expect(screen.getByRole("status")).toHaveTextContent("ยังจำลองไม่ได้ · ต้องแก้ 1 ข้อก่อนเริ่มจำลอง");
    act(() => state().undo());
    expect(screen.getByTestId("validation-status-bar")).toHaveAttribute("data-status", "ready");
  });

  it("Warning → เริ่มจำลองได้พร้อมจำนวนข้อควรระวัง", () => {
    state().loadLayout(
      withObjects(cafeLayout(), { id: "t-empty", type: "table", x: 6, y: 5, width: 0.8, depth: 0.8, rotation: 0, chairIds: [] }),
    );
    render(<Bar />);
    expect(screen.getByRole("status")).toHaveTextContent("มีข้อควรระวัง · เริ่มจำลองได้ · ข้อควรระวัง 1 ข้อ");
  });

  it("Drawer แสดงรายการตามหมวด และเลือกรายการแล้วไปยังชิ้นงาน", async () => {
    const user = userEvent.setup();
    const layout = cafeLayout();
    const table = layout.objects.find((o) => o.type === "table")!;
    const kitchen = layout.objects.find((o) => o.type === "kitchen")!;
    state().loadLayout(withoutType({ ...layout, objects: layout.objects.map((o) => (o.id === table.id ? { ...o, x: kitchen.x, y: kitchen.y } : o)) }, "counter"));
    render(<Bar />);
    await user.click(screen.getByRole("button", { name: /ดูรายการ/ }));
    const dialog = screen.getByRole("dialog", { name: "รายการที่ต้องตรวจ" });
    expect(within(dialog).getByRole("heading", { name: /ความครบถ้วนของผัง/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: /การชนและทับซ้อน/ })).toBeInTheDocument();
    await user.click(within(dialog).getAllByRole("button", { name: /ต้องแก้.*ทับ/ })[0]!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(state().selectedObjectId).not.toBeNull();
  });

  it("Drawer ว่างเมื่อผังผ่าน และปิดด้วย Escape (focus trap ของ Radix)", async () => {
    const user = userEvent.setup();
    render(<Bar />);
    await user.click(screen.getByRole("button", { name: "ดูรายการ (0)" }));
    expect(screen.getByText("ผังผ่านทุกกฎแล้ว พร้อมเริ่มจำลองลูกค้า")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("summarizeIssues: blocked ชนะ warning สำหรับวัตถุเดียวกัน", () => {
    const s = summarizeIssues([
      { id: "a", category: "completeness", severity: "warning", objectIds: ["x"], message: "w" },
      { id: "b", category: "collision", severity: "blocked", objectIds: ["x"], message: "b" },
      { id: "c", category: "collision", severity: "warning", objectIds: ["x"], message: "w2" },
    ]);
    expect(s.severityById.get("x")).toBe("blocked");
    expect(s.messageById.get("x")).toBe("b");
    expect([s.blockedCount, s.warningCount]).toEqual([1, 2]);
  });
});

describe("Isometric view", () => {
  it("เป็น SVG ล้วน มี role=img พร้อมคำอธิบายไทย และไม่มี <canvas>", () => {
    const { container } = render(<IsometricView />);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-label")).toMatch(/ไอโซเมตริก ขนาด 8 × 6 เมตร มีโต๊ะ 2 ตัว เก้าอี้ 6 ตัว/);
    expect(svg.querySelectorAll("polygon").length).toBeGreaterThan(50);
    expect(container.querySelector("canvas")).toBeNull();
    expect(screen.getByText("ทางเข้า")).toBeInTheDocument();
  });

  it("อัปเดตตามผัง", () => {
    render(<IsometricView />);
    const count = () => screen.getByRole("img").querySelectorAll("polygon").length;
    const before = count();
    act(() => state().addTableSet("table-2-seats", { x: 6, y: 1.5 }));
    expect(count()).toBeGreaterThan(before);
  });
});
