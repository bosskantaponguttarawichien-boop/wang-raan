#!/usr/bin/env python3
"""
แปลง CSS ของ design-html/index.html ให้ใช้ได้ใน Next.js โดยไม่รั่วไปหน้าอื่น
- ทุก selector ถูกครอบด้วย `.landing` (wrapper ของหน้า Landing)
- :root / html / body → `.landing`;  .motion-ready X → `.landing.motion-ready X`
- url("assets/...") → url("/assets/...")
- ปรับ V1: ชั้นวาง (Shelf) ในภาพสเก็ตช์ → ครัว (SKILL.md กฎข้อ 4)
ใช้: python3 scripts/scope_landing_css.py > "app/(marketing)/landing.css"
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from a11y_colors import darken_to, luminance  # noqa: E402

# พื้นหลังจริงของข้อความแต่ละส่วน (ค่าเริ่มต้นพื้นขาว) — ใช้คำนวณ contrast ขั้นต่ำ
BACKGROUNDS = (
    (".view-label", "#f2f5fa"),
    (".measure", "#f7f9fc"),
    (".contact", "#fafbfe"),
    (".how-", "#f8faff"),
    (".soft-section", "#f8faff"),
    (".footer", "#ffffff"),
)


def background_of(prelude: str) -> str:
    return next((bg for token, bg in BACKGROUNDS if token in prelude), "#ffffff")
# ไอคอน/สัญลักษณ์ตกแต่ง (aria-hidden) และ placeholder ไม่ใช่ข้อความเนื้อหา — คงสีเดิม
A11Y_EXEMPT = (".tool", "placeholder", "summary:after", ".channel-symbol", ".hint i", ".mark")

ROOT = Path(__file__).resolve().parent.parent
html = (ROOT / "design-html/index.html").read_text(encoding="utf-8")
# prototype มี <style> หลายบล็อก — รวมทุกบล็อกตามลำดับ
css = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", html, flags=re.S))
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def split_top(text: str):
    """แยก statement ระดับบนสุด: คืน (prelude, body) โดย body คือเนื้อในวงเล็บปีกกา"""
    out, i, n = [], 0, len(text)
    while i < n:
        start = text.find("{", i)
        if start == -1:
            break
        prelude = text[i:start].strip()
        depth, j = 1, start + 1
        while depth:
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
            j += 1
        out.append((prelude, text[start + 1 : j - 1]))
        i = j
    return out


def split_selectors(prelude: str):
    parts, depth, cur = [], 0, ""
    for ch in prelude:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return [p.strip() for p in parts if p.strip()]


def scope(selector: str) -> str:
    if selector in (":root", "html", "body"):
        return ".landing"
    if selector.startswith(".motion-ready"):
        return ".landing" + selector
    return ".landing " + selector


def accessible(prelude: str, body: str) -> str:
    """WCAG 2.1 AA: เข้มสีข้อความ (color:) ที่ contrast < 4.5:1 ขึ้นเล็กน้อยโดยคงเฉดสี"""
    if any(token in prelude for token in A11Y_EXEMPT):
        return body

    def fix(match: re.Match) -> str:
        color = match.group(2)
        if luminance(color) > 0.6:  # ข้อความสีขาวบนพื้นเข้ม (เช่น .cta) ไม่ต้องปรับ
            return match.group(0)
        return match.group(1) + darken_to(color, background_of(prelude))

    return re.sub(r"((?:^|;)\s*color:)(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b", fix, body)


def rule(prelude: str, body: str) -> str:
    return ",".join(scope(s) for s in split_selectors(prelude)) + "{" + accessible(prelude, body.strip()) + "}"


chunks = []
for prelude, body in split_top(css):
    if prelude.startswith("@keyframes"):
        chunks.append(f"{prelude}{{{body.strip()}}}")
    elif prelude.startswith("@media"):
        inner = "".join(rule(p, b) for p, b in split_top(body))
        chunks.append(f"{prelude}{{{inner}}}")
    else:
        chunks.append(rule(prelude, body))

out = "\n".join(chunks)
out = out.replace('url("assets/', 'url("/assets/')
out = out.replace(".sketch-shelf{", ".sketch-kitchen{")
out = re.sub(
    r"(\.sketch-kitchen\{[^}]*?)background:repeating-linear-gradient\([^;}]*\)",
    r"\1background:radial-gradient(circle at 50% 30%,#b1c2e7 0 4px,transparent 4.5px),radial-gradient(circle at 50% 70%,#b1c2e7 0 4px,transparent 4.5px),#e9effa",
    out,
)

header = """/* =============================================================================
 * Landing Page styles — สร้างอัตโนมัติจาก design-html/index.html
 * โดย scripts/scope_landing_css.py (อย่าแก้ไฟล์นี้ด้วยมือ ให้แก้ prototype หรือสคริปต์)
 * ทุก selector อยู่ใต้ .landing จึงไม่รั่วไปหน้า Playground
 * ========================================================================== */
/* prototype ใช้ line-height ค่าเริ่มต้นของเบราว์เซอร์ (ไม่ใช่ 1.85 ของ globals) */
.landing{line-height:normal}
.landing :where(h1,h2,h3,h4){line-height:normal;overflow-wrap:normal}
/* html{scroll-behavior} ของ prototype ใช้เฉพาะเมื่อแสดงหน้า Landing */
html:has(.landing){scroll-behavior:smooth;scroll-padding-top:24px}
@media(prefers-reduced-motion:reduce){html:has(.landing){scroll-behavior:auto}}
/* WCAG 2.1 AA: ข้อความรอง (--secondary) บนพื้นสีอ่อนต้อง ≥ 4.5:1 */
.landing .soft-section,.landing .contact-box{--secondary:#627084}
"""
sys.stdout.write(header + out + "\n")
