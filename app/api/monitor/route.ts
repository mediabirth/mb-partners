/**
 * GET /api/monitor?tier=1|2|3 — 本番システムの自己巡回（synthetic monitoring）。
 * Vercel Cron が Authorization: Bearer <CRON_SECRET> で叩く（手動確認は ?key=<CRON_SECRET> でも可）。
 * 異常は2回連続で運営Slackへ発報・復旧で1通（lib/monitor）。日次ハートビートは廃止（dead-man＝コンソール監視タブ＋ダッシュボード24hバナー）。★実ユーザー送信ゼロ・money非接触・読み取り主体。
 *  Tier1(15分): 公開面の到達性＋DB到達  Tier2(1時間): カレンダー連携生死＋メール基盤疎通  Tier3(日次): 認証read-onlyスモーク＋稼働ハートビート
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSb } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { recordCheck, type CheckResult } from '@/lib/monitor'
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

  const out: CheckResult[] = [{ key: 't3.auth_read_smoke', label: '認証 read-only スモーク', ok: authOk, detail, where: '監視専用アカウント（partner・読み取りのみ）', next: 'Supabase Auth / RLS / 接続を確認' }]

  // P0-a: 系統連動レートの健全性（仕様正典 v2 §7-9）。テーブル未作成/エラーは監視対象外（ok・fail-open）。
  try {
    // (i) supplierメニューの confirmed/paid で fee_snapshot=null（凍結漏れ）
    const { data: svs } = await admin.from('services').select('id').not('supplier_partner_id', 'is', null)
    const sids = (svs ?? []).map((s: { id: string }) => s.id)
    if (sids.length) {
      const { count } = await admin.from('deals').select('id', { count: 'exact', head: true }).in('status', ['confirmed', 'paid']).in('service_id', sids).is('fee_snapshot', null)
      out.push({ key: 't3.fee_snapshot_null', label: 'fee_snapshot 凍結漏れ', ok: (count ?? 0) === 0, detail: `${count ?? 0}件のサプライヤー案件が条件未凍結`, where: 'deals（supplierメニュー・confirmed/paid）', next: '該当案件の成約を開き直して再確定（confirmで再凍結）' })
    }
    // (ii) 請求凍結行の自己整合（amount=round(base×rate)）＋fee-hash（情報）
    const { data: chs } = await admin.from('supplier_charges').select('id, kind, base_amount, rate, amount, status, period, frozen_at')
    if (chs) {
      const rows = chs as { id: string; kind: string; base_amount: number; rate: number | null; amount: number; status: string; period: string; frozen_at: string }[]
      const broken = rows.filter(r => r.rate != null && Math.round(Number(r.base_amount) * Number(r.rate)) !== Number(r.amount))
      out.push({ key: 't3.fee_integrity', label: 'サプライヤー請求の自己整合', ok: broken.length === 0, detail: broken.length ? `${broken.length}件で amount≠round(base×rate)` : `OK（${rows.length}行）`, where: 'supplier_charges', next: '請求行の改変を突合（凍結後の直接更新は禁止）' })
      // (iii) unbilled滞留: 前々月以前 or 前月分が凍結後7日超も未請求
      const now = new Date()
      const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const prev = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1))
      const stale = rows.filter(r => r.status === 'unbilled' && (r.period < prev || (r.period === prev && (Date.now() - new Date(r.frozen_at).getTime()) > 7 * 86400_000)))
      out.push({ key: 't3.unbilled_stale', label: 'サプライヤー請求の未請求滞留', ok: stale.length === 0, detail: stale.length ? `${stale.length}件が未請求のまま滞留` : 'OK', where: 'コンソール→サプライヤー請求', next: '請求書を発行し「請求済みにする」を実行' })
    }
  } catch { /* fail-open（テーブル未作成等） */ }

  // 根絶第2層（2026-07-11・招待セッション事故）: 乗っ取りガードの歩哨。
  // 監視専用の非partnerアカウント（manager・恒久インフラ）のメールでパートナー招待受諾を実行し、
  // **拒否される（409）こと**を毎日実測。200が返る＝ガード退行＝コンソール自動ログアウト事故が再発可能な状態→即発報。
  try {
    const OPS_EMAIL = 'cc-monitor-ops@mb-system.internal'
    const { data: l2 } = await admin.auth.admin.listUsers()
    let opsU = (l2?.users || []).find((x: { email?: string }) => x.email === OPS_EMAIL)
    if (!opsU) {
      const c2 = await admin.auth.admin.createUser({ email: OPS_EMAIL, email_confirm: true, app_metadata: { role: 'manager', monitor: true } })
      opsU = c2.data?.user ?? undefined
      if (opsU) await admin.from('profiles').upsert({ id: opsU.id, name: '監視(運営役)', role: 'manager', email: OPS_EMAIL, color: '#888888' })
    }
    if (opsU) {
      const { data: probeInv } = await admin.from('invites').insert({ email: OPS_EMAIL, kind: 'partner', role: 'partner' }).select('token').single()
      let guardOk = false, detail2 = ''
      if (probeInv?.token) {
        const r = await fetch(`${APEX}/api/invite/accept`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store',
          body: JSON.stringify({ token: probeInv.token, email: OPS_EMAIL, password: 'MonitorProbe1!', lastName: '監視', firstName: '歩哨', phone: '0', address: '-', taxType: 'individual', bankName: 'x', branchName: 'x', accountType: '普通', accountNumber: '1', accountHolder: 'x', agreeTerms: true, agreePrivacy: true }),
        })
        guardOk = r.status === 409
        detail2 = `accept応答 ${r.status}（期待409=拒否）`
        // 万一 200 が返った場合の復旧掃除（partner行が作られていたら除去・パスワードは監視専用アカウントのため実害なし）
        if (r.ok) { try { await admin.from('partners').delete().eq('profile_id', opsU.id) } catch {} }
        await admin.from('invites').delete().eq('token', probeInv.token)
      } else { detail2 = 'probe招待の作成に失敗' }
      out.push({ key: 't3.invite_hijack_guard', label: '招待の乗っ取りガード（非partnerメール拒否）', ok: guardOk, detail: detail2, where: '/api/invite/accept', next: 'ガード退行の疑い。accept経路の existingRole チェックを確認（コンソール自動ログアウト事故が再発可能な状態）' })
    }
  } catch { /* fail-open */ }

  return out
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

  const outcomes: Awaited<ReturnType<typeof recordCheck>>[] = []
  for (const c of checks) outcomes.push(await recordCheck(admin, c))

  // 静音化（2026-07-12）: 日次ハートビート（異常なし連絡）は廃止。Slackは「異常（2回連続）」と「復旧」のみ。
  // dead-man検出は コンソール設定→監視 の最終実行表示＋ダッシュボードの24時間バナーへ移譲。

  const failed = outcomes.filter(o => !o.ok)
  return NextResponse.json({ ok: failed.length === 0, tier, checked: outcomes.length, failed: failed.length, results: checks.map((c, i) => ({ key: c.key, ok: c.ok, detail: c.detail, streak: outcomes[i].streak, alerted: outcomes[i].alerted })) })
}
