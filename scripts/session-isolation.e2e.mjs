#!/usr/bin/env node
/**
 * 恒久回帰テスト: 3面セッション独立（本バッチの本丸）。
 * 同一ブラウザ context で partner-app / console / vendor に実UIログインし、
 * どれか1面で再ログインしても他2面のセッションが生存することを検証する。
 * 過去に複数回「修理」されては再発した「1面にログインすると他がログアウト」事象の回帰検出。
 *
 * 使い方: BASE_APP / BASE_CONSOLE を環境変数で上書き可（既定=本番）。
 *   throwaway 3アカウント（partner/vendor/owner・同一パスワード）を service_role で用意し、
 *   実ブラウザで signInWithPassword を通す（ブラウザ側 createClient のcookie書込を実際に経由）。
 * 標準チェックに組み込む恒久テスト。money非接触・実データ非接触（自作throwawayのみ）。
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const APP = process.env.BASE_APP || 'https://mb-partners.app'
const CONSOLE = process.env.BASE_CONSOLE || 'https://console.mb-partners.app'
const PW = 'CcSess!2026xyz'
const OWN = process.env.SESS_TEST_OWNED === '1' // 呼び出し側がfixtureを管理する場合はcreate/teardownしない
const ACC = {
  app: { email: 'cc-sess-partner-throwaway@mb-system.internal', role: 'partner', name: '検証セッションP' },
  vendor: { email: 'cc-sess-vendor-throwaway@mb-system.internal', role: 'vendor', name: '検証セッションV' },
  console: { email: 'cc-sess-admin-throwaway@mb-system.internal', role: 'owner', name: '検証セッションA' },
}
let pass = 0, fail = 0
const ok = (c, n, d = '') => { if (c) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, String(d).slice(0, 200)) } }

// 各面: login URL / 認証後URL / 「ログイン済みか」の判定（loginへ飛ばされていない かつ 認証後pathに居る）
const SURF = {
  app:     { base: APP,     login: '/login',          home: '/app',     loginRe: /\/login(\?|$)/ },
  vendor:  { base: APP,     login: '/vendor/login',   home: '/vendor',  loginRe: /\/vendor\/login(\?|$)/ },
  console: { base: CONSOLE, login: '/console/login',  home: '/console', loginRe: /\/console\/login(\?|$)/ },
}

async function ensureFixtures() {
  for (const k of Object.keys(ACC)) {
    const a = ACC[k]
    const { data: list } = await admin.auth.admin.listUsers()
    let u = (list?.users || []).find(x => x.email === a.email)
    if (!u) {
      const c = await admin.auth.admin.createUser({ email: a.email, password: PW, email_confirm: true, app_metadata: { role: a.role } })
      if (c.error) throw new Error('createUser ' + a.email + ': ' + c.error.message)
      u = c.data.user
      await admin.from('profiles').upsert({ id: u.id, name: a.name, role: a.role, email: a.email, color: '#888888' })
      if (a.role === 'partner') await admin.from('partners').insert({ profile_id: u.id, code: 'CCSESSP', status: 'active' }).then(() => {}, () => {})
      if (a.role === 'vendor') await admin.from('deliveries').insert({ name: '検証セッション委託先（throwaway）', kind: 'エンジニア', active: true, service_id: 'dx', auth_user_id: u.id }).then(() => {}, () => {})
    }
  }
}
async function teardownFixtures() {
  const { data: list } = await admin.auth.admin.listUsers()
  for (const k of Object.keys(ACC)) {
    const u = (list?.users || []).find(x => x.email === ACC[k].email)
    if (!u) continue
    await admin.from('deliveries').delete().eq('auth_user_id', u.id).then(() => {}, () => {})
    await admin.from('partners').delete().eq('profile_id', u.id).then(() => {}, () => {})
    await admin.from('profiles').delete().eq('id', u.id).then(() => {}, () => {})
    await admin.auth.admin.deleteUser(u.id).then(() => {}, () => {})
  }
}

async function login(page, surf) {
  const s = SURF[surf]
  await page.goto(s.base + s.login, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  // 既ログイン時は login ページがホームへ redirect し email 入力が無い＝そのまま成立扱い。
  const hasForm = await page.locator('input[type="email"]').count().catch(() => 0)
  if (!hasForm) return
  await page.locator('input[type="email"]').fill(ACC[surf].email)
  await page.locator('input[type="password"]').fill(PW)
  await page.locator('button[type="submit"], button:has-text("ログイン")').first().click()
  // 認証後 home へ遷移（クライアント router.push）を待つ
  await page.waitForURL(u => !s.loginRe.test(new URL(u).pathname), { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1200)
}

// そのsurfaceの認証cookieだけを消す（＝そのsurfaceのセッション期限切れを模擬）。他surfaceのcookieは温存。
async function expireSurface(ctx, surf) {
  const all = await ctx.cookies()
  const prefix = cookieNameOf(surf)
  const keep = all.filter(c => !c.name.startsWith(prefix))
  await ctx.clearCookies()
  if (keep.length) await ctx.addCookies(keep)
}
function cookieNameOf(surf) { return surf === 'console' ? 'mb-auth-console' : surf === 'vendor' ? 'mb-auth-vendor' : 'mb-auth-app' }

// 「そのsurfaceのセッションが生きているか」= home を叩いてloginへ飛ばされないこと（middlewareが未ログインをloginへredirect）
async function isAlive(page, surf) {
  const s = SURF[surf]
  const resp = await page.goto(s.base + s.home, { waitUntil: 'domcontentloaded' }).catch(() => null)
  await page.waitForTimeout(600)
  const path = new URL(page.url()).pathname
  return !s.loginRe.test(path) && path.startsWith(s.home)
}

async function main() {
  if (!OWN) await ensureFixtures()
  const browser = await chromium.launch()
  let fatal = null
  try {
    // 単一 context（＝実ユーザーの1ブラウザ）で3面を順にログイン
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()

    console.log('[1] 3面へ順次ログイン（同一ブラウザ）')
    await login(page, 'app');     ok(await isAlive(page, 'app'), 'app ログイン成立')
    await login(page, 'vendor');  ok(await isAlive(page, 'vendor'), 'vendor ログイン成立')
    await login(page, 'console'); ok(await isAlive(page, 'console'), 'console ログイン成立')

    console.log('[2] 3面同時生存（vendor/console ログイン後も app/vendor 生存）')
    ok(await isAlive(page, 'app'), 'app 生存（他2面ログイン後）')
    ok(await isAlive(page, 'vendor'), 'vendor 生存（console ログイン後）')
    ok(await isAlive(page, 'console'), 'console 生存')

    console.log('[3] 1面のセッション期限切れ→再ログイン → 他2面が生存（本丸）')
    // app の cookie だけ消す（=app セッション期限切れの模擬・vendor/console は温存）→ app 再ログイン
    await expireSurface(ctx, 'app')
    ok(!(await isAlive(page, 'app')), 'app 期限切れを確認（要再ログイン）')
    ok(await isAlive(page, 'vendor'), 'vendor は app 失効に無影響')
    ok(await isAlive(page, 'console'), 'console は app 失効に無影響')
    await login(page, 'app')
    ok(await isAlive(page, 'app'), 'app 再ログイン成立')
    ok(await isAlive(page, 'vendor'), '★vendor 生存（app 再ログイン後）')
    ok(await isAlive(page, 'console'), '★console 生存（app 再ログイン後）')

    // vendor 再ログインでも同様に app/console 生存
    await expireSurface(ctx, 'vendor')
    await login(page, 'vendor')
    ok(await isAlive(page, 'app'), '★app 生存（vendor 再ログイン後）')
    ok(await isAlive(page, 'console'), '★console 生存（vendor 再ログイン後）')
    ok(await isAlive(page, 'vendor'), 'vendor 再ログイン成立')

    console.log('[4] cookie 名前空間の独立（3面の認証cookieが同時共存）')
    const cookies = await ctx.cookies()
    const names = new Set(cookies.map(c => c.name.replace(/\.\d+$/, '')))
    ok([...names].some(n => n.startsWith('mb-auth-app')) || cookies.some(c => c.name.startsWith('mb-auth-app')), 'mb-auth-app cookie 存在')
    ok(cookies.some(c => c.name.startsWith('mb-auth-vendor')), 'mb-auth-vendor cookie 存在')
    ok(cookies.some(c => c.name.startsWith('mb-auth-console')), 'mb-auth-console cookie 存在')

    await ctx.close()
  } catch (e) { fatal = e } finally {
    await browser.close().catch(() => {})
    if (!OWN) await teardownFixtures()
    if (fatal) { console.log('FATAL:', fatal?.message); console.log(fatal?.stack?.slice(0, 500)) }
    console.log(`\nSESSION-ISOLATION: ${pass} passed / ${fail} failed`)
    process.exit(fail === 0 && !fatal ? 0 : 1)
  }
}
main()
