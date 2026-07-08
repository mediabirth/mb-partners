import { chromium } from 'playwright'
import { writeFileSync } from 'fs'

// 新ブランドマーク（案3・多様なつながり）— 左上ロゴ用（配色版）
const MARK = `<svg viewBox="0 0 48 48" fill="none" width="60" height="60">
  <g stroke="#4733E6" stroke-width="2.2" stroke-linecap="round" opacity="0.4">
    <line x1="24" y1="24" x2="24" y2="7"/><line x1="24" y1="24" x2="39" y2="14"/><line x1="24" y1="24" x2="37" y2="37"/><line x1="24" y1="24" x2="10" y2="37"/><line x1="24" y1="24" x2="8" y2="21"/>
  </g>
  <rect x="20.5" y="4" width="7" height="7" rx="1.8" fill="#4733E6"/>
  <circle cx="39" cy="14" r="3.6" fill="#8B5CF6"/>
  <rect x="33.5" y="33.5" width="7.5" height="7.5" rx="2.2" stroke="#4733E6" stroke-width="2.4"/>
  <circle cx="10" cy="37" r="4" fill="#4733E6"/>
  <circle cx="8" cy="21" r="2.8" stroke="#4733E6" stroke-width="2.4"/>
  <rect x="18.5" y="18.5" width="11" height="11" rx="3" fill="#4733E6"/>
</svg>`

// 右側の装飾星座（新ブランドの「多様な領域がつながる」を体現：四角＋丸・塗り＋線・多色）
const CONSTELLATION = `<svg viewBox="0 0 500 560" width="500" height="560">
  <g stroke="#5646E6" stroke-width="1.6" opacity="0.28" stroke-linecap="round">
    <line x1="250" y1="250" x2="250" y2="70"/>
    <line x1="250" y1="250" x2="420" y2="120"/>
    <line x1="420" y1="120" x2="470" y2="55"/>
    <line x1="250" y1="250" x2="410" y2="360"/>
    <line x1="250" y1="250" x2="90" y2="360"/>
    <line x1="250" y1="250" x2="55" y2="200"/>
    <line x1="250" y1="70" x2="120" y2="95"/>
    <line x1="410" y1="360" x2="452" y2="452"/>
  </g>
  <rect x="234" y="234" width="34" height="34" rx="9" fill="#5646E6"/>
  <rect x="234" y="52" width="30" height="30" rx="8" fill="#5646E6"/>
  <circle cx="420" cy="120" r="15" fill="#8B5CF6"/>
  <rect x="456" y="41" width="28" height="28" rx="9" fill="none" stroke="#5646E6" stroke-width="4"/>
  <circle cx="120" cy="95" r="12" fill="#e5497f"/>
  <rect x="393" y="343" width="34" height="34" rx="10" fill="none" stroke="#5646E6" stroke-width="4"/>
  <circle cx="90" cy="360" r="16" fill="#15917e"/>
  <circle cx="55" cy="200" r="11" fill="none" stroke="#5646E6" stroke-width="4"/>
  <circle cx="452" cy="452" r="14" fill="#f2971b"/>
</svg>`

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;font-family:'Hiragino Kaku Gothic ProN','Noto Sans JP',system-ui,sans-serif;
  background:
    radial-gradient(52% 46% at 88% 4%,#ece6ff 0%,rgba(236,230,255,0) 58%),
    radial-gradient(56% 52% at 96% 98%,#ffeede 0%,rgba(255,238,222,0) 60%),
    radial-gradient(44% 40% at 6% 96%,#efeaff 0%,rgba(239,234,255,0) 62%),
    linear-gradient(180deg,#fcfbff,#f6f4ff);
  position:relative}
.wrap{position:absolute;inset:0;padding:74px 74px}
.brand{display:flex;align-items:center;gap:14px}
.brand b{font-size:34px;font-weight:800;letter-spacing:-.02em;color:#1a1830}
.brand b span{color:#5646E6}
.h1{margin-top:60px;font-size:90px;font-weight:800;line-height:1.14;letter-spacing:-.045em;color:#12101f}
.grad{background:linear-gradient(96deg,#5646E6 8%,#8B5CF6 42%,#f2971b 96%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.sub{margin-top:30px;font-size:33px;font-weight:600;letter-spacing:-.01em;color:#54506e}
.cta{margin-top:44px;display:inline-flex;align-items:center;gap:12px;height:74px;padding:0 40px;border-radius:999px;
  background:linear-gradient(135deg,#5646E6,#6f5cf0);color:#fff;font-size:29px;font-weight:800;letter-spacing:.01em;
  box-shadow:0 18px 40px rgba(86,70,230,.32)}
.cta .arw{font-weight:700}
.url{position:absolute;right:74px;bottom:60px;font-size:31px;font-weight:800;letter-spacing:.01em;color:#9a95b0}
.const{position:absolute;right:36px;top:30px}
</style></head><body>
<div class="const">${CONSTELLATION}</div>
<div class="wrap">
  <div class="brand">${MARK}<b>MB<span> Partners</span></b></div>
  <div class="h1">「つながり」が、<br><span class="grad">資産</span>になる。</div>
  <div class="sub">ご紹介いただくだけ。あとは、私たちが。</div>
  <div class="cta">パートナーに応募する<span class="arw">→</span></div>
  <div class="url">mb-partners.app</div>
</div>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 })
await page.setContent(HTML, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } })
writeFileSync('public/og.png', buf)
writeFileSync('public/og-partners.png', buf)
console.log('og.png / og-partners.png written', buf.length)
await browser.close()
