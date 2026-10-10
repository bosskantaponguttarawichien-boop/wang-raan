// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { cafeLayout, withoutType } from "@/test/fixtures/layouts";
import { validateLayout } from "@/core/validation";
import { ApiError, createApiClient, type LayoutSummaryDto } from "./api-client";
import {
  createQueryClient,
  layoutKeys,
  useDeleteLayoutMutation,
  useLayoutsQuery,
  useLoadLayout,
  useSaveLayoutMutation,
  useShareMutation,
} from "./layout-queries";

type Route = (req: { method: string; path: string; body: unknown }) => Response | Promise<Response>;

/** BFF จำลองด้วย fetch ที่ inject ได้ */
function fakeBff(route: Route) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { method: init?.method ?? "GET", path: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    return route(call);
  }) as typeof fetch;
  return { calls, client: createApiClient(fetchImpl) };
}

function setup() {
  const queryClient = createQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return { queryClient, wrapper };
}

const summary = (id: string, width = 8): LayoutSummaryDto => ({ id, width, depth: 6, objectCount: 7, status: "ready", updatedAt: "2026-10-10T01:00:00.000Z" });
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe("api-client", () => {
  it("แปลง error ของ BFF เป็น ApiError ภาษาไทย; เครือข่ายล่ม → NETWORK_ERROR", async () => {
    const { client } = fakeBff(() => Response.json({ error: { code: "UNAUTHORIZED", message: "กรุณาเข้าสู่ระบบก่อน" } }, { status: 401 }));
    await expect(client.listLayouts()).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED", message: "กรุณาเข้าสู่ระบบก่อน" });
    const noBody = createApiClient((async () => new Response("oops", { status: 429 })) as typeof fetch);
    await expect(noBody.listLayouts()).rejects.toMatchObject({ code: "HTTP_429", message: "ส่งคำขอถี่เกินไป กรุณารอสักครู่" });
    const odd = createApiClient((async () => new Response(null, { status: 418 })) as typeof fetch);
    await expect(odd.listLayouts()).rejects.toMatchObject({ message: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" });
    const down = createApiClient((async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch);
    await expect(down.getLayout("x")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("saveLayout: POST ผังใหม่ / PUT ผังเดิม / สลับเมื่อเดาผิด (409 → PUT, 404 → POST)", async () => {
    const layout = cafeLayout();
    const stored = { layout, validation: validateLayout(layout), createdAt: "a", updatedAt: "b" };
    const { calls, client } = fakeBff(({ method }) => (method === "POST" ? new Response(JSON.stringify({ error: { code: "LAYOUT_EXISTS" } }), { status: 409 }) : Response.json(stored)));
    await client.saveLayout(layout, false);
    expect(calls.map((c) => c.method)).toEqual(["POST", "PUT"]);
    expect(calls[1]!.path).toBe(`/api/layouts/${layout.id}`);

    const second = fakeBff(({ method }) => (method === "PUT" ? new Response(null, { status: 404 }) : Response.json(stored, { status: 201 })));
    await second.client.saveLayout(layout, true);
    expect(second.calls.map((c) => c.method)).toEqual(["PUT", "POST"]);

    const blocked = fakeBff(() => Response.json({ error: { code: "LAYOUT_BLOCKED", message: "ผังยังไม่ผ่านกฎจำเป็น" } }, { status: 422 }));
    await expect(blocked.client.saveLayout(layout, false)).rejects.toBeInstanceOf(ApiError);
    expect(blocked.calls).toHaveLength(1);
  });
});

describe("React Query hooks (feat-033 gate: Loading/Error แม่นยำ)", () => {
  it("useLayoutsQuery: pending → success; ปิดไว้ (ยังไม่ล็อกอิน) ไม่ยิง request", async () => {
    const gate = deferred<Response>();
    const { calls, client } = fakeBff(() => gate.promise);
    const { wrapper } = setup();
    const disabled = renderHook(() => useLayoutsQuery(false, client), { wrapper });
    expect(disabled.result.current.fetchStatus).toBe("idle");
    expect(calls).toHaveLength(0);

    const { result } = renderHook(() => useLayoutsQuery(true, client), { wrapper });
    expect(result.current.isPending).toBe(true);
    gate.resolve(Response.json({ layouts: [summary("a")] }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([summary("a")]);
  });

  it("401 → error ทันทีไม่ลองซ้ำ", async () => {
    const { calls, client } = fakeBff(() => Response.json({ error: { code: "UNAUTHORIZED", message: "กรุณาเข้าสู่ระบบก่อน" } }, { status: 401 }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useLayoutsQuery(true, client), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 401 });
    expect(calls).toHaveLength(1);
  });

  it("บันทึก: Optimistic ใส่รายการทันที → สำเร็จแล้ว refetch; detail ถูกแคช", async () => {
    const layout = cafeLayout();
    const stored = { layout, validation: validateLayout(layout), createdAt: "a", updatedAt: "2026-10-10T02:00:00.000Z" };
    const gate = deferred<Response>();
    let listed: LayoutSummaryDto[] = [summary("old")];
    const { calls, client } = fakeBff(({ method }) => (method === "GET" ? Response.json({ layouts: listed }) : gate.promise));
    const { wrapper, queryClient } = setup();
    const list = renderHook(() => useLayoutsQuery(true, client), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));

    const save = renderHook(() => useSaveLayoutMutation(client), { wrapper });
    act(() => save.result.current.mutate(layout));
    await waitFor(() => expect(list.result.current.data?.map((l) => l.id)).toEqual([layout.id, "old"]));
    expect(save.result.current.isPending).toBe(true);
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/api/layouts" });

    listed = [summary(layout.id), summary("old")];
    gate.resolve(Response.json(stored, { status: 201 }));
    await waitFor(() => expect(save.result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(layoutKeys.detail(layout.id))).toEqual(stored);
    await waitFor(() => expect(calls.filter((c) => c.method === "GET")).toHaveLength(2));

    // ครั้งที่สอง: รู้แล้วว่ามีอยู่ → PUT
    act(() => save.result.current.mutate(layout));
    gate.resolve(Response.json(stored));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
  });

  it("บันทึกผัง Blocked: 422 → rollback รายการ + error ภาษาไทย", async () => {
    const blocked = withoutType(cafeLayout(), "counter");
    const { client } = fakeBff(({ method }) =>
      method === "GET"
        ? Response.json({ layouts: [summary("old")] })
        : Response.json({ error: { code: "LAYOUT_BLOCKED", message: "ผังยังไม่ผ่านกฎจำเป็น จึงบันทึกไม่ได้" } }, { status: 422 }),
    );
    const { wrapper, queryClient } = setup();
    const list = renderHook(() => useLayoutsQuery(true, client), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    const save = renderHook(() => useSaveLayoutMutation(client), { wrapper });
    act(() => save.result.current.mutate(blocked));
    await waitFor(() => expect(save.result.current.isError).toBe(true));
    expect(save.result.current.error).toMatchObject({ status: 422, code: "LAYOUT_BLOCKED" });
    expect(queryClient.getQueryData<LayoutSummaryDto[]>(layoutKeys.list())!.map((l) => l.id)).toEqual(["old"]);
  });

  it("ลบ: Optimistic เอาออกทันที; ล้มเหลว → คืนรายการเดิม", async () => {
    let fail = false;
    const { client } = fakeBff(({ method }) =>
      method === "GET" ? Response.json({ layouts: [summary("a"), summary("b")] }) : fail ? new Response(null, { status: 500 }) : new Response(null, { status: 204 }),
    );
    const { wrapper, queryClient } = setup();
    const list = renderHook(() => useLayoutsQuery(true, client), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    const remove = renderHook(() => useDeleteLayoutMutation(client), { wrapper });
    const ids = () => queryClient.getQueryData<LayoutSummaryDto[]>(layoutKeys.list())!.map((l) => l.id);

    fail = true;
    const spy = vi.spyOn(queryClient, "setQueryData");
    act(() => remove.result.current.mutate("a"));
    await waitFor(() => expect(remove.result.current.isError).toBe(true));
    expect(spy.mock.calls[0]![1]).toEqual([summary("b")]); // optimistic
    expect(ids()).toEqual(["a", "b"]); // rollback

    fail = false;
    act(() => remove.result.current.mutate("a"));
    await waitFor(() => expect(remove.result.current.isSuccess).toBe(true));
  });

  it("โหลดผังผ่านแคช และสร้างลิงก์แชร์", async () => {
    const layout = cafeLayout();
    const stored = { layout, validation: validateLayout(layout), createdAt: "a", updatedAt: "b" };
    const { calls, client } = fakeBff(({ path }) =>
      path === "/api/share" ? Response.json({ shareKey: "k", url: "http://x/share/k", createdAt: "c" }, { status: 201 }) : Response.json(stored),
    );
    const { wrapper } = setup();
    const load = renderHook(() => useLoadLayout(client), { wrapper });
    expect(await load.result.current(layout.id)).toEqual(stored);
    await load.result.current(layout.id); // ยังสด → ใช้แคช
    expect(calls.filter((c) => c.path.startsWith("/api/layouts/"))).toHaveLength(1);

    const share = renderHook(() => useShareMutation(client), { wrapper });
    act(() => share.result.current.mutate(layout.id));
    await waitFor(() => expect(share.result.current.data?.url).toBe("http://x/share/k"));
    expect(calls.at(-1)).toMatchObject({ method: "POST", body: { layoutId: layout.id } });
  });

  it("retry: 5xx ลองซ้ำ, 4xx ไม่ลอง", () => {
    const retry = createQueryClient().getDefaultOptions().queries!.retry as (n: number, e: unknown) => boolean;
    expect(retry(0, new ApiError(503, "X", "x"))).toBe(true);
    expect(retry(2, new ApiError(503, "X", "x"))).toBe(false);
    expect(retry(0, new ApiError(404, "X", "x"))).toBe(false);
  });
});
