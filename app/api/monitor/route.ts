/**
 * GET /api/monitor?tier=1|2|3 — 本番システムの自己巡回（synthetic monitoring）。
 * Vercel Cron が Authorization: Bearer <CRON_SECRET> で叩く（手動確認は ?key=<CRON_SECRET> でも可）。
 * 異常は2回連続で運営Slackへ発報・復旧で1通（lib/monitor）。★実ユーザー送信ゼロ・money非接触・読み取り主体。
 *  Tier1(15分): 公開面の到達性＋DB到達  Tier2(1時間): カレンダー連携生死＋メール基盤疎通  Tier3(日次): 認証read-onlyスモーク＋稼働ハートビート
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSb } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { recordCheck, heartbeat, jstNow, type CheckResult } from '@/lib/monitor'
import { decryptTokens, type StoredTokens } from '@/lib/google-token'
import { getValidAccessToken } from '@/lib/google-calendar'

export const runtime = 'nodejs'
export const maxDuration = 60

const APEX = 'https://mb-partners.app'
const CONSOLE = 'https://console.mb-partners.app'
const cb = () => `cb=${Date.now()}${Math.round(Math.random() * 1e6)}`

async function httpStatus(url: string, opts?: RequestInit): Promise<number> {
  try {
    const r = await fetch(url, { redirect: 'manual', cache: 'no-store', ...opts })
    return r.status
  } catch { return -1 }
}

// ── Tier1：公開面の到達性＋DB到達（無認証・SWバイパス＝サーバ間fetch） ─────────────
async function tier1(admin: Awaited<ReturnType<typeof createServiceRoleClient>>): Promise<CheckResult[]> {
  const [app, con, ven, hook, part, rpage] = await Promise.all([
    httpStatus(`${APEX}/app?${cb()}`),
    httpStatus(`${CONSOLE}/console?${cb()}`),
    httpStatus(`${APEX}/vendor?${cb()}`),
    httpStatus(`${APEX}/api/line/webhook?${cb()}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    httpStatus(`${APEX}/partners?${cb()}`),
    httpStatus(`${APEX}/r/monitor-sample?${cb()}`),
  ])
  let dbOk = false, dbErr = ''
  try { const { error } = await admin.from('menu_rewards').select('id', { count: 'exact', head: true }); dbOk = !error; dbErr = error?.message ?? '' } catch (e) { dbErr = e instanceof Error ? e.message : 'db error' }

  return [
    { key: 't1.app_login_redirect', label: 'APP 未認証リダイレクト', ok: app === 307, detail: `期待307 実際${app}`, where: `${APEX}/app`, next: '認証ミドルウェア/セッション設定を確認' },
    { key: 't1.console_login_redirect', label: 'コンソール 未認証リダイレクト', ok: con === 307, detail: `期待307 実際${con}`, where: `${CONSOLE}/console`, next: '認証ミドルウェアを確認' },
    { key: 't1.vendor_login_redirect', label: 'ベンダー 未認証リダイレクト', ok: ven === 307, detail: `期待307 実際${ven}`, where: `${APEX}/vendor`, next: '認証ミドルウェアを確認' },
    { key: 't1.webhook_unsigned_401', label: 'LINE Webhook 無署名拒否', ok: hook === 401, detail: `期待401 実際${hook}`, where: `${APEX}/api/line/webhook`, next: '署名検証（fail-closed）が生きているか確認' },
    { key: 't1.partners_200', label: 'パートナー募集LP', ok: part === 200, detail: `期待200 実際${part}`, where: `${APEX}/partners`, next: 'デプロイ/ビルド成果物・ルーティングを確認' },
    { key: 't1.referral_page_200', label: '紹介ページ /r/', ok: rpage === 200, detail: `期待200 実際${rpage}`, where: `${APEX}/r/`, next: '公開ページのルーティングを確認' },
    { key: 't1.db_reachable', label: 'DB 到達性', ok: dbOk, detail: dbOk ? 'OK' : `DB照会失敗: ${dbErr}`, where: 'Supabase（menu_rewards head）', next: 'Supabase稼働・接続文字列・プーラーを確認' },
  ]
}

// ── Tier2：カレンダー連携の実トークン生死＋メール基盤の疎通（実送信なし） ───────────
async function tier2(admin: Awaited<ReturnType<typeof createServiceRoleClient>>): Promise<CheckResult[]> {
  const out: CheckResult[] = []

  // カレンダー：オーナーの連携行があれば、実トークンを更新試行して生死判定。行が無ければ監視対象外（ok）。
  let calOk = true, calDetail = '連携行なし（監視対象外）'
  try {
    const { data: owner } = await admin.from('profiles').select('id').eq('role', 'owner').limit(1).maybeSingle()
    if (owner?.id) {
      const { data: link } = await admin.from('member_calendar_links').select('oauth_tokens, active, google_email').eq('user_id', owner.id).maybeSingle()
      if (link?.active && link.oauth_tokens) {
        try {
          const tokens = decryptTokens(link.oauth_tokens as StoredTokens)
          await getValidAccessToken(tokens, async () => {})
          calOk = true; calDetail = `有効（${link.google_email}）`
        } catch { calOk = false; calDetail = `トークン失効（${link.google_email}）＝Meet自動発行が停止` }
      }
    }
  } catch (e) { calOk = false; calDetail = e instanceof Error ? e.message : 'calendar check error' }
  out.push({ key: 't2.calendar_health', label: 'Googleカレンダー連携', ok: calOk, detail: calDetail, where: 'コンソール→設定→商談カレンダー', next: '「⚠要再連携」なら本人が再連携（OAuth同意画面は本番公開推奨）' })

  // メール基盤：Resend API 疎通（GET /domains・実送信なし）。キー未設定は監視対象外（ok）。
  let mailOk = true, mailDetail = 'RESEND_API_KEY 未設定（監視対象外）'
  if (process.env.RESEND_API_KEY) {
    const st = await httpStatus('https://api.resend.com/domains', { method: 'GET', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } })
    mailOk = st === 200; mailDetail = mailOk ? 'OK（疎通のみ・送信なし）' : `Resend応答 ${st}`
  }
  out.push({ key: 't2.mail_provider', label: 'メール送信基盤（Resend）', ok: mailOk, detail: mailDetail, where: 'api.resend.com', next: 'RESEND_API_KEY の有効性・プロバイダ障害情報を確認' })

  return out
}

// ── Tier3：認証 read-only スモーク（監視専用アカウント・書込なし）＋稼働ハートビート ──
async function tier3(admin: Awaited<ReturnType<typeof createServiceRoleClient>>): Promise<CheckResult[]> {
  const EMAIL = 'cc-monitor@mb-system.internal'
  let authOk = false, detail = ''
  try {
    // 監視専用アカウント（最小権限＝partner・自分の空データのみ）を冪等に用意。
    const { data: list } = await admin.auth.admin.listUsers()
    let u = (list?.users || []).find((x: { email?: string }) => x.email === EMAIL)
    if (!u) {
      const c = await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true, app_metadata: { role: 'partner', monitor: true } })
      u = c.data?.user ?? undefined
      if (u) await admin.from('profiles').upsert({ id: u.id, name: '監視', role: 'partner', email: EMAIL, color: '#888888' })
    }
    if (!u) throw new Error('監視アカウント用意に失敗')

    // 認証パス：magiclink を発行→OTP検証でセッション取得（＝auth入口の生死）。
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
    if (linkErr || !link?.properties?.hashed_token) throw new Error('magiclink 発行失敗: ' + (linkErr?.message ?? ''))
    const anon = createSb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: sess, error: otpErr } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'email' })
    if (otpErr || !sess?.session) throw new Error('OTP検証/セッション取得失敗: ' + (otpErr?.message ?? ''))
    // 認証済みセッションで自分のプロフィールを read-only 取得（＝DB+RLS read の生死）。
    const { error: readErr } = await anon.from('profiles').select('id').eq('id', sess.session.user.id).single()
    if (readErr) throw new Error('認証read失敗: ' + readErr.message)
    authOk = true; detail = 'OK（セッション取得＋自分の行read・書込なし）'
    await anon.auth.signOut().catch(() => {})
  } catch (e) { authOk = false; detail = e instanceof Error ? e.message : 'auth smoke error' }

  return [{ key: 't3.auth_read_smoke', label: '認証 read-only スモーク', ok: authOk, detail, where: '監視専用アカウント（partner・読み取りのみ）', next: 'Supabase Auth / RLS / 接続を確認' }]
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  const url = new URL(req.url)
  const auth = req.headers.get('authorization') ?? ''
  const keyOk = auth === `Bearer ${secret}` || url.searchParams.get('key') === secret
  if (!keyOk) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tier = url.searchParams.get('tier') ?? '1'
  const admin = await createServiceRoleClient()

  let checks: CheckResult[] = []
  try {
    if (tier === '1') checks = await tier1(admin)
    else if (tier === '2') checks = await tier2(admin)
    else if (tier === '3') checks = await tier3(admin)
    else return NextResponse.json({ error: 'invalid tier' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'tier error' }, { status: 500 })
  }

  const outcomes = []
  for (const c of checks) outcomes.push(await recordCheck(admin, c))

  // Tier3 は dead-man ハートビートを1行（全チェック結果の要約付き）。
  if (tier === '3') {
    const failed = outcomes.filter(o => !o.ok).length
    await heartbeat(`🟢 MB Partners 自己監視 稼働中｜Tier3巡回 ${failed === 0 ? '異常なし' : `${failed}件 異常`}｜${jstNow()} JST`)
  }

  const failed = outcomes.filter(o => !o.ok)
  return NextResponse.json({ ok: failed.length === 0, tier, checked: outcomes.length, failed: failed.length, results: checks.map((c, i) => ({ key: c.key, ok: c.ok, detail: c.detail, streak: outcomes[i].streak, alerted: outcomes[i].alerted })) })
}
