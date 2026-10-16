// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContainerUnits } from "./use-container-units";

function Probe() {
  const ref = React.useRef<HTMLDivElement>(null);
  const cq = useContainerUnits(ref);
  return (
    <div data-size-container style={{ padding: "8px" }}>
      <div>
        <div ref={ref} data-testid="probe">{`${cq.width}|${cq.height}`}</div>
      </div>
    </div>
  );
}

describe("useContainerUnits", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("ใช้หน่วย cq ตรง ๆ เมื่อเบราว์เซอร์รองรับ", () => {
    vi.spyOn(CSS, "supports").mockReturnValue(true);
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("100cqw|100cqh");
  });

  it("เบราว์เซอร์เก่า (ไม่รู้จัก cqw) → วัด content-box ของ container เป็น px", () => {
    vi.spyOn(CSS, "supports").mockReturnValue(false);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(416);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(316);
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("400px|300px");
  });
});
