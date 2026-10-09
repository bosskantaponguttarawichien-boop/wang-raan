/* eslint-disable @next/next/no-img-element -- ภาพประกอบใช้ <picture> art direction ตาม prototype (next/image ไม่รองรับ) */
import type { Metadata } from "next";
import Link from "next/link";
import "./landing.css";
import { LandingMotion } from "./landing-motion";

/**
 * Landing Page — React Server Component ที่ port จาก design-html/index.html
 * โครงสร้าง/คลาส/Responsive เหมือน prototype (CSS สร้างจาก prototype โดย scripts/scope_landing_css.py)
 * ปรับเนื้อหาตาม V1: ชั้นวาง (Shelf) → ครัว (Kitchen) — SKILL.md กฎข้อ 4, PRD C-01
 */

const DESCRIPTION = "ลองจัดภายในร้านของคุณ กำหนดพื้นที่ วางครัว เคาน์เตอร์ และชุดโต๊ะ แล้วค่อยจำลองลูกค้าเข้ามาใช้งาน";

export const metadata: Metadata = {
  title: { absolute: "วางร้าน — ลองจัดร้านในแบบของคุณ" },
  description: DESCRIPTION,
  openGraph: {
    title: "วางร้าน — ลองจัดร้านในแบบของคุณ",
    description: DESCRIPTION,
    locale: "th_TH",
    type: "website",
    images: [{ url: "/assets/store-planning-illustration.jpg", alt: "เจ้าของร้านวางแผนพื้นที่ภายในร้าน" }],
  },
};

const LOGO = "/assets/logos/logo-wangraan-clear-channel.svg";

function SampleFloor() {
  return (
    <svg className="floor" id="floor" viewBox="0 0 480 360" role="img" aria-label="ตัวอย่างผังร้านขนาด 8 คูณ 6 เมตร มีครัว เคาน์เตอร์ และชุดโต๊ะ">
      <defs>
        <pattern id="small-grid" width="15" height="15" patternUnits="userSpaceOnUse">
          <path d="M15 0H0V15" fill="none" stroke="#e8edf5" strokeWidth=".7" />
        </pattern>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <rect width="60" height="60" fill="url(#small-grid)" />
          <path d="M60 0H0V60" fill="none" stroke="#dde5ef" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="480" height="360" fill="#fff" />
      <rect width="480" height="360" fill="url(#grid)" />
      <path d="M0 285V0H480V360H0V335" fill="none" stroke="#b5c3d6" strokeWidth="5" strokeLinejoin="round" />
      <path d="M0 285h50M50 285a50 50 0 0 1-50 50" fill="none" stroke="#a9b9d0" strokeWidth="1.3" />
      <text className="door-label" x="25" y="351">
        เข้า
      </text>
      <g className="object" transform="translate(330 30)">
        <rect className="selection" x="-6" y="-6" width="132" height="72" rx="5" />
        <rect className="furniture" width="120" height="60" rx="4" fill="#e1e8f3" stroke="#aebed3" />
        <rect x="87" y="12" width="22" height="17" rx="2" fill="#bdcce0" />
        <text className="object-label" x="52" y="36">
          เคาน์เตอร์
        </text>
      </g>
      {/* V1: ครัว 2.0 × 1.5 ม. แทนชั้นวาง */}
      <g className="object" transform="translate(45 45)">
        <rect className="selection" x="-6" y="-6" width="132" height="102" rx="5" />
        <rect className="furniture" width="120" height="90" rx="4" fill="#e8edf5" stroke="#9bb0c9" />
        <circle cx="24" cy="22" r="7" fill="none" stroke="#c4d3e5" strokeWidth="2" />
        <circle cx="46" cy="22" r="7" fill="none" stroke="#c4d3e5" strokeWidth="2" />
        <text className="object-label" x="60" y="62">
          ครัว
        </text>
      </g>
      <g className="object selected" transform="translate(270 165)">
        <rect className="selection" x="-13" y="-13" width="101" height="101" rx="6" />
        <rect x="27" y="-8" width="21" height="8" rx="2" fill="#d0dcff" />
        <rect x="27" y="75" width="21" height="8" rx="2" fill="#d0dcff" />
        <rect x="-8" y="27" width="8" height="21" rx="2" fill="#d0dcff" />
        <rect x="75" y="27" width="8" height="21" rx="2" fill="#d0dcff" />
        <rect className="furniture" width="75" height="75" rx="7" fill="#edf1ff" stroke="#8da6ef" />
        <text className="object-label" x="37.5" y="43">
          โต๊ะ
        </text>
      </g>
      <g className="object" transform="translate(390 210)">
        <rect className="selection" x="-12" y="-12" width="84" height="84" rx="6" />
        <rect x="22" y="-8" width="16" height="8" rx="2" fill="#dce4f1" />
        <rect x="22" y="60" width="16" height="8" rx="2" fill="#dce4f1" />
        <rect className="furniture" width="60" height="60" rx="6" fill="#eff2f7" stroke="#b5c3d8" />
        <text className="object-label" x="30" y="35">
          โต๊ะ
        </text>
      </g>
      <g className="object" transform="translate(150 240)">
        <rect className="selection" x="-12" y="-12" width="84" height="84" rx="6" />
        <rect x="22" y="-8" width="16" height="8" rx="2" fill="#dce4f1" />
        <rect x="22" y="60" width="16" height="8" rx="2" fill="#dce4f1" />
        <rect className="furniture" width="60" height="60" rx="6" fill="#eff2f7" stroke="#b5c3d8" />
        <text className="object-label" x="30" y="35">
          โต๊ะ
        </text>
      </g>
    </svg>
  );
}

