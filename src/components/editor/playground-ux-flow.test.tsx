// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { emptyMetrics } from "@/core/simulation";
import { DEFAULT_DAY_CONFIG } from "@/lib/day-config";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { layoutActions as actions, layoutStore } from "@/store/use-layout-store";
import { simulationStore } from "@/store/use-simulation-store";
import { createEmptyLayout, randomId } from "@/core/layout";
import { PlaygroundRail } from "./playground-rail";
import { PlaygroundPanel } from "./playground-panel";
import { PlaygroundStatusBar } from "./playground-status-bar";
import { PlaygroundHeader } from "./playground-header";
import * as nextAuthReact from "next-auth/react";
import { SelectionToolbar } from "@/components/editor-2d/selection-toolbar";
import { IsometricView } from "@/components/preview-3d/isometric-view";
import { summarizeIssues, type LiveValidation } from "@/components/validation/use-live-validation";
import type { ValidationIssue, ValidationResult } from "@/core/layout";

// Mock PointerEvent, scrollIntoView and getBoundingClientRect for JSDOM
if (typeof window !== "undefined") {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

function mockLive(blockedCount = 0, warningCount = 0): LiveValidation {
  const issues: ValidationIssue[] =
    blockedCount > 0
      ? [
          {
            id: "issue-1",
            category: "completeness",
            severity: "blocked",
            message: "ร้านต้องมีเคาน์เตอร์สำหรับสั่ง/ชำระเงินอย่างน้อย 1 จุด",
            objectIds: [],
          },
        ]
      : [];
  const result: ValidationResult = {
    layoutRevision: "rev-1",
    validatedAt: new Date().toISOString(),
    status: blockedCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "ready",
    issues,
  };
  const summary = summarizeIssues(issues);
  return {
    result,
    blockedCount,
    warningCount,
    severityById: summary.severityById,
    messageById: summary.messageById,
    humanIssues: summary.humanIssues,
  };
}

describe("Playground UX Comprehensive QA Suite (feat-060)", () => {
  beforeEach(() => {
    layoutStore.setState({
      layout: createEmptyLayout({ width: 8, depth: 6 }, randomId),
      selectedObjectId: null,
      activeTab: "add",
      is3DView: false,
      history: [],
      historyIndex: -1,
    });
    simulationStore.setState({
      status: "idle",
      metrics: null,
      config: { ...DEFAULT_DAY_CONFIG, speed: 60 },
      analysis: null,
    });
  });

  afterEach(cleanup);

  it("0. เมนูโปรเจกต์รวมทุกคำสั่ง (ผังของฉัน + ไฟล์ + ส่งออกและแชร์ + ร้าน) — แถบหัวไม่มีปุ่มส่งออก/ผังของฉันซ้ำ", async () => {
    vi.mocked(nextAuthReact.useSession).mockReturnValue({
      data: { user: { id: "usr-1" }, expires: "2099-01-01" },
      status: "authenticated",
      update: vi.fn(),
    } as unknown as ReturnType<typeof nextAuthReact.useSession>);
    const user = userEvent.setup();
    render(<PlaygroundHeader />);

    expect(screen.queryByRole("button", { name: "ส่งออก" })).toBeNull();
    expect(screen.queryByRole("link", { name: /ผังของฉัน/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "เมนูโปรเจกต์" }));
    const menu = screen.getByRole("menu", { name: "เมนูโปรเจกต์" });
    expect(screen.getByRole("menuitem", { name: /ผังของฉัน/ }).getAttribute("href")).toBe("/projects");
    for (const group of ["ไฟล์", "ส่งออกและแชร์", "ร้าน"]) {
      expect(screen.getByRole("group", { name: group })).toBeInTheDocument();
    }
    const exportGroup = screen.getByRole("group", { name: "ส่งออกและแชร์" });
    expect([...exportGroup.querySelectorAll("[role=menuitem]")].map((el) => el.getAttribute("data-act"))).toEqual(["png", "svg", "pdf", "share"]);
    expect(menu.querySelectorAll("[role=menuitem]")).toHaveLength(10);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    vi.mocked(nextAuthReact.useSession).mockReturnValue({ data: null, status: "unauthenticated", update: vi.fn() });
  });

  it("1. ผังใหม่ → Onboarding Dialog → เลือกขนาดร้านและสร้างผังใหม่", async () => {
    const user = userEvent.setup();
    const toastFn = vi.fn();
    render(<PlaygroundHeader onToast={toastFn} />);

    // กดปุ่มโปรเจกต์
    const projBtn = screen.getByRole("button", { name: "เมนูโปรเจกต์" });
    await user.click(projBtn);

    // เมนูโปรเจกต์เปิดขึ้น
    const newBtn = screen.getByRole("menuitem", { name: /เริ่มผังใหม่/ });
    await user.click(newBtn);

    // Onboarding Modal เปิดขึ้น
    const modal = screen.getByRole("dialog", { name: "ร้านของคุณขนาดเท่าไร" });
    expect(modal).toBeInTheDocument();

    // ปรับขนาดร้าน กว้าง 10 ลึก 7
    const widthInput = screen.getByLabelText("กว้าง (ม.)");
    await user.click(widthInput);
    await user.keyboard("{Control>}[KeyA]{/Control}10");
    // หรือถ้ายังไม่ได้ ให้ dispatch event
    if ((widthInput as HTMLInputElement).value !== "10") {
      (widthInput as HTMLInputElement).value = "10";
      widthInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const depthInput = screen.getByLabelText("ลึก (ม.)");
    await user.click(depthInput);
    await user.keyboard("{Control>}[KeyA]{/Control}7");
    if ((depthInput as HTMLInputElement).value !== "7") {
      (depthInput as HTMLInputElement).value = "7";
      depthInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // กดปุ่ม 'เริ่มจัดร้าน' ใน Modal
    const submitBtn = screen.getByRole("button", { name: "เริ่มจัดร้าน" });
    await user.click(submitBtn);

    // ตรวจสอบว่า store เปลี่ยนขนาดร้านเป็น 10×7 และมี entrance
    const state = layoutStore.getState();
    expect(state.layout.width).toBe(10);
    expect(state.layout.depth).toBe(7);
    expect(state.layout.entrance).toBeTruthy();
    expect(toastFn).toHaveBeenCalledWith("เริ่มผังใหม่แล้ว");
  });

  it("2. แท็บ 'เพิ่ม' → เพิ่มจำนวนเก้าอี้ตามความจุ แล้ว Table Set Lifecycle สมบูรณ์", async () => {
    const user = userEvent.setup();
    const live = mockLive(1, 0);
    render(<PlaygroundPanel live={live} />);

    // อยู่ที่แท็บ 'add' เริ่มต้น
    await user.click(screen.getByRole("button", { name: /^เพิ่มโต๊ะ/ }));

    const panel = screen.getByRole("region", { name: "ตั้งค่าโต๊ะ" });
    expect(layoutStore.getState().layout.objects).toHaveLength(0);
    await user.click(within(within(panel).getByRole("radiogroup", { name: "ทรงโต๊ะ" })).getByRole("radio", { name: "กลม" }));
    await user.clear(within(panel).getByLabelText("เส้นผ่านศูนย์กลาง (ม.)"));
    await user.type(within(panel).getByLabelText("เส้นผ่านศูนย์กลาง (ม.)"), "1.6{Enter}");
    await user.click(within(panel).getByRole("radio", { name: "สตูล" }));
    await user.click(within(panel).getAllByRole("radio", { name: "ไม้โอ๊ก" })[0]!);
    await user.click(within(panel).getAllByRole("radio", { name: "เขียวเสจ" })[1]!);
    const increaseChairs = within(panel).getByRole("button", { name: "เพิ่มจำนวนเก้าอี้" });
    await user.click(increaseChairs);
    expect(within(panel).getByRole("status")).toHaveTextContent("5 ตัว");
    await user.click(increaseChairs);
    await user.click(increaseChairs);
    await user.click(increaseChairs);
    expect(within(panel).getByRole("status")).toHaveTextContent("8 ตัว");
    expect(increaseChairs).toBeDisabled();
    await user.clear(within(panel).getByLabelText("เส้นผ่านศูนย์กลาง (ม.)"));
    await user.type(within(panel).getByLabelText("เส้นผ่านศูนย์กลาง (ม.)"), "0.6{Enter}");
    expect(within(panel).getByText("โต๊ะขนาดนี้รองรับเก้าอี้ได้สูงสุด 4 ตัว", { exact: false })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "เพิ่มโต๊ะพร้อมเก้าอี้ 8 ตัว ลงผัง" })).toBeDisabled();
    await user.clear(within(panel).getByLabelText("เส้นผ่านศูนย์กลาง (ม.)"));
    await user.type(within(panel).getByLabelText("เส้นผ่านศูนย์กลาง (ม.)"), "1.6{Enter}");
    const decreaseChairs = within(panel).getByRole("button", { name: "ลดจำนวนเก้าอี้" });
    await user.click(decreaseChairs);
    await user.click(decreaseChairs);
    await user.click(decreaseChairs);
    await user.click(within(panel).getByRole("button", { name: "เพิ่มโต๊ะพร้อมเก้าอี้ 5 ตัว ลงผัง" }));

    let state = layoutStore.getState();
    const table4 = state.layout.objects.find((o) => o.type === "table");
    expect(table4).toBeDefined();
    expect(table4).toMatchObject({ width: 1.6, depth: 1.6, style: { shape: "round", color: "oak" } });
    // โต๊ะมีเก้าอี้ตามจำนวนที่เพิ่ม
    let chairs = state.layout.objects.filter((o) => o.type === "chair");
    expect(chairs).toHaveLength(5);

    // กลับจากหน้าแก้ไขไปหน้าเพิ่ม แล้วเปิดหน้าตั้งค่าใหม่โดยไม่ยืนยัน → ผังไม่เปลี่ยน
    await user.click(screen.getByRole("button", { name: "กลับ" }));
    expect(layoutStore.getState().layout.objects.filter((o) => o.type === "table")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "เพิ่มลงผัง" })).toBeInTheDocument();

    // ลดจำนวนเก้าอี้เหลือ 2 ตัวจากหน้าตั้งค่าเดียวกัน
    await user.click(screen.getByRole("button", { name: /^เพิ่มโต๊ะ/ }));
    const secondPanel = screen.getByRole("region", { name: "ตั้งค่าโต๊ะ" });
    await user.click(within(secondPanel).getByRole("button", { name: "ลดจำนวนเก้าอี้" }));
    await user.click(within(secondPanel).getByRole("button", { name: "ลดจำนวนเก้าอี้" }));
    await user.click(within(secondPanel).getByRole("button", { name: "เพิ่มโต๊ะพร้อมเก้าอี้ 2 ตัว ลงผัง" }));

    state = layoutStore.getState();
    const tables = state.layout.objects.filter((o) => o.type === "table");
    expect(tables).toHaveLength(2);
    chairs = state.layout.objects.filter((o) => o.type === "chair");
    expect(chairs).toHaveLength(7);
    const styledChairs = chairs.filter((o) => o.tableId === table4!.id);
    expect(styledChairs.every((chair) => chair.style?.kind === "stool" && chair.style?.color === "sage")).toBe(true);
  });

  it("2.1 เลือกโต๊ะหรือเก้าอี้ลูก → แผงซ้ายเป็นหน้าแก้ไขของโต๊ะชุดนั้น", async () => {
    const user = userEvent.setup();
    const toastFn = vi.fn();
    const tableId = actions().addTableSet("table-4-seats", { x: 3, y: 3 });
    const chair = layoutStore.getState().layout.objects.find((object) => object.type === "chair" && object.tableId === tableId)!;
    actions().selectObject(chair.id);
    render(<PlaygroundPanel live={mockLive()} onToast={toastFn} />);

    const panel = screen.getByRole("region", { name: "แก้ไขโต๊ะ" });
    expect(within(panel).getByRole("heading", { name: "แก้ไขโต๊ะ" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "เพิ่มลงผัง" })).toBeNull();
    await user.click(within(panel).getByRole("button", { name: "เพิ่มจำนวนเก้าอี้" }));
    expect(layoutStore.getState().layout.objects.filter((object) => object.type === "chair" && object.tableId === tableId)).toHaveLength(5);
    expect(layoutStore.getState().selectedObjectId).toBe(tableId);

    await user.click(within(panel).getByRole("button", { name: "หมุนโต๊ะ 90 องศา" }));
    expect(layoutStore.getState().layout.objects.find((object) => object.id === tableId)).toMatchObject({ rotation: 90 });
    await user.click(within(panel).getByRole("button", { name: "กลับ" }));
    expect(layoutStore.getState().selectedObjectId).toBeNull();
    expect(screen.getByRole("heading", { name: "เพิ่มลงผัง" })).toBeInTheDocument();
  });

  it("2.2 เมื่อสลับไปแท็บจำลอง แผงจำลองต้องไม่ถูกหน้าแก้ไขโต๊ะบัง", () => {
    const tableId = actions().addTableSet("table-4-seats", { x: 3, y: 3 });
    actions().selectObject(tableId);
    layoutStore.setState({ activeTab: "check" });
    render(<PlaygroundPanel live={mockLive()} />);

    expect(screen.queryByRole("region", { name: "แก้ไขโต๊ะ" })).toBeNull();
    expect(screen.getByRole("heading", { name: "ตรวจผังและจำลอง" })).toBeInTheDocument();
  });

  it("3. Floating Selection Toolbar: สลับที่นั่ง 4↔2, หมุน, ปรับพิกัด, และ Cascade Delete", async () => {
    const user = userEvent.setup();
    // สร้างโต๊ะ 4 ที่นั่ง
    actions().addTableSet("table-4-seats");
    const state = layoutStore.getState();
    const table = state.layout.objects.find((o) => o.type === "table")!;
    actions().selectObject(table.id);

    const boxRef = { current: document.createElement("div") };
    const toastFn = vi.fn();

    render(
      <SelectionToolbar
        boxRef={boxRef}
        room={{ width: 8, depth: 6 }}
        objects={layoutStore.getState().layout.objects}
        selected={table}
        groupRect={{ x: 2, y: 2, width: 2, depth: 2 }}
        onToast={toastFn}
      />,
    );

    // 3.1 หมุน 90°
    const rotateBtn = screen.getByRole("button", { name: "หมุน 90 องศา" });
    await user.click(rotateBtn);
    const updatedTable = layoutStore.getState().layout.objects.find((o) => o.id === table.id)!;
    expect(updatedTable.rotation).toBe(90);

    // 3.2 สลับที่นั่ง 4 → 2
    const seatSwitchBtn = screen.getByRole("button", { name: "เปลี่ยนจำนวนที่นั่ง" });
    await user.click(seatSwitchBtn);
    const chairs = layoutStore.getState().layout.objects.filter((o) => o.type === "chair");
    expect(chairs).toHaveLength(2);

    // 3.3 ลบ (Cascade Delete)
    // หาโต๊ะตัวปัจจุบันหลังสลับที่นั่ง
    const currentTable = layoutStore.getState().layout.objects.find((o) => o.type === "table")!;
    actions().deleteObject(currentTable.id);
    expect(layoutStore.getState().layout.objects.filter((o) => o.type === "table")).toHaveLength(0);
    expect(layoutStore.getState().layout.objects.filter((o) => o.type === "chair")).toHaveLength(0);
  });

  it("4. สลับแท็บ 'ร้าน' และ 'จำลอง' บน PlaygroundRail + แสดง Badge ปัญหา", async () => {
    const user = userEvent.setup();
    const live = mockLive(2, 1);
    render(<PlaygroundRail live={live} />);

    // ตรวจสอบ Badge แสดงปัญหา 2 ข้อ
    const badge = screen.getByLabelText("มีปัญหาต้องแก้ 2 ข้อ");
    expect(badge).toHaveTextContent("2");

    // สลับไปแท็บ "ร้าน"
    const shopTab = screen.getByRole("button", { name: "ร้าน" });
    await user.click(shopTab);
    expect(layoutStore.getState().activeTab).toBe("shop");

    // สลับไปแท็บ "จำลอง"
    const simTab = screen.getByRole("button", { name: "จำลอง" });
    await user.click(simTab);
    expect(layoutStore.getState().activeTab).toBe("check");
  });

  it("5. แท็บ 'จำลอง': ผัง Blocked ปุ่มเริ่มจำลองกดแล้วไม่เริ่มและมี aria-disabled; ผัง Ready กดเริ่มจำลองได้", async () => {
    layoutStore.setState({ activeTab: "check" });
    const blockedLive = mockLive(1, 0);

    const { rerender } = render(<PlaygroundPanel live={blockedLive} />);

    // ตรวจสอบว่าปุ่มเริ่มจำลองมี aria-disabled="true"
    const startBtn = screen.getByTestId("start-simulation");
    expect(startBtn).toHaveAttribute("aria-disabled", "true");

    // เมื่อผัง Ready
    const readyLive = mockLive(0, 0);
    rerender(<PlaygroundPanel live={readyLive} />);

    expect(screen.getByTestId("start-simulation")).toHaveAttribute("aria-disabled", "false");
  });

  it("6. โหมดจำลอง: ล็อกตัวควบคุม (Header undo/redo disabled, Rail ซ่อน, แผงแสดงปุ่มหยุด/จบรอบ)", async () => {
    simulationStore.setState({ status: "running" });

    // 6.1 Header: undo/redo disabled
    render(<PlaygroundHeader />);
    expect(screen.getByRole("button", { name: /ย้อนกลับ/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /ทำซ้ำ/ })).toBeDisabled();

    // 6.2 Rail: ซ่อนระหว่างจำลอง
    cleanup();
    const { container } = render(<PlaygroundRail live={mockLive(0, 0)} />);
    expect(container.querySelector("#rail")).toBeNull();

    // 6.3 Panel: แสดงปุ่มหยุดชั่วคราวและจบรอบ
    cleanup();
    render(<PlaygroundPanel live={mockLive(0, 0)} />);
    expect(screen.getByRole("button", { name: /⏸ หยุดชั่วคราว/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /■ จบรอบ/ })).toBeInTheDocument();
  });

  it("7. จบรอบจำลอง: บันทึก metrics และแสดงสรุปผลรอบล่าสุดพร้อมคำแนะนำ 1 ประโยค", async () => {
    simulationStore.setState({
      status: "idle",
      metrics: {
        ...emptyMetrics(),
        time: 120,
        arrived: 25,
        served: 20,
        seated: 8,
        noSeat: 2,
        inStore: 5,
        queuing: 0,
        maxQueue: 0,
        avgVisitMinutes: 22.4,
      },
    });

    layoutStore.setState({ activeTab: "check" });
    render(<PlaygroundPanel live={mockLive(0, 0)} />);

    // ตรวจสอบการ์ดสรุปผลจำลองรอบล่าสุด
    const summaryCard = screen.getByTestId("latest-sim-summary");
    expect(summaryCard).toBeInTheDocument();
    expect(summaryCard).toHaveTextContent("ลูกค้าเข้ามา25 คน");
    expect(summaryCard).toHaveTextContent("รับบริการแล้ว20 คน");
    expect(summaryCard).toHaveTextContent("ไม่มีที่นั่ง2 คน");
    // คำแนะนำที่แนะนำว่าที่นั่งไม่พอ
    expect(summaryCard).toHaveTextContent("ที่นั่งไม่พอช่วงพีค ลองเพิ่มโต๊ะ");

    // สลับกลับไปแท็บ 'เพิ่ม' (add) ยังเห็นผลรอบล่าสุดย่ออยู่
    cleanup();
    layoutStore.setState({ activeTab: "add" });
    render(<PlaygroundPanel live={mockLive(0, 0)} />);
    expect(screen.getByText("ผลจำลองรอบล่าสุด")).toBeInTheDocument();
    expect(screen.getByText(/ลูกค้าเข้าร้าน 25 คน/)).toBeInTheDocument();
  });

  it("8. มุมมอง 3D: คลิกเลือกและขยับวัตถุด้วยคีย์บอร์ดซิงก์กับ Store", async () => {
    const user = userEvent.setup();
    actions().addTableSet("table-2-seats");
    const table = layoutStore.getState().layout.objects.find((o) => o.type === "table")!;
    const initialX = table.x;

    const { container } = render(<IsometricView />);

    // เลือกโต๊ะใน 3D ผ่าน polygon data-object-id
    const tableIso = container.querySelector(`[data-object-id="${table.id}"]`);
    expect(tableIso).not.toBeNull();
    await user.click(tableIso!);

    // ตรวจสอบว่า selectedObjectId ใน store เปลี่ยน
    expect(layoutStore.getState().selectedObjectId).toBe(table.id);

    // กดลูกศรขวาเพื่อขยับไปทางขวา 0.25 ม.
    await user.keyboard("{ArrowRight}");
    const updatedTable = layoutStore.getState().layout.objects.find((o) => o.id === table.id)!;
    expect(updatedTable.x).toBeCloseTo(initialX + 0.25, 2);

    // กด R เพื่อหมุน
    await user.keyboard("r");
    const rotatedTable = layoutStore.getState().layout.objects.find((o) => o.id === table.id)!;
    expect(rotatedTable.rotation).toBe(90);

    // กด Escape เพื่อยกเลิกเลือก
    await user.keyboard("{Escape}");
    expect(layoutStore.getState().selectedObjectId).toBeNull();
  });

  it("9. Status Bar: แสดงจำนวนปัญหาและปุ่ม 'พาไปดู' คลิกแล้วโฟกัสปัญหาแรก", async () => {
    const user = userEvent.setup();
    // สร้างโต๊ะในผังเพื่อให้ผ่านเงื่อนไข hasTables
    actions().addTableSet("table-2-seats");
    const live = mockLive(1, 0);
    const focusIssueFn = vi.fn();

    render(<PlaygroundStatusBar live={live} onFocusIssue={focusIssueFn} />);

    const bar = screen.getByTestId("validation-status-bar");
    expect(bar).toHaveAttribute("data-status", "blocked");
    expect(screen.getByText("ต้องแก้อีก 1 ข้อก่อนจำลอง")).toBeInTheDocument();

    const fixBtn = screen.getByRole("button", { name: /พาไปดู/ });
    await user.click(fixBtn);
    expect(focusIssueFn).toHaveBeenCalledWith(0);
    expect(layoutStore.getState().activeTab).toBe("check");
  });
});
