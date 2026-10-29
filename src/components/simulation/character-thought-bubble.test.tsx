/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { CharacterThoughtBubble, getEmoteConfig } from "./character-thought-bubble";
import type { CustomerThought, StaffThought } from "@/core/simulation/presentation-contract";

describe("CharacterThoughtBubble & getEmoteConfig", () => {
  it("formats queue-wait, warning, and critical appropriately", () => {
    const normalQueue: CustomerThought = { kind: "queue-wait", waitSeconds: 120, severity: "normal" };
    const warnQueue: CustomerThought = { kind: "queue-warning", waitSeconds: 360, severity: "warning" };
    const critQueue: CustomerThought = { kind: "queue-critical", waitSeconds: 720, severity: "critical" };

    expect(getEmoteConfig(normalQueue)).toMatchObject({ emoji: "📱", badgeText: "2น.", severity: "normal" });
    expect(getEmoteConfig(warnQueue)).toMatchObject({ emoji: "⏳", badgeText: "6น.", severity: "warning" });
    expect(getEmoteConfig(critQueue)).toMatchObject({ emoji: "💢", badgeText: "12น.!", severity: "critical" });
  });

  it("formats food wait stages appropriately", () => {
    const normalFood: CustomerThought = { kind: "food-wait", waitSeconds: 180, severity: "normal" };
    const warnFood: CustomerThought = { kind: "food-warning", waitSeconds: 480, severity: "warning" };
    const critFood: CustomerThought = { kind: "food-critical", waitSeconds: 900, severity: "critical" };

    expect(getEmoteConfig(normalFood)).toMatchObject({ emoji: "🍽️", badgeText: "3น.", severity: "normal" });
    expect(getEmoteConfig(warnFood)).toMatchObject({ emoji: "⏳", badgeText: "8น.", severity: "warning" });
    expect(getEmoteConfig(critFood)).toMatchObject({ emoji: "😤", badgeText: "15น.!", severity: "critical" });
  });

  it("formats eating and bill-wait thoughts", () => {
    const eating: CustomerThought = { kind: "eating", waitSeconds: 60, severity: "normal" };
    const bill: CustomerThought = { kind: "bill-wait", waitSeconds: 600, severity: "normal" };

    expect(getEmoteConfig(eating)).toMatchObject({ emoji: "😋", severity: "normal" });
    expect(getEmoteConfig(bill)).toMatchObject({ emoji: "💳", severity: "normal" });
  });

  it("formats staff tasks appropriately", () => {
    const order: StaffThought = { kind: "taking-order" };
    const serve: StaffThought = { kind: "serving" };
    const clean: StaffThought = { kind: "cleaning" };

    expect(getEmoteConfig(order)).toMatchObject({ emoji: "📝" });
    expect(getEmoteConfig(serve)).toMatchObject({ emoji: "🍲" });
    expect(getEmoteConfig(clean)).toMatchObject({ emoji: "🧹" });
  });

  it("renders bubble with accessible role and displays tooltip on hover", () => {
    const thought: CustomerThought = { kind: "food-critical", waitSeconds: 900, severity: "critical" };
    render(<CharacterThoughtBubble thought={thought} />);

    const bubble = screen.getByRole("status");
    expect(bubble).toBeDefined();
    expect(bubble.getAttribute("aria-label")).toContain("รออาหารนานมาก");

    // Tooltip appears on mouse enter
    fireEvent.mouseEnter(bubble);
    expect(screen.getByRole("tooltip")).toBeDefined();
    expect(screen.getByRole("tooltip").textContent).toContain("รออาหารนานมาก (15 นาที)");

    // Tooltip disappears on mouse leave
    fireEvent.mouseLeave(bubble);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