const FEATURES = [
  {
    title: "เห็นพื้นที่ทั้งร้าน",
    text: "เริ่มจากขนาดร้านของคุณ แล้วดูว่าของแต่ละชิ้นใช้พื้นที่เท่าไร เหลือทางเดินตรงไหนบ้าง",
    icon: <path d="M3 12h9V3M12 12h9M12 12v9" />,
    frame: <rect x="3" y="3" width="18" height="18" rx="2" />,
  },
  {
    title: "ลองจัดได้หลายแบบ",
    text: "ขยับชุดโต๊ะ ครัว และเคาน์เตอร์บนผัง เพื่อหาตำแหน่งที่เหมาะกับการใช้งานของร้าน",
    icon: <path d="M12 2v4m-3-1 3-3 3 3M12 22v-4m-3 1 3 3 3-3M2 12h4m-1-3-3 3 3 3M22 12h-4m1-3 3 3-3 3" />,
    frame: <rect x="8" y="8" width="8" height="8" rx="2" />,
  },
  {
    title: "ต่อยอดด้วยการจำลอง",
    text: "เมื่อจัดร้านเสร็จ ค่อยลองให้ลูกค้าเข้ามาใช้งาน เพื่อดูภาพรวมการเดินและการรอคิว",
    icon: <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6M21 20v-2a6 6 0 0 0-3-5" />,
    frame: <circle cx="9" cy="7" r="3" />,
  },
];

const STEPS = [
  { art: "measure-art", title: "กำหนดพื้นที่ร้าน", text: "ใส่ความกว้างและความลึกของร้าน เพื่อสร้างผังตามขนาดพื้นที่" },
  { art: "arrange-art", title: "จัดภายในให้ลงตัว", text: "วางครัว เคาน์เตอร์ และชุดโต๊ะ ลองย้ายตำแหน่ง และจัดทางเดินให้เหมาะกับร้านของคุณ" },
  { art: "customer-art", title: "ลองให้ลูกค้าใช้งาน", text: "กำหนดจำนวนลูกค้าและพฤติกรรม แล้วดูว่าผังที่จัดไว้รองรับการใช้งานอย่างไร" },
];

const FAQ = [
  { q: "ต้องมีแบบร้านอยู่แล้วไหม?", a: "ไม่จำเป็น เริ่มจากรู้ขนาดความกว้างและความลึกของพื้นที่ แล้วค่อยวางของลงบนผัง" },
  { q: "เหมาะกับร้านแบบไหน?", a: "ร้านอาหารหรือคาเฟ่ที่อยากลองจัดครัว เคาน์เตอร์ และชุดโต๊ะให้เข้ากับพื้นที่" },
  { q: "ต้องเริ่มจำลองลูกค้าทันทีไหม?", a: "เริ่มจากจัดภายในร้านให้ลงตัวก่อน การจำลองลูกค้าเป็นขั้นถัดไปเมื่อคุณพร้อมลองดูการใช้งาน" },
  {
    q: "ผลจำลองบอกได้ไหมว่าร้านปลอดภัย?",
    a: "ผลจำลองช่วยดูการใช้งานภายใต้เงื่อนไขที่กำหนด การประเมินและรับรองความปลอดภัยต้องให้ผู้เชี่ยวชาญตรวจสอบเพิ่มเติม",
  },
];

