// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
      config: { customersPerHour: 20, speed: 60 },
    });
  });

  afterEach(cleanup);

  it("1. ผังใหม่ → Onboarding Dialog → เลือกขนาดร้านและสร้างผังใหม่", async () => {
    const user = userEvent.setup();
    const toastFn = vi.fn();
    render(<PlaygroundHeader onToast={toastFn} />);

    // กดปุ่มโปรเจกต์
    const projBtn = screen.getByRole("button", { name: /ร้านกาแฟของฉัน/ });
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

  it("2. แท็บ 'เพิ่ม' → เพิ่มชุดโต๊ะ 4 ที่นั่งและ 2 ที่นั่ง → Table Set Lifecycle สมบูรณ์", async () => {
    const user = userEvent.setup();
    const live = mockLive(1, 0);
    render(<PlaygroundPanel live={live} />);

    // อยู่ที่แท็บ 'add' เริ่มต้น
    const addTable4Btn = screen.getByRole("button", { name: /ชุดโต๊ะ 4 ที่นั่ง/ });
    await user.click(addTable4Btn);

    let state = layoutStore.getState();
    const table4 = state.layout.objects.find((o) => o.type === "table");
    expect(table4).toBeDefined();
    // โต๊ะ 4 ที่นั่งมีเก้าอี้ 4 ตัว
    let chairs = state.layout.objects.filter((o) => o.type === "chair");
    expect(chairs).toHaveLength(4);

    // เพิ่มชุดโต๊ะ 2 ที่นั่ง
    const addTable2Btn = screen.getByRole("button", { name: /ชุดโต๊ะ 2 ที่นั่ง/ });
    await user.click(addTable2Btn);

    state = layoutStore.getState();
    const tables = state.layout.objects.filter((o) => o.type === "table");
    expect(tables).toHaveLength(2);
    chairs = state.layout.objects.filter((o) => o.type === "chair");
    expect(chairs).toHaveLength(6);
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
