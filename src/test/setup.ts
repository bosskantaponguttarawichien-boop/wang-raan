import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  return {
    ...actual,
    useSession: vi.fn(() => ({ data: null, status: "unauthenticated" })),
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
});

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: vi.fn(() => ({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    })),
    usePathname: vi.fn(() => "/playground"),
    useSearchParams: vi.fn(() => new URLSearchParams()),
  };
});
