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
import { launchChromium } from '../playwright-launch.mjs'

const env = Object.fromEntries(readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
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
// 二重ロール（同一メールで partner+vendor）テスト用アカウント
const DUAL = { email: 'cc-dual-throwaway@mb-system.internal', name: '二重テスト太郎', deliveryName: '二重テスト委託先（throwaway）' }
// [7] 運営者実環境ケース（招待セッション事故の恒久回帰・2026-07-11）用の新規登録者
const INVITEE = { email: 'cc-sess-invitee-throwaway@mb-system.internal' }
let pass = 0, fail = 0
const ok = (c, n, d = '') => { if (c) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, String(d).slice(0, 200)) } }

// 同一メールに partner を先に作り、その後 vendor accept を通しても partner の role/name が保全されるか（構造ガードの回帰検出）。
async function dualIdentityCheck() {
  // 1) partner 側の既存アカウントを用意（auth+profile role=partner+partners行）
  const { data: list } = await admin.auth.admin.listUsers()
  let u = (list?.users || []).find(x => x.email === DUAL.email)
  if (!u) { const c = await admin.auth.admin.createUser({ email: DUAL.email, password: PW, email_confirm: true, app_metadata: { role: 'partner' } }); u = c.data?.user }
  const uid = u.id
  await admin.from('profiles').upsert({ id: uid, name: DUAL.name, role: 'partner', email: DUAL.email, color: '#888888' })
  await admin.from('partners').upsert({ profile_id: uid, code: 'CCDUAL', status: 'active' }, { onConflict: 'profile_id' }).then(() => {}, () => {})
  // 2) 同一メール宛の vendor 招待＋delivery を用意し、実 API /api/vendor/accept を叩く（本番コードパス）
  const dl = await admin.from('deliveries').insert({ name: DUAL.deliveryName, kind: 'エンジニア', active: true, service_id: 'dx' }).select('id').single()
  const token = 'cc-dual-tok-' + uid.slice(0, 8)
  await admin.from('invites').insert({ token, email: DUAL.email, role: 'vendor', kind: 'vendor', delivery_id: dl.data.id, expires_at: new Date(Date.now() + 864e5).toISOString() }).then(() => {}, () => {})
  const res = await fetch(APP + '/api/vendor/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email: DUAL.email, password: PW, name: DUAL.deliveryName }) })
  const j = await res.json().catch(() => ({}))
  ok(res.ok, 'vendor accept（同一メール既存partner）が成功', JSON.stringify(j))
  // 3) partner アイデンティティが保全されているか
  const { data: prof } = await admin.from('profiles').select('role, name').eq('id', uid).single()
  ok(prof?.role === 'partner', '★partner の role が保全（vendorに上書きされない）', JSON.stringify(prof))
  ok(prof?.name === DUAL.name, '★partner の name が保全（会社名に上書きされない）', JSON.stringify(prof))
  const { data: pr } = await admin.from('partners').select('id').eq('profile_id', uid).maybeSingle()
  ok(!!pr, 'partners 行が生存')
  const { data: dv } = await admin.from('deliveries').select('auth_user_id').eq('id', dl.data.id).single()
  ok(dv?.auth_user_id === uid, 'vendor delivery が同一auth_userに紐づく（linkageで vendor 本人性）')
}

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
  const emails = [...Object.keys(ACC).filter(k => ACC[k]).map(k => ACC[k].email), DUAL.email, INVITEE.email]
  // dual の delivery/invite（auth_user 未紐づけ経路も）を掃除
  await admin.from('deliveries').delete().eq('name', DUAL.deliveryName).then(() => {}, () => {})
  await admin.from('invites').delete().ilike('token', 'cc-dual-tok-%').then(() => {}, () => {})
  await admin.from('invites').delete().eq('email', INVITEE.email).then(() => {}, () => {})
  for (const email of emails) {
    const u = (list?.users || []).find(x => x.email === email)
    if (!u) continue
    await admin.from('deliveries').delete().eq('auth_user_id', u.id).then(() => {}, () => {})
    await admin.from('audit_logs').delete().eq('actor_profile_id', u.id).then(() => {}, () => {})
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
  // 認証後 home へ遷移（クライアント router.push）を待つ。本番コールドスタート耐性で最大2回まで再送信。
  await page.waitForURL(u => !s.loginRe.test(new URL(u).pathname), { timeout: 20000 }).catch(() => {})
  for (let i = 0; i < 2; i++) {
    if (!s.loginRe.test(new URL(page.url()).pathname)) break
    const stillForm = await page.locator('button[type="submit"]').count().catch(() => 0)
    if (!stillForm) break
    await page.locator('button[type="submit"], button:has-text("ログイン")').first().click().catch(() => {})
    await page.waitForURL(u => !s.loginRe.test(new URL(u).pathname), { timeout: 15000 }).catch(() => {})
  }
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

// 「そのsurfaceのセッションが生きているか」= home を叩いてloginへ飛ばされないこと（middlewareが未ログインをloginへredirect）。
// 本番レイテンシで単発判定がぶれるため、生存判定は最大3回リトライ（安定化＝恒久標準チェックの信頼性）。
async function isAlive(page, surf) {
  const s = SURF[surf]
  let path = ''
  for (let i = 0; i < 3; i++) {
    await page.goto(s.base + s.home, { waitUntil: 'domcontentloaded' }).catch(() => null)
    await page.waitForTimeout(700)
    path = new URL(page.url()).pathname
    if (!s.loginRe.test(path) && path.startsWith(s.home)) return true
    if (s.loginRe.test(path)) return false   // 明示的に login へ飛ばされた＝確実に未生存
    await page.waitForTimeout(500)
  }
  return !s.loginRe.test(path) && path.startsWith(s.home)
}

async function main() {
  if (!OWN) await ensureFixtures()
  let browser = null
  let fatal = null
  try {
    browser = await launchChromium()
    // 単一 context（＝実ユーザーの1ブラウザ）で3面を順にログイン
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await ctx.newPage()

    // ウォームアップ: 新デプロイ直後の関数コールドスタートを先に叩いて温める（初回計測のflake根絶）。
    console.log('[0] ウォームアップ（コールドスタート回避）')
    for (const surf of ['app', 'vendor', 'console']) {
      await page.goto(SURF[surf].base + SURF[surf].login, { waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForTimeout(400)
    }

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

    console.log('[5] 同一メール二重ロール共存（アイデンティティ入れ替わりの回帰検出）')
    // 既存 partner に、同一メールで vendor accept を通しても partner の role/name が保全されることを実測。
    await dualIdentityCheck()

    console.log('[6] 二重ロールの両面ログイン共存（partner と vendor が同一ブラウザで同時生存）')
    await ctx.clearCookies()
    const dctx = ctx
    const dpage = await dctx.newPage()
    // partner としてログイン → app 生存
    await dpage.goto(APP + '/login', { waitUntil: 'domcontentloaded' }); await dpage.waitForTimeout(600)
    await dpage.locator('input[type="email"]').fill(DUAL.email)
    await dpage.locator('input[type="password"]').fill(PW)
    await dpage.locator('button[type="submit"], button:has-text("ログイン")').first().click()
    await dpage.waitForURL(u => !/\/login(\?|$)/.test(new URL(u).pathname), { timeout: 20000 }).catch(() => {})
    ok(await isAlive(dpage, 'app'), 'dual: partner面(app) ログイン成立')
    // 同一ブラウザで vendor としてログイン（同一メール・delivery linkage 経由）→ vendor 生存
    await dpage.goto(APP + '/vendor/login', { waitUntil: 'domcontentloaded' }); await dpage.waitForTimeout(600)
    const vHasForm = await dpage.locator('input[type="email"]').count().catch(() => 0)
    if (vHasForm) {
      await dpage.locator('input[type="email"]').fill(DUAL.email)
      await dpage.locator('input[type="password"]').fill(PW)
      await dpage.locator('button[type="submit"], button:has-text("ログイン")').first().click()
      await dpage.waitForURL(u => !/\/vendor\/login(\?|$)/.test(new URL(u).pathname), { timeout: 20000 }).catch(() => {})
    }
    ok(await isAlive(dpage, 'vendor'), '★dual: vendor面 も生存（delivery linkageで本人性・role非依存）')
    ok(await isAlive(dpage, 'app'), '★dual: partner面 も同時生存（vendorログインが上書きしない）')
    await dpage.close()

    console.log('[7] 運営者実環境（consoleログイン済み同一ブラウザで新規パートナー登録）＝招待セッション事故の恒久回帰')
    // 事故の実機序（2026-07-11・勝彦実機で再現）: 運営メールへの招待受諾が updateUserById(password) で
    // 運営アカウントを乗っ取り→全セッション失効（コンソール自動ログアウト）→role bounceでコンソール誤誘導。
    await ctx.clearCookies()
    const octx = ctx
    const opage = await octx.newPage()
    await login(opage, 'console')
    ok(await isAlive(opage, 'console'), '[7] console ログイン成立（運営者状態）')
    // (a) 新規メールの招待→受諾→appログイン。console セッションは無傷であること。
    await admin.from('invites').delete().eq('email', INVITEE.email)
    const { data: inv7 } = await admin.from('invites').insert({ email: INVITEE.email, kind: 'partner', role: 'partner', is_frontier: true }).select('token').single()
    const accNew = await opage.evaluate(async (args) => {
      const r = await fetch('/api/invite/accept', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: args.token, email: args.email, password: args.pw, lastName: '登録', firstName: '検証', phone: '09000000000', address: '大阪府吹田市1-1-1', taxType: 'individual', bankName: '検証銀行', branchName: '本店', accountType: '普通', accountNumber: '1234567', accountHolder: 'トウロク ケンショウ', agreeTerms: true, agreePrivacy: true }) })
      return r.status
    }, { token: inv7.token, email: INVITEE.email, pw: PW })
    ok(accNew === 200, '[7]a 新規メールの招待受諾 200', String(accNew))
    // 同一ブラウザで app に新規パートナーとしてログイン（登録フローの signIn 相当）
    await opage.goto(APP + '/login', { waitUntil: 'domcontentloaded' }); await opage.waitForTimeout(600)
    const hasForm7 = await opage.locator('input[type="email"]').count().catch(() => 0)
    if (hasForm7) {
      await opage.locator('input[type="email"]').fill(INVITEE.email)
      await opage.locator('input[type="password"]').fill(PW)
      await opage.locator('button[type="submit"], button:has-text("ログイン")').first().click()
      await opage.waitForURL(u => !/\/login(\?|$)/.test(new URL(u).pathname), { timeout: 20000 }).catch(() => {})
      await opage.waitForTimeout(1200)
    }
    ok(await isAlive(opage, 'app'), '[7]a 新規パートナーの app ログイン成立（/app 着地）')
    ok(await isAlive(opage, 'console'), '★[7]a console セッション無傷（登録フローが破壊しない）')
    // (b) 運営（console オーナー）のメールで受諾を試みる → 乗っ取りガードが 409 で遮断・console 生存。
    await admin.from('invites').delete().eq('email', ACC.console.email)
    const { data: inv7b } = await admin.from('invites').insert({ email: ACC.console.email, kind: 'partner', role: 'partner' }).select('token').single()
    const accOwn = await opage.evaluate(async (args) => {
      const r = await fetch('/api/invite/accept', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: args.token, email: args.email, password: 'Hijack!12345', lastName: '乗', firstName: '取', phone: '0', address: '-', taxType: 'individual', bankName: 'x', branchName: 'x', accountType: '普通', accountNumber: '1', accountHolder: 'x', agreeTerms: true, agreePrivacy: true }) })
      return r.status
    }, { token: inv7b.token, email: ACC.console.email })
    ok(accOwn === 409, '★[7]b 運営メールの受諾は 409 で遮断（乗っ取りガード）', String(accOwn))
    ok(await isAlive(opage, 'console'), '★[7]b console セッション生存（パスワード上書きが起きていない）')
    await admin.from('invites').delete().eq('email', ACC.console.email)
    await opage.close()
    await ctx.close()
  } catch (e) { fatal = e } finally {
    await browser?.close().catch(() => {})
    if (!OWN) await teardownFixtures()
    if (fatal) { console.log('FATAL:', fatal?.message); console.log(fatal?.stack?.slice(0, 500)) }
    console.log(`\nSESSION-ISOLATION: ${pass} passed / ${fail} failed`)
    process.exit(fail === 0 && !fatal ? 0 : 1)
  }
}
main()
