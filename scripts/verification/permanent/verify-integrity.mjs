/**
 * 恒久整合性ゲート。未認証境界と公開面を、実ユーザー・実案件・DB書込なしで検証する。
 * 認証済み3面は session-isolation.e2e.mjs がthrowawayのみで担う。
 */
import { chromium } from 'playwright'

const BASE_APP = process.env.BASE_APP || 'http://localhost:4599'
const BASE_CONSOLE = process.env.BASE_CONSOLE || BASE_APP
const R = { pass: 0, fail: 0 }
const pageErrors = []
const ok = (condition, name, detail = '') => {
  if (condition) { R.pass++; console.log(`  ✓ ${name}`) }
  else { R.fail++; console.log(`  ✗ ${name}${detail ? ` (${detail})` : ''}`) }
}

console.log('\n=== HTTP境界 ===')
for (const [url, label] of [
  [`${BASE_APP}/app`, 'partner'],
  [`${BASE_CONSOLE}/console`, 'console'],
  [`${BASE_APP}/vendor`, 'vendor'],
]) {
  const response = await fetch(url, { redirect: 'manual' })
  ok(response.status === 307, `${label} 未認証 → 307`, `got ${response.status}`)
}
const webhook = await fetch(`${BASE_APP}/api/line/webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
})
ok(webhook.status === 401, 'LINE webhook 無署名 → 401', `got ${webhook.status}`)

console.log('\n=== 公開面 ===')
const browser = await chromium.launch()
for (const path of ['/partners', '/join', '/legal/privacy', '/legal/terms']) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    serviceWorkers: 'block',
  })
  const page = await context.newPage()
  page.on('pageerror', error => pageErrors.push(`${path}: ${error.message}`))
  const response = await page.goto(`${BASE_APP}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.waitForTimeout(500)
  ok(response?.status() === 200, `${path}: 200`, `got ${response?.status()}`)
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    bodyLength: document.body.innerText.trim().length,
  }))
  ok(metrics.scrollWidth <= metrics.viewportWidth, `${path}: 375px水平オーバーフロー0`, JSON.stringify(metrics))
  ok(metrics.bodyLength > 40, `${path}: 実描画`, `bodyLength=${metrics.bodyLength}`)
  await context.close()
}
await browser.close()
ok(pageErrors.length === 0, 'page errors []', pageErrors.join(' | '))

console.log(`\nINTEGRITY: ${R.pass} passed / ${R.fail} failed`)
process.exit(R.fail ? 1 : 0)
