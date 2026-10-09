import { describe, expect, it } from "vitest";
import { validateLayout } from "@/core/validation";
import { block, cafeLayout, withoutType } from "@/test/fixtures/layouts";
import { CELL_BLOCKED, CELL_FREE, buildOccupancyGrid, handleWorkerMessage } from "./index";

describe("Occupancy Grid 0.25 ม.", () => {
  it("ขนาดกริด = ขนาดร้าน / 0.25", () => {
    const grid = buildOccupancyGrid(cafeLayout());
    expect([grid.cols, grid.rows, grid.cellSize]).toEqual([32, 24, 0.25]);
    expect(grid.cells).toHaveLength(32 * 24);
  });

  it("ช่องที่วัตถุทับมีค่า BLOCKED ตรงตามขอบ (ขอบพอดีเส้นกริดไม่ล้นช่องข้างเคียง)", () => {
    const layout = { ...cafeLayout(), objects: [block("k", 0.5, 0.5, 2, 1.5)] };
    const grid = buildOccupancyGrid(layout);
    const at = (col: number, row: number) => grid.cells[row * grid.cols + col];
    expect(at(2, 2)).toBe(CELL_BLOCKED); // มุมซ้ายบน (0.5, 0.5)
    expect(at(9, 7)).toBe(CELL_BLOCKED); // มุมขวาล่าง (2.25–2.5, 1.75–2.0)
    expect(at(10, 7)).toBe(CELL_FREE); // x 2.5–2.75
    expect(at(9, 8)).toBe(CELL_FREE); // y 2.0–2.25
    expect(at(1, 2)).toBe(CELL_FREE);
    expect(grid.freeCount).toBe(32 * 24 - 8 * 6);
  });

  it("วัตถุที่ขอบไม่ลงกริดจะกินช่องที่ทับบางส่วนด้วย (conservative)", () => {
    const grid = buildOccupancyGrid({ ...cafeLayout(), objects: [block("c", 1.1, 1.1, 0.5, 0.5)] });
    const blocked = [...grid.cells].reduce((n, c) => n + c, 0);
    expect(blocked).toBe(9); // 1.0–1.75 ทั้งสองแกน = 3 × 3 ช่อง
  });

  it.each([
    ["south", 1.25, 1.2],
    ["north", 0, 1.0],
    ["west", 2, 1.2],
    ["east", 2, 1.2],
  ] as const)("ช่องทางเข้าผนัง %s ตำแหน่ง %s", (wall, position, width) => {
    const layout = { ...cafeLayout(), objects: [], entrance: { id: "e", wall, position, width } };
    const grid = buildOccupancyGrid(layout);
    const expected = Math.ceil((position + width) / 0.25) - Math.floor(position / 0.25);
    expect(grid.entranceCells).toHaveLength(expected);
    for (const index of grid.entranceCells) {
      const col = index % grid.cols;
      const row = Math.floor(index / grid.cols);
      if (wall === "south") expect(row).toBe(grid.rows - 1);
      if (wall === "north") expect(row).toBe(0);
      if (wall === "west") expect(col).toBe(0);
      if (wall === "east") expect(col).toBe(grid.cols - 1);
    }
  });

  it("ช่องทางเข้าที่มีของวางทับไม่นับ, ไม่มีทางเข้า → ไม่มีช่องทางเข้า", () => {
    const blocked = { ...cafeLayout(), objects: [block("b", 1.25, 5.5, 0.5, 0.5)] };
    expect(buildOccupancyGrid(blocked).entranceCells).toHaveLength(5 - 2);
    expect(buildOccupancyGrid({ ...cafeLayout(), entrance: null }).entranceCells).toEqual([]);
  });
});

describe("Worker runtime (postMessage protocol)", () => {
  const layout = cafeLayout();
  const validation = validateLayout(layout);

  it("PING → PONG", () => {
    expect(handleWorkerMessage({ type: "PING", requestId: 7 }).response).toEqual({ type: "PONG", requestId: 7 });
  });

  it("SYNC_LAYOUT ผังที่ผ่าน → STATUS READY พร้อมกริด และโอน buffer ได้", () => {
    const { response, transfer } = handleWorkerMessage({ type: "SYNC_LAYOUT", requestId: 1, payload: { layout, validation } });
    expect(response).toMatchObject({ type: "STATUS", requestId: 1, status: "READY", layoutRevision: validation.layoutRevision });
    if (response.type !== "STATUS") throw new Error("unexpected");
    expect([response.grid.cols, response.grid.rows]).toEqual([32, 24]);
    expect(transfer).toEqual([response.grid.cells.buffer]);
  });

  it("ผลตรวจไม่ตรงกับผัง → STALE_VALIDATION", () => {
    const moved = { ...layout, width: 9 };
    const { response } = handleWorkerMessage({ type: "SYNC_LAYOUT", requestId: 2, payload: { layout: moved, validation } });
    expect(response).toMatchObject({ type: "ERROR", code: "STALE_VALIDATION", requestId: 2 });
  });

  it("ผัง Blocked → BLOCKED (แม้ UI จะส่งผลตรวจปลอมว่า ready)", () => {
    const broken = withoutType(layout, "kitchen");
    const honest = validateLayout(broken);
    const forged = { ...honest, status: "ready" as const, issues: [] };
    for (const v of [honest, forged]) {
      expect(handleWorkerMessage({ type: "SYNC_LAYOUT", requestId: 3, payload: { layout: broken, validation: v } }).response).toMatchObject({
        type: "ERROR",
        code: "BLOCKED",
      });
    }
  });

  it.each([null, "x", { type: "NOPE", requestId: 4 }, { type: "SYNC_LAYOUT", requestId: 5, payload: { layout: {} } }])(
    "ข้อความผิดรูปแบบ %j → INVALID_MESSAGE",
    (data) => {
      const { response } = handleWorkerMessage(data);
      expect(response).toMatchObject({ type: "ERROR", code: "INVALID_MESSAGE" });
    },
  );
});
