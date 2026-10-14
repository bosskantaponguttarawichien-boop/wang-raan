// @vitest-environment jsdom
import * as React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SelectionToolbar } from "./selection-toolbar";
import {
  createEmptyLayout,
  addTableSet,
  createKitchen,
  type StoreLayout,
  type Table,
} from "@/core/layout";
import { layoutStore } from "@/store/use-layout-store";

describe("SelectionToolbar Component", () => {
  let layout: StoreLayout;
  let table: Table;
  let boxRef: React.RefObject<HTMLDivElement>;

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    layoutStore.getState().resetLayout();
    const base = createEmptyLayout({ width: 8, depth: 6 });
    const res = addTableSet(base, "table-2-seats", { x: 3, y: 3 });
    layout = res.layout;
    table = res.tableSet.table;
    layoutStore.getState().replaceLayout(layout);

    const div = document.createElement("div");
    Object.defineProperty(div, "clientWidth", { value: 800 });
    Object.defineProperty(div, "clientHeight", { value: 600 });
    boxRef = { current: div };
  });

  it("แสดงผลปุ่มคำสั่งครบถ้วนและมี aria-label ภาษาไทย", () => {
    render(
      <SelectionToolbar
        boxRef={boxRef}
        room={{ width: 8, depth: 6 }}
        objects={layout.objects}
        selected={table}
        groupRect={null}
      />,
    );

    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "หมุน 90 องศา" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ทำซ้ำ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เปลี่ยนจำนวนที่นั่ง" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ปรับละเอียด" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ลบ" })).toBeInTheDocument();
  });

  it("คลิกปุ่ม 'หมุน 90 องศา' แล้วหมุนโต๊ะ", () => {
    render(
      <SelectionToolbar
        boxRef={boxRef}
        room={{ width: 8, depth: 6 }}
        objects={layout.objects}
        selected={table}
        groupRect={null}
      />,
    );

    const rotBtn = screen.getByRole("button", { name: "หมุน 90 องศา" });
    fireEvent.click(rotBtn);

    const currentTable = layoutStore.getState().layout.objects.find((o) => o.id === table.id);
    expect(currentTable?.rotation).toBe(90);
  });

  it("คลิกปุ่ม 'ทำซ้ำ' แล้วเพิ่มวัตถุใหม่และเรียก onToast", () => {
    const onToast = vi.fn();
    render(
      <SelectionToolbar
        boxRef={boxRef}
        room={{ width: 8, depth: 6 }}
        objects={layout.objects}
        selected={table}
        groupRect={null}
        onToast={onToast}
      />,
    );

    const dupBtn = screen.getByRole("button", { name: "ทำซ้ำ" });
    fireEvent.click(dupBtn);

    expect(onToast).toHaveBeenCalledWith("ทำซ้ำแล้ว วางไว้ในที่ว่างที่ใกล้ที่สุด");
    // โต๊ะในร้านต้องเพิ่มขึ้น
    const tables = layoutStore.getState().layout.objects.filter((o) => o.type === "table");
    expect(tables.length).toBe(2);
  });

  it("คลิกปุ่ม 'เปลี่ยนจำนวนที่นั่ง' แล้วสลับ preset 2 ↔ 4 ที่นั่งและเรียก onToast", () => {
    const onToast = vi.fn();
    render(
      <SelectionToolbar
        boxRef={boxRef}
        room={{ width: 8, depth: 6 }}
        objects={layout.objects}
        selected={table}
        groupRect={null}
        onToast={onToast}
      />,
    );

    const seatBtn = screen.getByRole("button", { name: "เปลี่ยนจำนวนที่นั่ง" });
    fireEvent.click(seatBtn);

    expect(onToast).toHaveBeenCalledWith(expect.stringContaining("เปลี่ยนเป็นโต๊ะ 4 ที่นั่งแล้ว"));
    const tables = layoutStore.getState().layout.objects.filter((o) => o.type === "table") as Table[];
    expect(tables[0]?.preset).toBe("table-4-seats");
  });

  it("คลิกปุ่ม 'ปรับละเอียด' แล้วเปิด Popover ปรับพิกัด X/Y ได้", () => {
    render(
      <SelectionToolbar
        boxRef={boxRef}
        room={{ width: 8, depth: 6 }}
        objects={layout.objects}
        selected={table}
        groupRect={null}
      />,
    );

    const moreBtn = screen.getByRole("button", { name: "ปรับละเอียด" });
    fireEvent.click(moreBtn);

    const popover = screen.getByRole("dialog", { name: "ปรับตำแหน่งละเอียด" });
    expect(popover).toBeInTheDocument();

    const inputX = screen.getByLabelText("ซ้าย-ขวา");
    fireEvent.change(inputX, { target: { value: "4.5" } });
    fireEvent.keyDown(inputX, { key: "Enter" });

    const currentTable = layoutStore.getState().layout.objects.find((o) => o.id === table.id);
    expect(currentTable?.x).toBe(4.5);
  });

  it("คลิกปุ่ม 'ลบ' แล้วลบโต๊ะและแจ้งเตือนจำนวนเก้าอี้พร้อม Ctrl+Z", () => {
    const onToast = vi.fn();
    render(
      <SelectionToolbar
        boxRef={boxRef}
        room={{ width: 8, depth: 6 }}
        objects={layout.objects}
        selected={table}
        groupRect={null}
        onToast={onToast}
      />,
    );

    const delBtn = screen.getByRole("button", { name: "ลบ" });
    fireEvent.click(delBtn);

    expect(onToast).toHaveBeenCalledWith(expect.stringContaining("ลบโต๊ะพร้อมเก้าอี้ 2 ตัวแล้ว · กด Ctrl+Z เพื่อย้อน"));
    expect(layoutStore.getState().layout.objects.find((o) => o.id === table.id)).toBeUndefined();
  });

  it("วัตถุที่ไม่ใช่โต๊ะ (เช่น ครัว) ไม่มีปุ่มเปลี่ยนจำนวนที่นั่ง", () => {
    const kitchen = createKitchen({ position: { x: 1, y: 1 } });
    render(
      <SelectionToolbar
        boxRef={boxRef}
        room={{ width: 8, depth: 6 }}
        objects={[kitchen]}
        selected={kitchen}
        groupRect={null}
      />,
    );

    expect(screen.queryByRole("button", { name: "เปลี่ยนจำนวนที่นั่ง" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ทำซ้ำ" })).toBeInTheDocument();
  });
});
