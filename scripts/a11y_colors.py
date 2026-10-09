"""ปรับสีข้อความให้ผ่าน WCAG 2.1 AA (≥ 4.5:1) โดยคงเฉดสีเดิม (ลดความสว่างทีละน้อยใน HSL)"""
import colorsys


def _channel(c: float) -> float:
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def contrast(a: str, b: str) -> float:
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def darken_to(fg: str, bg: str, target: float = 4.6) -> str:
    """คืนสีที่เข้มขึ้นน้อยที่สุด (คง hue/saturation) ให้ contrast กับ bg ≥ target"""
    if contrast(fg, bg) >= target:
        return fg.lower()
    h = fg.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    hue, light, sat = colorsys.rgb_to_hls(r, g, b)
    while light > 0:
        light = max(0.0, light - 0.005)
        rr, gg, bb = colorsys.hls_to_rgb(hue, light, sat)
        candidate = "#%02x%02x%02x" % (round(rr * 255), round(gg * 255), round(bb * 255))
        if contrast(candidate, bg) >= target:
            return candidate
    return "#000000"


if __name__ == "__main__":
    for fg, bg in [("#6d7b8f", "#ffffff"), ("#97a3b4", "#ffffff"), ("#8a98ac", "#fafbfe"), ("#66758a", "#f8faff"),
                   ("#66758a", "#f3f6fa"), ("#c75049", "#ffffff"), ("#3b62f4", "#edf1ff"), ("#2e50da", "#edf1ff")]:
        print(fg, "on", bg, round(contrast(fg, bg), 2), "->", darken_to(fg, bg), round(contrast(darken_to(fg, bg), bg), 2))
