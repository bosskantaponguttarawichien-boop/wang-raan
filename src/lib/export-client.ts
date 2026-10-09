/**
 * ส่งออกไฟล์ฝั่ง Browser (feat-025, feat-029): ดาวน์โหลด Blob และแปลง SVG → PNG ผ่าน <canvas>
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  // ให้เบราว์เซอร์เริ่มดาวน์โหลดก่อนปล่อย URL
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, type: string) {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}

/** วาด SVG ลง canvas ที่ความละเอียด `scale` เท่า (ค่าเริ่มต้น 2× ให้คมบนจอ Retina/พิมพ์) */
export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const size = /width="([\d.]+)" height="([\d.]+)"/.exec(svg);
  if (!size) throw new Error("SVG ไม่มีขนาด");
  const width = Math.round(Number(size[1]) * scale);
  const height = Math.round(Number(size[2]) * scale);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับ canvas");
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("แปลงเป็น PNG ไม่สำเร็จ"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
