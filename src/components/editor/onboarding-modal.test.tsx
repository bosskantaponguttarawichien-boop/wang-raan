// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OnboardingModal } from "./onboarding-modal";

describe("OnboardingModal (feat-052)", () => {
  it("เปิด dialog แสดงฟิลด์กว้าง ลึก และการเลือกผนัง 4 ด้าน", () => {
    render(
      <OnboardingModal
        open={true}
        onOpenChange={vi.fn()}
        onStartCustom={vi.fn()}
        onUseTemplate={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "ร้านของคุณขนาดเท่าไร" })).toBeInTheDocument();
    expect(screen.getByLabelText("กว้าง (ม.)")).toHaveValue(8);
    expect(screen.getByLabelText("ลึก (ม.)")).toHaveValue(6);
    expect(screen.getByRole("button", { name: "ประตูด้านล่าง" })).toHaveAttribute("aria-pressed", "true");
  });

  it("เลือกผนังประตูและกดเริ่มจัดร้าน ส่งค่าที่ถูกต้องและปิด dialog", async () => {
    const user = userEvent.setup();
    const onStartCustom = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <OnboardingModal
        open={true}
        onOpenChange={onOpenChange}
        onStartCustom={onStartCustom}
        onUseTemplate={vi.fn()}
      />,
    );

    // เลือกประตูด้านบน (north)
    await user.click(screen.getByRole("button", { name: "ประตูด้านบน" }));
    expect(screen.getByRole("button", { name: "ประตูด้านบน" })).toHaveAttribute("aria-pressed", "true");

    // กดเริ่มจัดร้าน
    await user.click(screen.getByRole("button", { name: /เริ่มจัดร้าน/ }));

    expect(onStartCustom).toHaveBeenCalledWith({ width: 8, depth: 6, wall: "north" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("กดใช้ผังตัวอย่างแทน เรียก onUseTemplate และปิด dialog", async () => {
    const user = userEvent.setup();
    const onUseTemplate = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <OnboardingModal
        open={true}
        onOpenChange={onOpenChange}
        onStartCustom={vi.fn()}
        onUseTemplate={onUseTemplate}
      />,
    );

    await user.click(screen.getByRole("button", { name: /ใช้ผังตัวอย่างแทน/ }));
    expect(onUseTemplate).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
