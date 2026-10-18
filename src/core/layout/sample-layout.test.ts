import { describe, expect, it } from "vitest";
import { createSampleCafeLayout, createStarterLayout } from "./sample-layout";
import { validateLayout } from "../validation";

describe("sample-layout", () => {
  it("createSampleCafeLayout ได้สถานะ ready และไม่มี issue", () => {
    const layout = createSampleCafeLayout();
    const result = validateLayout(layout);
    expect(result.status).toBe("ready");
    expect(result.issues).toHaveLength(0);
  });

  it("createStarterLayout สำหรับผังขนาดต่าง ๆ ไม่ติดสถานะ blocked", () => {
    const cases = [
      { width: 8, depth: 6, wall: "south" as const },
      { width: 10, depth: 7, wall: "east" as const },
      { width: 6, depth: 5, wall: "north" as const },
      { width: 12, depth: 8, wall: "west" as const },
    ];

    for (const c of cases) {
      const layout = createStarterLayout(c);
      expect(layout.entrance).toBeDefined();
      expect(layout.kitchenDoor).not.toBeNull();
      expect(layout.objects.some((o) => o.type === "counter")).toBe(true);
      expect(layout.objects.some((o) => o.type === "table")).toBe(true);
      expect(layout.objects.some((o) => o.type === "chair")).toBe(true);

      const result = validateLayout(layout);
      expect(result.status).not.toBe("blocked");
    }
  });
});

