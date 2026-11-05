import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerThought, StaffThought } from "@/core/simulation/presentation-contract";
import { BADGE_ASPECT, badgeArtFor, drawThoughtBadgeArt, getThoughtBadgeTheme, thoughtBadgeSvg } from "./thought-badge-art";

const customer = (kind: CustomerThought["kind"], severity: CustomerThought["severity"] = "normal"): CustomerThought => ({ kind, waitSeconds: 0, severity });

describe("thought badge art", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps every status to one of the designed pins", () => {
    const cases: Array<[CustomerThought | StaffThought, string]> = [
      [customer("queue-wait"), "queue"],
      [customer("queue-critical", "critical"), "queue"],
      [customer("order-wait"), "order"],
      [{ kind: "taking-order" }, "order"],
      [customer("food-warning", "warning"), "food"],
      [{ kind: "serving" }, "food"],
      [customer("eating"), "eating"],
      [customer("bill-wait"), "bill"],
      [customer("leaving"), "leaving"],
      [{ kind: "cleaning" }, "cleaning"],
      [{ kind: "resting" }, "resting"],
    ];
    for (const [thought, art] of cases) expect(badgeArtFor(thought)).toBe(art);
  });

  it("keeps the staff break colour distinct from the leaving pin", () => {
    expect(getThoughtBadgeTheme({ kind: "resting" }).fill).not.toBe(getThoughtBadgeTheme(customer("leaving")).fill);
  });

  it("renders a round pin with its illustration as a single SVG", () => {
    const svg = thoughtBadgeSvg(customer("leaving"), 42);
    expect(svg).toMatch(/^<svg viewBox="0 0 100 112" width="42" height="47.04"/);
    expect(svg).toContain('data-badge-art="leaving"');
    // Pin outline: arc over the top of the head, then the short tip.
    expect(svg).toContain("A46 46 0 1 1");
    expect(svg).toContain(`fill="${getThoughtBadgeTheme(customer("leaving")).fill}"`);
    expect(svg).not.toContain("polygon(");
    expect(BADGE_ASPECT).toBeCloseTo(1.12, 2);
  });

  it("draws the same paths on canvas when Path2D is available", () => {
    vi.stubGlobal("Path2D", class { constructor(readonly d: string) {} });
    const fill = vi.fn();
    const stroke = vi.fn();
    const ctx = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), fill, stroke } as unknown as CanvasRenderingContext2D;

    drawThoughtBadgeArt(ctx, customer("bill-wait"), 100, 80, 22);

    expect(ctx.translate).toHaveBeenCalledWith(89, 80 - 112 * 0.22);
    expect(ctx.scale).toHaveBeenCalledWith(0.22, 0.22);
    // Pin fill + rim, then the card, stripe, chip and three coins.
    expect(fill.mock.calls.length).toBeGreaterThanOrEqual(13);
    expect(stroke).toHaveBeenCalled();
  });
});
