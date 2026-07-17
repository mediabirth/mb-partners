/**
 * サプライヤー認証導線修理 E2E — 残置ゼロ（throwaway supplier/referral/owner・自動撤去）。
 *  1) ログアウト導線: サイドバー最下部に表示→押下→セッション破棄→/login着地（フォーム表示・即リダイレクトされない）→再ログイン一周
 *  2) ログイン画面リダイレクトのペルソナ別マトリクス: supplier→サプライヤーホーム／referral→/app（一般ホーム）
 *  3) 運営者条件: consoleログイン済み同一ブラウザでsupplierログアウト→consoleセッション無傷（面別分離）
 *  4) モバイルドロワーにもログアウト・page errors []
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = 'http://localhost:4599', PW = 'CcAf!2026xx'
const SUP = 'cc-af-sup@mb-system.internal', REF = 'cc-af-ref@mb-system.internal', OWNER = 'cc-af-owner@mb-system.internal'
let pass = 0, fail = 0; const ok = (c: boolean, n: string, d = '') => { c ? (pass++, console.log('  ✓', n)) : (fail++, console.log('  ✗', n, d)) }

async function cleanup() {
  const { data: svc } = await admin.from('services').select('id').eq('name', 'CC-AFブランド').maybeSingle()
  if (svc) await admin.from('services').delete().eq('id', svc.id)
  const { data: l } = await admin.auth.admin.listUsers()
  for (const em of [REF, SUP, OWNER]) {
    const u = (l?.users || []).find((x: any) => x.email === em)
    if (u) { const { data: pa } = await admin.from('partners').select('id').eq('profile_id', u.id).maybeSingle(); if (pa) await admin.from('partners').delete().eq('id', pa.id); await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id).catch(() => {}) }
  }
}
await cleanup()
const mk = async (email: string, name: string, role: string) => { const c = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, app_metadata: { role } }); await admin.from('profiles').upsert({ id: c.data!.user!.id, name, role, email, color: '#888' }); return c.data!.user!.id }
await mk(OWNER, 'CC-AF運営', 'owner')
const supUid = await mk(SUP, 'CC-AF供給者', 'partner')
const refUid = await mk(REF, 'CC-AF紹介', 'partner')
const supPid = (await admin.from('partners').insert({ profile_id: supUid, code: 'CCAF01', company_name: '株式会社CC-AF' }).select('id').single()).data!.id
await admin.from('partners').insert({ profile_id: refUid, code: 'CCAF02' })
await admin.from('services').insert({ name: 'CC-AFブランド', active: true, supplier_partner_id: supPid, icon: '🧪', color: '#4733E6' })

const b = await chromium.launch()
const errs: string[] = []
async function login(p: Page, email: string, path: string) {
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
  if (!(await p.locator('input[type="email"]').count())) return
  await p.locator('input[type="email"]').fill(email); await p.locator('input[type="password"]').fill(PW)
  await p.locator('button[type="submit"]').first().click(); await p.waitForTimeout(2800)
}
const path = (p: Page) => new URL(p.url()).pathname

console.log('1) サプライヤー: ログアウト一周（クリーンプロファイル）')
const sctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const sp = await sctx.newPage(); sp.on('pageerror', e => errs.push(sp.url() + ': ' + e.message))
await login(sp, SUP, '/app'); await sp.waitForTimeout(1500)
ok((await sp.locator('h1:has-text("ダッシュボード")').count()) === 1, 'サプライヤー・コンソール到達')
const lo = sp.locator('.sup-side button:has-text("ログアウト")')
ok((await lo.count()) === 1, 'サイドバー最下部にログアウト導線', String(await lo.count()))
// ログイン済みで /login を踏む → ペルソナ正のホームへ（出口はログアウトで確保）
await sp.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(1800)
ok(path(sp) === '/app' && (await sp.locator('h1:has-text("ダッシュボード")').count()) === 1, 'ログイン済み /login → サプライヤーホーム（ペルソナ正）', path(sp))
// ログアウト → /login がフォーム表示で着地（即リダイレクトで弾かれない）
await sp.locator('.sup-side button:has-text("ログアウト")').click(); await sp.waitForTimeout(2500)
ok(path(sp) === '/login', 'ログアウト→/login 着地', path(sp))
ok((await sp.locator('input[type="email"]').count()) === 1 && (await sp.locator('button[type="submit"]').count()) >= 1, 'ログイン画面が表示される（リダイレクトされない）')
// セッション破棄の実測: /app 保護ページへ → login へ弾かれる
await sp.goto(BASE + '/app/s/money', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(1500)
ok(path(sp) === '/login', 'セッション破棄済み（保護ページ→/login）', path(sp))
// 再ログイン一周
await login(sp, SUP, '/login'); await sp.waitForTimeout(1500)
await sp.goto(BASE + '/app', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(1800)
ok((await sp.locator('h1:has-text("ダッシュボード")').count()) === 1, '再ログイン→サプライヤー・コンソール復帰（一周完了）')

console.log('2) 一般パートナー: マトリクス＋ログアウト一周')
const rctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const rp = await rctx.newPage(); rp.on('pageerror', e => errs.push(rp.url() + ': ' + e.message))
await login(rp, REF, '/app'); await rp.waitForTimeout(1500)
const refBody = await rp.evaluate('document.body.innerText') as string
ok(path(rp).startsWith('/app') && !refBody.includes('サービスマスタ'), '一般 /app 到達（サプライヤーUIなし）')
await rp.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await rp.waitForTimeout(1800)
ok(path(rp) === '/app', 'ログイン済み /login → /app（一般ペルソナ正）', path(rp))
// 一般のログアウト（既存: /app/settings）も健在
await rp.goto(BASE + '/app/settings', { waitUntil: 'domcontentloaded' }); await rp.waitForTimeout(1500)
await rp.locator('button:has-text("ログアウト")').first().click(); await rp.waitForTimeout(2500)
ok(path(rp) === '/login' && (await rp.locator('input[type="email"]').count()) === 1, '一般: ログアウト→/login フォーム表示')

console.log('3) 運営者条件（consoleログイン済み同一ブラウザ）')
const octx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const op = await octx.newPage(); op.on('pageerror', e => errs.push(op.url() + ': ' + e.message))
await login(op, OWNER, '/console'); await op.waitForTimeout(2000)
ok(path(op).startsWith('/console'), 'console ログイン成立')
// 同一ブラウザで supplier ログイン（app面）→ ログアウト
await login(op, SUP, '/app'); await op.waitForTimeout(1800)
ok((await op.locator('h1:has-text("ダッシュボード")').count()) === 1, '同一ブラウザで supplier(app面) ログイン成立')
await op.locator('.sup-side button:has-text("ログアウト")').click(); await op.waitForTimeout(2500)
ok(path(op) === '/login', 'supplier ログアウト（scope:local）')
await op.goto(BASE + '/console', { waitUntil: 'domcontentloaded' }); await op.waitForTimeout(2000)
ok(path(op).startsWith('/console') && !path(op).includes('login'), '★console セッション無傷（面別分離・巻き添えなし）', path(op))

console.log('4) モバイルドロワー')
const mctx = await b.newContext({ viewport: { width: 375, height: 667 } })
const mp = await mctx.newPage(); mp.on('pageerror', e => errs.push(mp.url() + ': ' + e.message))
await login(mp, SUP, '/app'); await mp.waitForTimeout(2000)
await mp.locator('button[aria-label="メニュー"], .sup-burger, button:has(svg)').first().click().catch(() => {})
await mp.waitForTimeout(700)
const drawerLogout = mp.locator('.drawer-in button:has-text("ログアウト")')
ok((await drawerLogout.count()) === 1, 'モバイルドロワーにもログアウト', String(await drawerLogout.count()))
await drawerLogout.click(); await mp.waitForTimeout(2500)
ok(path(mp) === '/login', 'モバイル: ログアウト→/login')

ok(errs.length === 0, 'page errors []', errs.join(' | ').slice(0, 300))
await b.close()
await cleanup()
console.log(`\n== supplier-auth-fix E2E: pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
