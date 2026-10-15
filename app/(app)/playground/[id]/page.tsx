import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { createRemoteLayoutRepository } from "@/server/layout-repository";
import { PlaygroundWithIdClient } from "./playground-with-id-client";

export const metadata: Metadata = {
  title: "Playground — จัดผังร้าน",
  description: "ออกแบบและจำลองการสัญจรของลูกค้าในร้านอาหาร/คาเฟ่",
};

export default async function PlaygroundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  // ยังไม่ล็อกอิน (เช่น เปิดจากบุ๊กมาร์ก) → ไปล็อกอินแล้วกลับมาที่ผังนี้ ไม่ใช่ 404 ที่ทำให้คิดว่าผังหาย
  if (!session?.user?.id) {
    redirect(`/login?next=${encodeURIComponent(`/playground/${encodeURIComponent(id)}`)}`);
  }

  const repo = createRemoteLayoutRepository();
  const stored = await repo.get(session.user.id, id);

  if (!stored) {
    notFound();
  }

  return <PlaygroundWithIdClient layout={stored.layout} name={stored.name} />;
}
