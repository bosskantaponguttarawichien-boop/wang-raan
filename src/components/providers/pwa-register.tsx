"use client";

import * as React from "react";
import { startPwa } from "@/lib/pwa";

/** ลงทะเบียน Service Worker + ฟังเหตุการณ์ติดตั้งแอป — ใส่ไว้ที่ root layout ครั้งเดียว */
export function PwaRegister() {
  React.useEffect(() => startPwa(), []);
  return null;
}
