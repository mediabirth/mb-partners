import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'

// 新ブランドマーク（案3）の白バージョン（インディゴタイル/マスカブル用）
const WHITE_MARK = `
  <g stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" opacity="0.5">
    <line x1="24" y1="24" x2="24" y2="7"/><line x1="24" y1="24" x2="39" y2="14"/><line x1="24" y1="24" x2="37" y2="37"/><line x1="24" y1="24" x2="10" y2="37"/><line x1="24" y1="24" x2="8" y2="21"/>
  </g>
  <rect x="20.3" y="3.8" width="7.4" height="7.4" rx="1.9" fill="#ffffff"/>
  <circle cx="39" cy="14" r="3.9" fill="#ffffff" fill-opacity="0.82"/>
  <rect x="33.2" y="33.2" width="8" height="8" rx="2.3" fill="#ffffff" fill-opacity="0.82"/>
  <circle cx="10" cy="37" r="4.2" fill="#ffffff"/>
  <circle cx="8" cy="21" r="3.1" fill="#ffffff" fill-opacity="0.82"/>
  <rect x="18" y="18" width="12" height="12" rx="3.2" fill="#ffffff"/>`

// 角丸タイル（favicon/apple/PWA any 用）
const tileSVG = (rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5646E6"/><stop offset="1" stop-color="#4733E6"/></linearGradient></defs>
  <rect width="64" height="64" rx="${rx}" fill="url(#g)"/>
  <g transform="translate(10,10) scale(0.9167)">${WHITE_MARK}</g>
</svg>`

// マスカブル（フルブリード・セーフゾーン内）
const maskableSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5646E6"/><stop offset="1" stop-color="#4733E6"/></linearGradient></defs>
  <rect width="64" height="64" fill="url(#g)"/>
  <g transform="translate(17.6,17.6) scale(0.6)">${WHITE_MARK}</g>
</svg>`

const browser = await chromium.launch()
async function render(svg, size, out) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  const scaled = svg.replace('width="64" height="64"', `width="${size}" height="${size}"`)
  await page.setContent(`<body style="margin:0">${scaled}</body>`, { waitUntil: 'networkidle' })
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  writeFileSync(out, buf)
  console.log(out, size)
  await page.close()
  return buf
}

// 角丸半径はサイズに比例（64基準 rx15）
const tile = (size) => tileSVG(Math.round(15 * 64 / 64)) // rx は viewBox基準で15固定（scale時も相対維持）
const p16 = await render(tile(16), 16, 'public/favicon-16.png')
const p32 = await render(tile(32), 32, 'public/favicon-32.png')
await render(tile(180), 180, 'public/apple-icon-180.png')
await render(tile(180), 180, 'app/apple-icon.png')
await render(tile(192), 192, 'public/icon-192.png')
await render(tile(512), 512, 'public/icon-512.png')
await render(maskableSVG, 512, 'public/icon-maskable.png')

// favicon.ico（16+32 PNG を埋め込み）
function buildIco(entries) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4)
  const dir = []; let offset = 6 + entries.length * 16
  const bodies = []
  for (const e of entries) {
    const d = Buffer.alloc(16)
    d.writeUInt8(e.size >= 256 ? 0 : e.size, 0)
    d.writeUInt8(e.size >= 256 ? 0 : e.size, 1)
    d.writeUInt8(0, 2); d.writeUInt8(0, 3)
    d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6)
    d.writeUInt32LE(e.buf.length, 8); d.writeUInt32LE(offset, 12)
    dir.push(d); bodies.push(e.buf); offset += e.buf.length
  }
  return Buffer.concat([head, ...dir, ...bodies])
}
writeFileSync('app/favicon.ico', buildIco([{ size: 16, buf: p16 }, { size: 32, buf: p32 }]))
console.log('app/favicon.ico written')
await browser.close()
