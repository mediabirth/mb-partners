/**
 * コンソール情報再構造化 E2E — 読み取り専用（実データ非破壊・throwaway owner のみ・自動撤去）。
 *  A) サイドバー階層: 親子・折りたたみ・アクティブ連動・alias（suppliers→パートナー）・撤去項目の不在
 *  B) 支払統合: タブ2枚・旧URLリダイレクト・氏名主体表記・サプライヤー請求機能の同居
 *  C) ダッシュボード: 紹介ファネル常設・旧funnelリダイレクト・詳細分析子ページ（パンくず）
 *  D) パンくず（親>子）6ページ・モバイルドロワー親子・スクショ3枚
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = 'http://localhost:4599', PW = 'CcRs!2026xx', OWNER = 'cc-rs-owner@mb-system.internal'
const SHOT = '/private/tmp/claude-501/-Users-kmbrkthk/3c01494a-a62a-4e0d-b895-09f7cc0f5b0c/scratchpad'
let pass = 0, fail = 0; const ok = (c: boolean, n: string, d = '') => { c ? (pass++, console.log('  ✓', n)) : (fail++, console.log('  ✗', n, d)) }

async function cleanup() {
  const { data: l } = await admin.auth.admin.listUsers()
  const u = (l?.users || []).find((x: any) => x.email === OWNER)
  if (u) { await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id).catch(() => {}) }
}
await cleanup()
const c = await admin.auth.admin.createUser({ email: OWNER, password: PW, email_confirm: true, app_metadata: { role: 'owner' } })
await admin.from('profiles').upsert({ id: c.data!.user!.id, name: 'CC-RS運営', role: 'owner', email: OWNER, color: '#888' })

const b = await chromium.launch()
const errs: string[] = []
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(pg.url() + ': ' + e.message))
async function login(p: Page, email: string, path: string) {
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
  if (!(await p.locator('input[type="email"]').count())) return
  await p.locator('input[type="email"]').fill(email); await p.locator('input[type="password"]').fill(PW)
  await p.locator('button[type="submit"]').first().click(); await p.waitForTimeout(2800)
}
const nav = (sel: string) => pg.locator(`aside[data-cnav] ${sel}`)
const path = () => new URL(pg.url()).pathname + new URL(pg.url()).search

console.log('A) サイドバー階層')
await login(pg, OWNER, '/console')
await pg.waitForTimeout(1500)
// 撤去項目の不在・新ラベル
const asideText = await pg.locator('aside[data-cnav]').innerText()
ok(!asideText.includes('サプライヤー請求'), '旧「サプライヤー請求」項目なし')
ok(!/サプライヤー(?!請求)/.test(asideText.replace('サプライヤー請求', '')), '旧「サプライヤー」親なし', asideText)
ok(asideText.includes('支払') && !asideText.includes('支払管理'), '「支払」ラベル（旧・支払管理から改称）')
ok(asideText.includes('問い合わせ') && !asideText.match(/^メッセージ$/m), '「問い合わせ」親（旧・メッセージ単独なし）')
// 親クリック→代表子・子の表示・アクティブ連動
await nav('a:has-text("パートナー")').first().click(); await pg.waitForTimeout(1800)
ok(path() === '/console/partners', '親「パートナー」クリック→代表子（一覧）へ', path())
const asideOpen = await pg.locator('aside[data-cnav]').innerText()
for (const t of ['パートナー一覧', 'パートナー応募', '成長（紹介）', '再活性化']) ok(asideOpen.includes(t), `子「${t}」表示（現在地の親は展開）`)
ok((await nav('.cnav-active').count()) >= 2, '親子連動アクティブ（親＋子の2要素）', String(await nav('.cnav-active').count()))
// 子への遷移とアクティブ
await nav('a:has-text("成長（紹介）")').click(); await pg.waitForTimeout(1800)
ok(path() === '/console/growth', '子「成長（紹介）」へ遷移')
ok((await nav('a.cnav-active:has-text("成長（紹介）")').count()) === 1, '子アクティブ表示')
ok((await pg.locator('.eyebrow:has-text("パートナー")').count()) >= 1, 'パンくず: 成長（紹介）に親eyebrow')
// alias: サイドバーに無い詳細ページでも親がアクティブ
await pg.goto(BASE + '/console/suppliers', { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(1500)
ok((await nav('.cnav-active').first().innerText()).includes('パートナー'), 'alias: /console/suppliers でパートナー親アクティブ')
// 折りたたみ
await nav('button[aria-label*="パートナーを折りたたむ"]').click(); await pg.waitForTimeout(400)
ok(!(await pg.locator('aside[data-cnav]').innerText()).includes('パートナー応募'), '折りたたみで子が隠れる')
await nav('button[aria-label*="パートナーを展開"]').click(); await pg.waitForTimeout(400)
// 問い合わせ親子
await nav('a:has-text("問い合わせ")').first().click(); await pg.waitForTimeout(1800)
ok(path() === '/console/inquiries', '親「問い合わせ」→フォーム問い合わせ')
const aside2 = await pg.locator('aside[data-cnav]').innerText()
ok(aside2.includes('フォーム問い合わせ') && aside2.includes('LINEメッセージ'), '問い合わせ配下2子')
ok((await pg.locator('h1:has-text("フォーム問い合わせ")').count()) === 1, 'h1=フォーム問い合わせ（明確化）')
await nav('a:has-text("LINEメッセージ")').click(); await pg.waitForTimeout(2000)
ok(path() === '/console/messages', 'LINEメッセージへ遷移')
ok((await pg.locator('h1:has-text("LINEメッセージ")').count()) === 1, 'h1=LINEメッセージ')

console.log('B) 支払統合')
await pg.goto(BASE + '/console/payouts', { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(2500)
ok((await pg.locator('h1:has-text("支払")').count()) === 1, 'h1=支払')
ok((await pg.locator('button:has-text("パートナーへの支払")').count()) === 1 && (await pg.locator('button:has-text("サプライヤーからの請求")').count()) === 1, 'タブ2枚')
// 氏名主体（コードだけの行が無い・rowsが有る場合）
const codeOnly = await pg.evaluate(`[...document.querySelectorAll('b')].filter(b=>/^[A-Z]{2}\\d{4}$/.test(b.textContent.trim())).length`) as number
ok(codeOnly === 0, '支払行にコード単独表記なし（氏名主体）', String(codeOnly))
await pg.screenshot({ path: SHOT + '/restructure-payouts-pay.png', fullPage: false })
await pg.locator('button:has-text("サプライヤーからの請求")').click(); await pg.waitForTimeout(2200)
ok(path() === '/console/payouts?tab=charges', 'タブ切替でURL ?tab=charges')
ok((await pg.locator('text=月次クローズ（金額の凍結）').count()) >= 1 || (await pg.locator('text=サプライヤーが未登録です').count()) >= 1, 'サプライヤー請求機能が同居（月次クローズ）')
await pg.screenshot({ path: SHOT + '/restructure-payouts-charges.png', fullPage: false })
// 旧URLリダイレクト（ブラウザ実測）
await pg.goto(BASE + '/console/supplier-charges', { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(1500)
ok(path() === '/console/payouts?tab=charges', '旧 /console/supplier-charges → 支払（請求タブ）', path())
ok((await pg.locator('text=月次クローズ（金額の凍結）').count()) >= 1 || (await pg.locator('text=サプライヤーが未登録です').count()) >= 1, 'リダイレクト着地で請求タブが開く')

console.log('C) ダッシュボード')
await pg.goto(BASE + '/console', { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(3500)
ok((await pg.locator('text=紹介ファネル').count()) >= 1, 'ファネル常設セクション')
ok((await pg.locator('text=ランディング閲覧').count()) >= 1, 'ファネル4段の実描画')
const topbarBtns = await pg.locator('.console-topbar').first().innerText()
ok(!topbarBtns.includes('ファネル') && !topbarBtns.includes('再活性化'), '旧トップバーボタン（ファネル/再活性化）撤去')
ok(topbarBtns.includes('詳細分析'), '詳細分析（子ページ）導線は維持')
await pg.screenshot({ path: SHOT + '/restructure-dashboard.png', fullPage: false })
await pg.goto(BASE + '/console/funnel', { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(1500)
ok(path() === '/console', '旧 /console/funnel → ダッシュボード')
await pg.goto(BASE + '/console/analytics', { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(2000)
ok((await pg.locator('.eyebrow:has-text("ダッシュボード")').count()) >= 1, 'パンくず: 詳細分析にダッシュボード親')
ok((await nav('.cnav-active').first().innerText()).includes('ダッシュボード'), 'alias: /console/analytics でダッシュボード親アクティブ')

console.log('D) 残りパンくず・モバイル・スクショ')
for (const [url, eyebrow, h1] of [['/console/applications', 'パートナー', 'パートナー応募'], ['/console/reactivate', 'パートナー', '再活性化'], ['/console/partners', 'パートナー', 'パートナー一覧']] as const) {
  await pg.goto(BASE + url, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(1500)
  ok((await pg.locator(`.eyebrow:has-text("${eyebrow}")`).count()) >= 1 && (await pg.locator(`h1:has-text("${h1}")`).count()) === 1, `パンくず: ${url} = ${eyebrow} > ${h1}`)
}
// サイドバースクショ（PC・ダッシュボード）
await pg.goto(BASE + '/console/partners', { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(1500)
await pg.locator('aside[data-cnav]').screenshot({ path: SHOT + '/restructure-sidebar.png' })
// モバイル: ドロワー内の親子
const mctx = await b.newContext({ viewport: { width: 375, height: 667 } })
const mp = await mctx.newPage(); mp.on('pageerror', e => errs.push(mp.url() + ': ' + e.message))
await login(mp, OWNER, '/console')
await mp.goto(BASE + '/console/partners', { waitUntil: 'domcontentloaded' }); await mp.waitForTimeout(1800)
await mp.locator('.cnav-burger').click(); await mp.waitForTimeout(600)
const mAside = await mp.locator('aside[data-cnav]').innerText()
ok(mAside.includes('パートナー一覧') && mAside.includes('再活性化'), 'モバイルドロワーで親子表示')
const childBox = await mp.locator('aside[data-cnav] a:has-text("成長（紹介）")').boundingBox()
ok(!!childBox && childBox.height >= 36 && childBox.x >= 0, 'モバイル子項目タップ領域36px+', JSON.stringify(childBox))
await mp.locator('aside[data-cnav] a:has-text("成長（紹介）")').click(); await mp.waitForTimeout(1800)
ok(new URL(mp.url()).pathname === '/console/growth', 'モバイル: ドロワー子から遷移')
ok(await mp.evaluate('document.documentElement.scrollWidth <= 375') as boolean, 'モバイル375px 横溢れなし')

ok(errs.length === 0, 'page errors []', errs.join(' | ').slice(0, 300))
await b.close()
await cleanup()
console.log(`\n== console-restructure E2E: pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
