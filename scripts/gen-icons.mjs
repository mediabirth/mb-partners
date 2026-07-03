import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
const svg = readFileSync('app/icon.svg', 'utf8')
const browser = await chromium.launch()
// content: 通常アイコン=SVGを92%サイズで中央配置(白背景) / maskable=64%(セーフゾーン)
async function render(size, scaleRatio, out) {
  const inner = Math.round(size * scaleRatio)
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(`<body style="margin:0;width:${size}px;height:${size}px;background:#fff;display:flex;align-items:center;justify-content:center">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('width="48" height="48"', `width="${inner}" height="${inner}"`)}</div></body>`)
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } })
  writeFileSync(out, buf)
  console.log(out, size)
  await page.close()
}
await render(512, 0.92, 'public/icon-512.png')
await render(192, 0.92, 'public/icon-192.png')
await render(512, 0.62, 'public/icon-maskable.png')
await render(180, 0.86, 'app/apple-icon.png')
await render(32, 0.94, 'public/favicon-32.png')
await render(16, 1.0, 'public/favicon-16.png')
await browser.close()
