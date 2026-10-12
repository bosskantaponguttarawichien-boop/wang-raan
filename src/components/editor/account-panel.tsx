"use client";

/**
 * บัญชีของฉัน — โปรไฟล์จาก Backend (`/api/me`), ดาวน์โหลดข้อมูล และลบบัญชี (PDPA)
 * Guest เชื่อมบัญชี GitHub ได้: ผังและลิงก์แชร์ย้ายตามไปตอนล็อกอิน (server/account-sync.ts)
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { getProviders, signIn, signOut } from "next-auth/react";
import { Button, ErrorText, LoadError } from "@/components/ui";
import { api, apiErrorText, type ApiClient, type UserDto } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

const PROVIDER_LABEL: Record<UserDto["provider"], string> = {
  guest: "ผู้ใช้ทั่วไป (Guest)",
  github: "GitHub",
  google: "Google",
  line: "LINE",
};

/** GitHub เปิดใช้เมื่อ server ตั้ง AUTH_GITHUB_ID / AUTH_GITHUB_SECRET */
export function useGitHubAvailable() {
  const providers = useQuery({ queryKey: ["auth-providers"], queryFn: () => getProviders(), staleTime: Infinity });
  return Boolean(providers.data?.github);
}

function downloadJson(data: { exportedAt: string }) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `wang-raan-account-${data.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AccountPanel({ client = api }: { client?: ApiClient }) {
  const me = useQuery({ queryKey: ["me"], queryFn: client.getMe });
  const github = useGitHubAvailable();
  const exportData = useMutation({ mutationFn: client.exportMe, onSuccess: downloadJson });
  const remove = useMutation({
    mutationFn: client.deleteMe,
    onSuccess: () => signOut({ redirectTo: "/playground" }),
  });

  const confirmDelete = () => {
    if (window.confirm("ลบบัญชีและข้อมูลทั้งหมดถาวร? ผังที่บันทึกไว้และลิงก์แชร์ทุกอันจะหายและกู้คืนไม่ได้")) remove.mutate();
  };

  return (
    <section aria-labelledby="account-heading" className="mt-4 border-t border-[#e4e9f2] pt-3" data-testid="account-panel">
      <h3 id="account-heading" className="m-0 mb-2 text-[13px] font-semibold">
        บัญชีของฉัน
      </h3>

      {me.isPending && (
        <p role="status" className="m-0 text-[12px] text-secondary">
          กำลังโหลดข้อมูลบัญชี…
        </p>
      )}
      {me.isError && <LoadError message={`โหลดข้อมูลบัญชีไม่สำเร็จ: ${apiErrorText(me.error)}`} onRetry={() => me.refetch()} />}
      {me.data && (
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12px] leading-[1.6]" data-testid="account-profile">
          <dt className="text-secondary">ประเภทบัญชี</dt>
          <dd className="m-0 text-ink">{PROVIDER_LABEL[me.data.provider]}</dd>
          {me.data.name && (
            <>
              <dt className="text-secondary">ชื่อ</dt>
              <dd className="m-0 truncate text-ink">{me.data.name}</dd>
            </>
          )}
          {me.data.email && (
            <>
              <dt className="text-secondary">อีเมล</dt>
              <dd className="m-0 truncate text-ink">{me.data.email}</dd>
            </>
          )}
          <dt className="text-secondary">สร้างเมื่อ</dt>
          <dd className="m-0 text-ink">{formatDateTime(me.data.createdAt)}</dd>
        </dl>
      )}

      {me.data?.provider === "guest" && github && (
        <div className="mt-3 rounded-[8px] bg-blue-soft px-3 py-2 text-[12px] leading-[1.6]">
          <p className="m-0 text-ink">บัญชีผู้ใช้ทั่วไปผูกกับเบราว์เซอร์นี้เท่านั้น — เชื่อม GitHub เพื่อใช้ได้ทุกเครื่อง ผังและลิงก์แชร์จะย้ายไปด้วย</p>
          <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={() => signIn("github", { redirectTo: "/playground" })}>
            เชื่อมบัญชี GitHub
          </Button>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" disabled={exportData.isPending} onClick={() => exportData.mutate()}>
          {exportData.isPending ? "กำลังเตรียมไฟล์…" : "ดาวน์โหลดข้อมูล"}
        </Button>
        <Button variant="danger" size="sm" disabled={remove.isPending || remove.isSuccess} onClick={confirmDelete}>
          {remove.isPending || remove.isSuccess ? "กำลังลบบัญชี…" : "ลบบัญชี"}
        </Button>
      </div>
      <div aria-live="polite" className="text-[12px] leading-[1.75]" data-testid="account-message">
        {exportData.isError && <ErrorText className="mt-2">ดาวน์โหลดไม่สำเร็จ: {apiErrorText(exportData.error)}</ErrorText>}
        {remove.isError && <ErrorText className="mt-2">ลบบัญชีไม่สำเร็จ: {apiErrorText(remove.error)}</ErrorText>}
      </div>
    </section>
  );
}
