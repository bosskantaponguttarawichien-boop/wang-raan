// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { layoutActions as actions, layoutStore, ZOOM_MAX } from "@/store/use-layout-store";
import { pinchZoom, usePinchZoom } from "./use-pinch-zoom";

function Stage() {
  const ref = React.useRef<HTMLDivElement>(null);
  usePinchZoom(ref);
  return <div ref={ref} data-testid="stage" />;
}

const touches = (gap: number) => [
  { identifier: 1, clientX: 100, clientY: 100 },
  { identifier: 2, clientX: 100 + gap, clientY: 100 },
];

describe("usePinchZoom", () => {
  beforeEach(() => actions().setZoom(1));
  afterEach(cleanup);

  it("pinchZoom คูณ zoom ตามอัตราส่วนระยะสองนิ้ว", () => {
    expect(pinchZoom(1, 100, 200)).toBe(2);
    expect(pinchZoom(1.5, 100, 50)).toBe(0.75);
    expect(pinchZoom(1, 0, 50)).toBe(1);
  });

  it("กางสองนิ้วแล้วซูมเข้า และไม่เกิน ZOOM_MAX", () => {
    render(<Stage />);
    const stage = screen.getByTestId("stage");
    fireEvent.touchStart(stage, { touches: touches(100) });
    fireEvent.touchMove(stage, { touches: touches(150) });
    expect(layoutStore.getState().zoom).toBe(1.5);
    fireEvent.touchMove(stage, { touches: touches(1000) });
    expect(layoutStore.getState().zoom).toBe(ZOOM_MAX);
  });

  it("นิ้วเดียวไม่เปลี่ยน zoom", () => {
    render(<Stage />);
    const stage = screen.getByTestId("stage");
    fireEvent.touchStart(stage, { touches: touches(100).slice(0, 1) });
    fireEvent.touchMove(stage, { touches: touches(100).slice(0, 1) });
    expect(layoutStore.getState().zoom).toBe(1);
  });
});
