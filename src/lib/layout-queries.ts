"use client";

/**
 * TanStack Query (React Query v5) hooks ของผังร้าน (feat-033, architecture.md §2 "TanStack Query Cache")
 * - รายการผังแคชไว้ 30 วินาที และ refetch เบื้องหลังเมื่อกลับมาที่หน้าต่าง
 * - บันทึก/ลบ เป็น Optimistic Update: แก้แคชรายการทันที แล้ว rollback ถ้า BFF ปฏิเสธ
 */
import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { StoreLayout } from "@/core/layout";
import { validateLayout } from "@/core/validation";
import { ApiError, api, type ApiClient, type LayoutSummaryDto, type ShareDto } from "./api-client";

export const layoutKeys = {
  all: ["layouts"] as const,
  list: () => [...layoutKeys.all, "list"] as const,
  detail: (id: string) => [...layoutKeys.all, "detail", id] as const,
  shares: (id: string) => [...layoutKeys.all, "shares", id] as const,
};

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // 401/404 ไม่ต้องลองซ้ำ; ปัญหาเครือข่าย/5xx ลองซ้ำ 2 ครั้ง
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

export function useLayoutsQuery(enabled: boolean, client: ApiClient = api) {
  return useQuery({ queryKey: layoutKeys.list(), queryFn: client.listLayouts, enabled });
}

function summaryOf(layout: StoreLayout, updatedAt: string): LayoutSummaryDto {
  return {
    id: layout.id,
    width: layout.width,
    depth: layout.depth,
    objectCount: layout.objects.length,
    // ผลตรวจฝั่ง Client สำหรับแสดงชั่วคราว — ค่าจริงมาจาก BFF หลังบันทึก
    status: validateLayout(layout).status,
    updatedAt,
  };
}

export function useSaveLayoutMutation(client: ApiClient = api) {
  const queryClient = useQueryClient();
  // onMutate ทำงานก่อน mutationFn และใส่รายการ optimistic ไปแล้ว → จำไว้ก่อนว่า server มีผังนี้หรือยัง
  const [knownBefore] = useState(() => new WeakMap<StoreLayout, boolean>());
  return useMutation({
    mutationFn: (layout: StoreLayout) => client.saveLayout(layout, knownBefore.get(layout) ?? false),
    onMutate: async (layout) => {
      await queryClient.cancelQueries({ queryKey: layoutKeys.list() });
      const previous = queryClient.getQueryData<LayoutSummaryDto[]>(layoutKeys.list());
      knownBefore.set(layout, previous?.some((l) => l.id === layout.id) ?? false);
      if (previous) {
        const optimistic = summaryOf(layout, new Date().toISOString());
        queryClient.setQueryData<LayoutSummaryDto[]>(layoutKeys.list(), [optimistic, ...previous.filter((l) => l.id !== layout.id)]);
      }
      return { previous };
    },
    onError: (_error, _layout, context) => {
      if (context?.previous) queryClient.setQueryData(layoutKeys.list(), context.previous);
    },
    onSuccess: (stored) => {
      queryClient.setQueryData(layoutKeys.detail(stored.layout.id), stored);
      // ผังเพิ่งมีใน Backend — โหลดรายการลิงก์ใหม่ (ถ้าเคยโหลดก่อนบันทึกเสร็จจะค้าง 404)
      void queryClient.invalidateQueries({ queryKey: layoutKeys.shares(stored.layout.id) });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: layoutKeys.list() }),
  });
}

export function useDeleteLayoutMutation(client: ApiClient = api) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.deleteLayout(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: layoutKeys.list() });
      const previous = queryClient.getQueryData<LayoutSummaryDto[]>(layoutKeys.list());
      if (previous) queryClient.setQueryData<LayoutSummaryDto[]>(layoutKeys.list(), previous.filter((l) => l.id !== id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(layoutKeys.list(), context.previous);
    },
    onSuccess: (_data, id) => queryClient.removeQueries({ queryKey: layoutKeys.detail(id) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: layoutKeys.list() }),
  });
}

/** โหลดผังเต็มผ่านแคช (ใช้ข้อมูลในแคชถ้ายังสด) */
export function useLoadLayout(client: ApiClient = api) {
  const queryClient = useQueryClient();
  return (id: string) => queryClient.fetchQuery({ queryKey: layoutKeys.detail(id), queryFn: () => client.getLayout(id) });
}

/** ลิงก์แชร์ของผัง (feat-040) — เปิดใช้เมื่อผังถูกบันทึกในบัญชีแล้ว */
export function useSharesQuery(layoutId: string, enabled: boolean, client: ApiClient = api) {
  return useQuery({ queryKey: layoutKeys.shares(layoutId), queryFn: () => client.listShares(layoutId), enabled });
}

export function useShareMutation(client: ApiClient = api) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ layoutId, expiresAt = null }: { layoutId: string; expiresAt?: string | null }) => client.createShare(layoutId, expiresAt),
    onSuccess: (share) => queryClient.invalidateQueries({ queryKey: layoutKeys.shares(share.layoutId) }),
  });
}

/** แทนลิงก์ในแคชรายการด้วยค่าล่าสุดจาก server */
function replaceShare(queryClient: ReturnType<typeof useQueryClient>, share: ShareDto) {
  queryClient.setQueryData<ShareDto[]>(layoutKeys.shares(share.layoutId), (list) => list?.map((s) => (s.shareKey === share.shareKey ? share : s)));
}

export function useUpdateShareMutation(client: ApiClient = api) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shareKey, expiresAt }: { shareKey: string; expiresAt: string | null }) => client.updateShare(shareKey, expiresAt),
    onSuccess: (share) => replaceShare(queryClient, share),
  });
}

export function useRevokeShareMutation(client: ApiClient = api) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (share: ShareDto) => client.revokeShare(share.shareKey),
    onSuccess: (_data, share) => replaceShare(queryClient, { ...share, status: "revoked", revokedAt: new Date().toISOString() }),
    onSettled: (_data, _error, share) => queryClient.invalidateQueries({ queryKey: layoutKeys.shares(share.layoutId) }),
  });
}
