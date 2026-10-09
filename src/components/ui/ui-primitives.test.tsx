// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button, IconButton, PaletteItem, StatusBadge, ViewSwitch } from "./index";

afterEach(cleanup);

const FOCUS_RING = ["focus-visible:outline-3", "focus-visible:outline-solid", "focus-visible:outline-focus"];

function Toolbar({ disabledDelete = false }: { disabledDelete?: boolean }) {
  const [view, setView] = React.useState<"2d" | "3d">("2d");
  return (
    <div>
      <Button>ตรวจผังร้าน</Button>
      <IconButton aria-label="หมุนชิ้นงาน 90 องศา">↻</IconButton>
      <Button variant="danger" disabled={disabledDelete}>
        ลบชิ้นงาน
      </Button>
      <ViewSwitch
        aria-label="เลือกมุมมองผังร้าน"
        value={view}
        onValueChange={setView}
        options={[
          { value: "2d", label: "2D" },
          { value: "3d", label: "3D" },
        ]}
      />
      <PaletteItem name="ชุดโต๊ะ 4 ที่นั่ง" size="1.2 × 1.2 ม." icon="▦" />
    </div>
  );
}

describe("Tab navigation", () => {
  it("Tab ไล่โฟกัสครบทุกตัวควบคุมตามลำดับเอกสาร", async () => {
    const user = userEvent.setup();
    render(<Toolbar />);
    const expected = [
      screen.getByRole("button", { name: "ตรวจผังร้าน" }),
      screen.getByRole("button", { name: "หมุนชิ้นงาน 90 องศา" }),
      screen.getByRole("button", { name: "ลบชิ้นงาน" }),
      screen.getByRole("button", { name: "2D" }),
      screen.getByRole("button", { name: "3D" }),
      screen.getByRole("button", { name: /^เพิ่มชุดโต๊ะ 4 ที่นั่ง\s*1\.2 × 1\.2 ม\./ }),
    ];
    for (const el of expected) {
      await user.tab();
      expect(el).toHaveFocus();
    }
    await user.tab({ shift: true });
    expect(expected[4]).toHaveFocus();
  });

  it("ปุ่มที่ disabled ถูกข้ามในลำดับ Tab", async () => {
    const user = userEvent.setup();
    render(<Toolbar disabledDelete />);
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "2D" })).toHaveFocus();
  });

  it("Enter / Space บนปุ่มที่โฟกัสอยู่ เรียก onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>เริ่มจำลอง</Button>);
    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

describe("Focus indicator", () => {
  it("ทุก primitive มี focus-visible ring (outline 3px สี --focus)", () => {
    render(<Toolbar />);
    for (const button of screen.getAllByRole("button")) {
      for (const cls of FOCUS_RING) expect(button.className).toContain(cls);
    }
  });

  it("ทุก primitive ปิด transition เมื่อ prefers-reduced-motion", () => {
    render(<Toolbar />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toContain("motion-reduce:transition-none");
    }
  });
});

describe("ARIA ภาษาไทย", () => {
  it("ViewSwitch ใช้ aria-pressed และสลับสถานะเมื่อคลิก/กดแป้น", async () => {
    const user = userEvent.setup();
    render(<Toolbar />);
    expect(screen.getByRole("group", { name: "เลือกมุมมองผังร้าน" })).toBeInTheDocument();
    const d2 = screen.getByRole("button", { name: "2D" });
    const d3 = screen.getByRole("button", { name: "3D" });
    expect(d2).toHaveAttribute("aria-pressed", "true");
    expect(d3).toHaveAttribute("aria-pressed", "false");
    d3.focus();
    await user.keyboard(" ");
    expect(d3).toHaveAttribute("aria-pressed", "true");
    expect(d2).toHaveAttribute("aria-pressed", "false");
  });

  it("Button มี type=button เป็นค่าเริ่มต้น และ asChild ส่งต่อ class ให้ลิงก์", () => {
    render(
      <>
        <Button>บันทึก</Button>
        <Button asChild>
          <a href="/playground">เริ่มจัดผังร้าน</a>
        </Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "บันทึก" })).toHaveAttribute("type", "button");
    const link = screen.getByRole("link", { name: "เริ่มจัดผังร้าน" });
    expect(link).not.toHaveAttribute("type");
    expect(link.className).toContain("bg-blue");
  });

  it("ไอคอนใน PaletteItem ถูกซ่อนจาก Screen Reader", () => {
    render(<PaletteItem name="ครัว" size="2.0 × 1.5 ม." icon="▤" />);
    const button = screen.getByRole("button", { name: /^เพิ่มครัว\s*2\.0 × 1\.5 ม\./ });
    expect(button.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it.each([
    ["ready", "สถานะผัง: พร้อมจำลอง"],
    ["warning", "สถานะผัง: มีข้อควรระวัง"],
    ["blocked", "สถานะผัง: ยังจำลองไม่ได้"],
  ] as const)("StatusBadge %s ประกาศผ่าน role=status เป็นข้อความไทย", (status, text) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveAttribute("aria-live", "polite");
    expect(badge).toHaveTextContent(text);
  });
});