export default function HomePage() {
  return (
    <div className="landing">
      <LandingMotion />
      <header>
        <a className="brand" href="#home" aria-label="วางร้าน หน้าแรก">
          <img className="brand-logo" src={LOGO} alt="" aria-hidden="true" />
          วางร้าน
        </a>
        <nav className="navigation" aria-label="เมนูหลัก">
          <a href="#features">จุดเด่น</a>
          <a href="#how-it-works">วิธีใช้งาน</a>
          <a href="#faq">คำถามที่พบบ่อย</a>
          <a href="#contact">ติดต่อเรา</a>
        </nav>
        <Link className="cta header-cta" href="/playground">
          เริ่มจัดร้าน
        </Link>
      </header>
      <main>
        <section className="hero" id="home" aria-labelledby="heroTitle">
          <section className="intro">
            <div className="intro-copy">
              <p className="eyebrow">เริ่มจากพื้นที่ร้านของคุณ</p>
              <h1 id="heroTitle">
                ลองจัดร้าน
                <br />
                <span>ในแบบของคุณ</span>
              </h1>
              <p className="description">
                วางครัว เคาน์เตอร์ และชุดโต๊ะให้ลงตัว
                <br />
                แล้วค่อยลองจำลองลูกค้าเข้ามาใช้งาน
              </p>
              <Link className="cta" href="/playground">
                เริ่มจัดร้าน
              </Link>
              <p className="later">เริ่มด้วยการกำหนดขนาดพื้นที่ร้าน</p>
              <div className="steps" role="group" aria-label="จัดร้านก่อน แล้วจึงจำลองลูกค้า">
                <span className="active">
                  <b>01</b> จัดร้าน
                </span>
                <span className="separator" aria-hidden="true" />
                <span>
                  <b>02</b> ลองเปิดร้าน
                </span>
              </div>
            </div>
            <picture className="hero-art">
              <source media="(max-width:1100px)" srcSet="/assets/store-planning-illustration.jpg" />
              <img
                src="/assets/hero-store-surround.png"
                width={1983}
                height={793}
                alt="เจ้าของร้านวางแผนพื้นที่และจัดโต๊ะกับเคาน์เตอร์ภายในร้าน"
                decoding="async"
              />
            </picture>
          </section>
          <section className="visual" aria-label="ตัวอย่างการจัดภายในร้าน">
            <div className="editor">
              <div className="editor-head">
                <span className="editor-title">
                  <i aria-hidden="true" />
                  พื้นที่ร้านของคุณ
                </span>
                <span className="room-size">8 × 6 เมตร</span>
              </div>
              <div className="workspace">
                <div className="tools" aria-hidden="true">
                  <span className="tool active">
                    <svg viewBox="0 0 24 24">
                      <path d="M5 3v16l5-5 4 7 3-2-4-7 7-1z" />
                    </svg>
                  </span>
                  <span className="tool">
                    <svg viewBox="0 0 24 24">
                      <rect x="5" y="6" width="14" height="12" rx="3" />
                      <path d="M8 3v3m8-3v3M8 18v3m8-3v3" />
                    </svg>
                  </span>
                  <span className="tool">
                    <svg viewBox="0 0 24 24">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <circle cx="8.5" cy="10" r="2" />
                      <circle cx="15.5" cy="10" r="2" />
                      <path d="M6 15h12" />
                    </svg>
                  </span>
                  <span className="tool">
                    <svg viewBox="0 0 24 24">
                      <rect x="3" y="7" width="18" height="13" rx="2" />
                      <path d="M15 7V4h5v3M3 12h18" />
                    </svg>
                  </span>
                </div>
                <div className="floor-wrap">
                  <div className="measure" id="measure">
                    8 เมตร
                  </div>
                  <SampleFloor />
                </div>
              </div>
              <div className="editor-foot">
                <span className="hint">
                  <i aria-hidden="true" />
                  ตัวอย่างการจัดภายในร้าน
                </span>
                <span className="view-label">มุมมองด้านบน</span>
              </div>
            </div>
            <p className="visual-caption">เห็นภาพร้าน ก่อนเริ่มจัดของจริง</p>
            <span className="preview-detail furniture-detail" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="3" />
                <path d="M9 3h6M9 21h6M3 9v6M21 9v6" />
              </svg>
              ลองวางโต๊ะ
            </span>
            <span className="preview-detail flow-detail" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 19c0-7 13-2 13-10V4M13 8l4-4 4 4" strokeDasharray="3 3" />
              </svg>
              เหลือพื้นที่ให้เดิน
            </span>
          </section>
        </section>

        <section className="page-section" id="features" aria-labelledby="featuresTitle">
          <div className="section-heading">
            <p className="section-kicker">วางแผนก่อนลงมือ</p>
            <h2 id="featuresTitle">จัดร้านให้ลงตัว เริ่มจากเห็นภาพ</h2>
            <p>ลองวางไอเดียของคุณบนผัง ก่อนตัดสินใจจัดพื้นที่จริง</p>
          </div>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <article className="feature-card" key={f.title}>
                <div className="feature-symbol" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    {f.frame}
                    {f.icon}
                  </svg>
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="soft-section">
          <section className="page-section" id="how-it-works" aria-labelledby="howTitle">
            <div className="section-heading">
              <p className="section-kicker">เริ่มทีละขั้น</p>
              <h2 id="howTitle">จัดร้านก่อน แล้วค่อยลองเปิด</h2>
            </div>
            <div className="how-grid">
              {STEPS.map((step, i) => (
                <article className="how-step" key={step.title}>
                  <div className="how-number">{String(i + 1).padStart(2, "0")}</div>
                  <div className={`how-art ${step.art}`} aria-hidden="true" />
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              ))}
            </div>
          </section>
        </div>

        <section className="page-section faq-section" id="faq" aria-labelledby="faqTitle">
          <div className="section-heading">
            <span className="faq-emblem" aria-hidden="true">
              ?
            </span>
            <p className="section-kicker">ก่อนเริ่มจัดร้าน</p>
            <h2 id="faqTitle">คำถามที่พบบ่อย</h2>
          </div>
          <div className="faq-list">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="page-section contact-section" id="contact" aria-labelledby="contactTitle">
          <div className="contact-box">
            <div className="contact-copy">
              <p className="section-kicker">ติดต่อวางร้าน</p>
              <h2 id="contactTitle">มาคุยเรื่องร้านของคุณ</h2>
              <p>สอบถามการใช้งาน หรือบอกเราว่าอยากให้วางร้านช่วยคุณเรื่องอะไร</p>
              <div className="contact-channels">
                <div className="contact-channel">
                  <span className="channel-symbol" aria-hidden="true">
                    @
                  </span>
                  <div>
                    <strong>อีเมล</strong>
                    <small id="contactEmail">รอระบุอีเมลติดต่อ</small>
                  </div>
                </div>
                <div className="contact-channel">
                  <span className="channel-symbol" aria-hidden="true">
                    L
                  </span>
                  <div>
                    <strong>LINE</strong>
                    <small id="contactLine">รอระบุบัญชี LINE</small>
                  </div>
                </div>
              </div>
              <div className="contact-sketch" aria-hidden="true">
                <span className="sketch-kitchen" />
                <span className="sketch-counter" />
                <span className="sketch-table" />
                <span className="sketch-path" />
                <span className="sketch-message">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
            {/* ฟอร์มยังไม่เปิดใช้ (เชื่อม API ใน feat-032) — คงสถานะ disabled ตาม prototype */}
            <form className="contact-form" aria-label="แบบฟอร์มติดต่อ">
              <fieldset disabled>
                <label htmlFor="contactName">
                  ชื่อ
                  <input id="contactName" type="text" placeholder="ชื่อของคุณ" autoComplete="name" />
                </label>
                <label htmlFor="contactReply">
                  อีเมล
                  <input id="contactReply" type="email" placeholder="name@example.com" autoComplete="email" />
                </label>
                <label htmlFor="contactMessage">
                  ข้อความ
                  <textarea id="contactMessage" rows={3} placeholder="อยากให้เราช่วยเรื่องอะไร" />
                </label>
                <button className="cta" type="button" disabled>
                  ส่งข้อความ (เร็ว ๆ นี้)
                </button>
              </fieldset>
            </form>
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-top">
            <div className="footer-brand">
              <a className="brand" href="#home">
                <img className="brand-logo brand-logo--footer" src={LOGO} alt="" aria-hidden="true" />
                วางร้าน
              </a>
              <p>วางแผนพื้นที่ร้าน ก่อนลงมือจัดจริง</p>
            </div>
            <nav className="footer-links" aria-label="เมนูท้ายเว็บไซต์">
              <a href="#features">เกี่ยวกับวางร้าน</a>
              <a href="#how-it-works">วิธีใช้งาน</a>
              <a href="#faq">คำถามที่พบบ่อย</a>
              <a href="#contact">ติดต่อเรา</a>
            </nav>
          </div>
          <div className="footer-bottom">
            <span>© 2026 วางร้าน</span>
            <span>จัดร้านก่อน แล้วค่อยลองเปิด</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
