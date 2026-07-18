import { Suspense } from 'react'
import PageGuide from '@/components/PageGuide'
import { GUIDE_DASHBOARD } from '@/lib/console-guides'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import { getAllDeals } from '@/lib/supabase/queries'
import { loadProjectPnl, sumMonth } from '@/lib/pnl-aggregate'
import ConsoleNav from '@/components/ConsoleNav'
import GlobalSearchClient from './GlobalSearchClient'
import MonthSelector from './MonthSelector'
import { customerHonorific } from '@/lib/customer'
import ConsoleMain from '@/components/ConsolePageTransition'
import CountUp from '@/components/CountUp'
import StatusDot from './StatusDot'
import StatCard from '@/components/ui/StatCard'
import KpiCard, { WaterRow } from '@/components/ui/KpiCard'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { PROJECT_STATUSES, INTAKE_LABEL } from '@/lib/phase'
import FunnelSection from './FunnelSection'

export const runtime = 'edge'

export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const { m: mParam } = await searchParams
  // シェル(ConsoleNav)を即描画。重いデータ本体(deal_events ネスト結合 + pnl-aggregate ほか)は Suspense の後ろで stream。
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <ConsoleMain>
        <Suspense fallback={<ConsoleDashboardSkeleton />}>
          <ConsoleDashboardBody uid={uid} m={mParam} />
        </Suspense>
      </ConsoleMain>
    </div>
  )
}

// 重いデータ取得＋集計＋本体描画を「そのまま移設」した async サーバコンポーネント。
// ★お金の値・計算・集計・select・filter・sort・通貨整形は一切変更していない（Promise.all〜算出は元のまま）。
//   B3：この関数内の“データ算出”は不変。変更したのは return 直下の JSX レイアウト（情報設計）のみ。
async function ConsoleDashboardBody({ uid, m: mParam }: { uid: string; m?: string }) {
  const supabase = await createClient()

  // owner認証では nested partners.profiles が RLS で null → service role で読取（/console は middleware でガード済）
  // 磨き④: 従来7段あったDB往復を1段に統合（deals再取得の重複解消＋直列awaitの並列化。読み取りのみ・結果不変）。
  const admin = await createServiceRoleClient()
  const [profileRes, deals, recentEventsRes, pnl, settingsRes, assignRes, dTasksRes, expensesRes, updatesRes] = await Promise.all([
    supabase.from('profiles').select('name, role, color').eq('id', uid).single(),
    getAllDeals(admin),
    admin.from('deal_events')
      .select('id, body, created_at, deal_id, deals(customer_name, customer_type, company_name, contact_name, service_id, channel, partners(profiles(name)))')
      .order('created_at', { ascending: false })
      .limit(6),
    loadProjectPnl(admin),   // A-3: 全プロジェクトP&L（lib/pnl ベースの正確な集計）
    admin.from('notification_settings').select('*').eq('id', 1).maybeSingle().then(r => r, () => ({ data: null })),
    admin.from('delivery_assignments').select('id, deal_id').then(r => r, () => ({ data: null })),
    admin.from('delivery_tasks').select('delivery_assignment_id, title, status, due_date, type').then(r => r, () => ({ data: null })),
    admin.from('expense_claims').select('delivery_assignment_id, kind, amount, status').then(r => r, () => ({ data: null })),
    admin.from('delivery_updates').select('delivery_assignment_id, body, kind, status').then(r => r, () => ({ data: null })),
  ])
  const profile = profileRes.data
  const recentEvents = recentEventsRes.data
  // 監視の最終実行（dead-man安全弁・読み取りのみ・テーブル未作成/空なら非表示にしない＝空もstale扱い）
  let monitorStale = false
  try {
    const { data: ms, error: msErr } = await admin.from('monitor_state').select('updated_at').order('updated_at', { ascending: false }).limit(1)
    if (!msErr) {
      const last = ms?.[0]?.updated_at
      monitorStale = !last || (Date.now() - new Date(last).getTime()) > 24 * 3600 * 1000
    }
  } catch { /* 監視バナーはbest-effort（ダッシュボード本体を壊さない） */ }
  const dealById = Object.fromEntries(deals.map(d => [d.id, d])) as Record<string, typeof deals[number]>

  // KPIs
  const now = new Date()
  const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // 月セレクタ用の選択肢 = 「P&Lデータのある月」＋直近12か月（当月以前・降順）
  const monthSet = new Set<string>([ym])
  for (const r of pnl.rows) { if (r.ym) monthSet.add(r.ym) }
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const monthOptions = [...monthSet].filter(m => m <= ym).sort().reverse()
  const selectedYm = mParam && monthOptions.includes(mParam) ? mParam : ym
  const selMonthLabel = `${Number(selectedYm.slice(5, 7))}月`
  const isCurrentMonth = selectedYm === ym

  // 月間目標（運営取り分=MB粗利）。notification_settings(id=1).monthly_target を best-effort 読取（上のPromise.allで取得済み）。
  const monthlyTarget = Number((settingsRes.data as { monthly_target?: number } | null)?.monthly_target ?? 0) || 0

  // 件数系（成約数/受付数/成約率）は getAllDeals から。金額系は pnl から。
  const wonCount = (k: string) => deals.filter(d => d.fixed_month?.startsWith(k) && (d.status === 'confirmed' || d.status === 'paid')).length
  const intakeCount = (k: string) => deals.filter(d => (d.created_at ?? '').slice(0, 7) === k).length

  // 選択月の前月キー
  const [selY, selM] = selectedYm.split('-').map(Number)
  const prevDt = new Date(selY, selM - 2, 1)
  const prevYm = `${prevDt.getFullYear()}-${String(prevDt.getMonth() + 1).padStart(2, '0')}`

  const cur  = sumMonth(pnl.rows, selectedYm)
  const prev = sumMonth(pnl.rows, prevYm)
  const mbMargin = cur.mbMargin
  // 旗艦③：粗利率＝既存の MB粗利／総受注 の表示用比率（新規の金額計算ではない・値の意味を変えない）。
  const grossRate = cur.revenue > 0 ? Math.round((mbMargin / cur.revenue) * 100) : null
  const curWon = wonCount(selectedYm)
  const prevWon = wonCount(prevYm)
  const curIntake = intakeCount(selectedYm)
  const winRate = curIntake > 0 ? Math.round((curWon / curIntake) * 100) : null
  // 対応中パイプライン（来月見込み）
  const pipeline = deals.filter(d => d.status === 'in_progress').reduce((s, d) => s + (d.amount || 0), 0)
  const targetPct = monthlyTarget > 0 ? Math.min(100, Math.round((mbMargin / monthlyTarget) * 100)) : null

  // 月次推移：直近6ヶ月のMB粗利
  const trend: { label: string; value: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    trend.push({ label: `${d.getMonth() + 1}月`, value: sumMonth(pnl.rows, key).mbMargin })
  }
  const trendMax = Math.max(1, ...trend.map(t => Math.abs(t.value)))

  // ④ ディメンション：MB担当別（粗利・件数）
  const byDirector = new Map<string, { count: number; margin: number }>()
  for (const row of cur.rows) {
    const key = row.directorId ?? '__none__'
    const e = byDirector.get(key) ?? { count: 0, margin: 0 }
    e.count++; e.margin += row.mbMargin
    byDirector.set(key, e)
  }
  const directorRows = [...byDirector.entries()]
    .map(([id, v]) => ({ name: id === '__none__' ? '未割当' : (pnl.directorName[id] ?? '不明'), ...v }))
    .sort((a, b) => b.margin - a.margin)

  // ④ ディメンション：デリバリー(vendor)別（委託費＋承認済経費）
  const byVendor = new Map<string, { fee: number; expense: number }>()
  for (const row of cur.rows) for (const v of row.vendorRows) {
    const e = byVendor.get(v.deliveryId) ?? { fee: 0, expense: 0 }
    e.fee += v.fee; e.expense += v.expense
    byVendor.set(v.deliveryId, e)
  }
  const vendorRows = [...byVendor.entries()]
    .map(([id, v]) => ({ name: pnl.deliveryName[id] ?? '委託先', fee: v.fee, expense: v.expense, total: v.fee + v.expense }))
    .sort((a, b) => b.total - a.total)

  // ⑥ 受注額未入力の成約案件（粗利を過小評価）
  const missingDeals = cur.rows.filter(r => r.revenueMissing)

  // 停滞案件（受付/対応中で7日以上動きなし）
  const STALL_DAYS = 7
  const stalled = deals
    .filter(d => ['received', 'in_progress'].includes(d.status) && d.updated_at && (now.getTime() - new Date(d.updated_at).getTime()) > STALL_DAYS * 86_400_000)
    .sort((a, b) => new Date(a.updated_at!).getTime() - new Date(b.updated_at!).getTime())

  const upcomingMeetings = deals
    .filter(d => d.meeting_at && new Date(d.meeting_at) >= now)
    .sort((a, b) => new Date(a.meeting_at!).getTime() - new Date(b.meeting_at!).getTime())
    .slice(0, 5)

  // お金の内訳（今月）— 受注額 → 各コスト → 残るMB粗利
  const costLines = [
    { label: 'パートナー報酬', val: cur.partnerReward, color: 'var(--c-blue)' },
    { label: 'フロンティア報酬', val: cur.frontierOverride, color: 'var(--blue-dk)' },
    { label: 'デリバリー委託費', val: cur.deliveryCost, color: 'var(--gauge-deduction)' },
    { label: 'デリバリー経費', val: cur.deliveryExpense, color: 'var(--gauge-deduction)' },
    { label: 'その他原価', val: cur.otherCost, color: 'var(--muted2)' },
  ]
  const totalCost = costLines.reduce((s, c) => s + c.val, 0)
  const barBase = Math.max(1, cur.revenue)

  // ── F-3b：プロジェクトモデルの次元（intake_type / project_status）。
  // 磨き④: deals 全行の再取得（重複クエリ）を廃止し、getAllDeals の取得列から導出（結果不変）。
  const dimByDeal: Record<string, { intake: string | null; ps: string | null }> = {}
  for (const d of deals as unknown as Array<{ id: string; intake_type?: string | null; project_status?: string | null }>) {
    dimByDeal[d.id] = { intake: d.intake_type ?? null, ps: d.project_status ?? null }
  }
  const intakeOf = (id: string) => dimByDeal[id]?.intake ?? 'referral_coop'
  const psOf = (id: string) => dimByDeal[id]?.ps ?? null

  // ② 商談パイプライン：受付/商談中 の件数・金額（パイプライン健全性）。
  const shodanStages = ([['received', '受付'], ['in_progress', '商談中']] as const).map(([key, label]) => {
    const ds = deals.filter(d => d.status === key)
    return { key, label, count: ds.length, amount: ds.reduce((s, d) => s + (d.amount || 0), 0) }
  })

  // ③ プロジェクト実行：project_status 別の件数（confirmed＝実行中プロジェクト・null は未着手とみなす）。
  const activeProjects = deals.filter(d => d.status === 'confirmed')
  const projectDist = PROJECT_STATUSES.map(ps => ({ ps, count: activeProjects.filter(d => (psOf(d.id) ?? '未着手') === ps).length }))
  const projectsTotal = activeProjects.length

  // ④ 流入経路の内訳：件数（全案件）＋受注額（成約・pnl由来）。MB直営は直営業として集計（実在パートナー扱いしない）。
  const intakeBreak = (['referral_coop', 'direct'] as const).map(intake => ({
    intake,
    count: deals.filter(d => intakeOf(d.id) === intake).length,
    revenue: pnl.rows.filter(r => intakeOf(r.id) === intake).reduce((s, r) => s + r.revenue, 0),
  }))

  // BR-C3：成約分析・KPI（読取のみ・lib/pnl計算は不変。受注額は pnl.rows.revenue をそのまま集計）。
  const pnlById = Object.fromEntries(pnl.rows.map(r => [r.id, r]))
  const totalRevenueAll = pnl.rows.reduce((s, r) => s + r.revenue, 0)
  const wonCountAll = pnl.rows.length
  const avgRevenue = wonCountAll > 0 ? Math.round(totalRevenueAll / wonCountAll) : 0
  // 商談ファネル（紹介・協力は商談を通る／直営業は商談を経ないため除外）。成約率＝成約÷商談化件数。
  const shodanDeals = deals.filter(d => intakeOf(d.id) !== 'direct')
  const funnel = {
    received: shodanDeals.filter(d => d.status === 'received').length,
    inProgress: shodanDeals.filter(d => d.status === 'in_progress').length,
    won: shodanDeals.filter(d => ['confirmed', 'paid'].includes(d.status)).length,
    lost: shodanDeals.filter(d => (d.status as string) === 'lost').length,
  }
  const shodanTotal = shodanDeals.length
  const winRateAll = shodanTotal > 0 ? Math.round((funnel.won / shodanTotal) * 100) : 0
  const pipelineAmount = deals.filter(d => ['received', 'in_progress'].includes(d.status)).reduce((s, d) => s + (d.amount || 0), 0)
  // サービス別 成約率＋受注額（全期間・上位）。
  const svcMap = new Map<string, { name: string; total: number; won: number; revenue: number }>()
  for (const d of deals) {
    const e = svcMap.get(d.service_id) ?? { name: d.services?.name ?? '—', total: 0, won: 0, revenue: 0 }
    e.total++
    if (['confirmed', 'paid'].includes(d.status)) { e.won++; e.revenue += pnlById[d.id]?.revenue ?? 0 }
    svcMap.set(d.service_id, e)
  }
  const serviceRows = [...svcMap.values()].map(s => ({ ...s, rate: s.total > 0 ? Math.round((s.won / s.total) * 100) : 0 })).sort((a, b) => b.revenue - a.revenue).slice(0, 6)
  // 流入経路別 成約率＋受注額。
  const intakeRate = (['referral_coop', 'direct'] as const).map(intake => {
    const ds = deals.filter(d => intakeOf(d.id) === intake)
    const won = ds.filter(d => ['confirmed', 'paid'].includes(d.status)).length
    return { intake, total: ds.length, won, rate: ds.length > 0 ? Math.round((won / ds.length) * 100) : 0, revenue: pnl.rows.filter(r => intakeOf(r.id) === intake).reduce((s, r) => s + r.revenue, 0) }
  })

  // ⑥ 要対応アラート（各行→当該案件詳細）：差戻し経費・期日超過タスク・課題フラグ・受注額未入力。
  // 磨き④: 4本の直列awaitを冒頭のPromise.allへ統合済み（ここは取得済みデータの加工のみ・結果不変）。
  const assignDeal: Record<string, string> = {}
  for (const a of (assignRes.data ?? []) as Array<{ id: string; deal_id: string }>) assignDeal[a.id] = a.deal_id
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  type Alert = { dealId: string; type: string; detail: string; tone: 'warn' | 'danger' }
  const alerts: Alert[] = []
  const nameOf = (id: string) => { const d = dealById[id]; return d ? customerHonorific(d) : '案件' }
  for (const d of missingDeals) alerts.push({ dealId: d.id, type: '受注額未入力', detail: nameOf(d.id), tone: 'warn' })
  for (const t of (dTasksRes.data ?? []) as Array<{ delivery_assignment_id: string; title: string; status: string; due_date: string | null; type: string }>) {
    const dealId = assignDeal[t.delivery_assignment_id]
    if (dealId && t.status !== 'done' && t.due_date && t.due_date < todayStr) alerts.push({ dealId, type: '期日超過', detail: `${nameOf(dealId)}・${t.title}`, tone: 'danger' })
  }
  for (const e of (expensesRes.data ?? []) as Array<{ delivery_assignment_id: string; kind: string; amount: number; status: string }>) {
    const dealId = assignDeal[e.delivery_assignment_id]
    if (dealId && e.status === 'rejected') alerts.push({ dealId, type: '差戻し経費', detail: `${nameOf(dealId)}・${e.kind} ¥${(e.amount ?? 0).toLocaleString()}`, tone: 'danger' })
  }
  for (const u of (updatesRes.data ?? []) as Array<{ delivery_assignment_id: string; body: string | null; kind: string; status: string }>) {
    const dealId = assignDeal[u.delivery_assignment_id]
    if (dealId && u.kind === 'flag' && u.status !== 'resolved' && u.status !== 'closed') alerts.push({ dealId, type: '課題フラグ', detail: `${nameOf(dealId)}・${(u.body ?? '').slice(0, 20)}`, tone: 'warn' })
  }

  // ── B3：表示専用の前処理（金額・件数の再計算はしない／既存配列をフィルタ・スライスするだけ）。
  const visibleServiceRows = serviceRows.filter(s => s.name !== '—')   // 空サービス名(—)行は非表示
  const firstTrendIdx = trend.findIndex(t => t.value !== 0)
  const visibleTrend = firstTrendIdx <= 0 ? trend : trend.slice(firstTrendIdx)  // 先頭の0月を畳む（寂しさ回避）

  return (
    <>
        {/* Top bar */}
        <div className="console-topbar" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '0.5px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><h1 style={{ fontSize: '1rem', fontWeight: 500, letterSpacing: '-.01em' }}>ダッシュボード</h1><PageGuide data={GUIDE_DASHBOARD} /></span>
            <MonthSelector months={monthOptions} selected={selectedYm} current={ym} />
          </div>
          {/* 情報再構造化: ファネル=本文常設・再活性化=サイドバー「パートナー」配下へ移動。残る子ページ導線は詳細分析のみ。 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button variant="secondary" size="sm" href="/console/analytics">詳細分析</Button>
            <GlobalSearchClient />
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '30px 32px 44px', maxWidth: 1120, margin: '0 auto' }}>

          {/* 安全弁: 監視が24時間以上実行されていない場合のみ警告（dead-man＝Slackハートビート廃止の引き継ぎ先） */}
          {monitorStale && (
            <div style={{ background: 'rgba(216,64,64,.08)', border: '0.5px solid rgba(216,64,64,.4)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />
              <span style={{ fontSize: '.74rem' }}><b>自己監視が24時間以上 実行されていません。</b><Link href="/console/settings/monitor" style={{ color: 'var(--c-blue)', marginLeft: 8 }}>監視の状態を確認 →</Link></span>
            </div>
          )}

          {/* ① ヒーロー：今月のMB粗利（正確）＋前月比＋月間目標進捗 */}
          <div className="page-anim shine card-hover" style={{
            position: 'relative', borderRadius: 16, padding: '22px 26px', marginBottom: 16,
            background: 'linear-gradient(120deg, var(--c-blue) 0%, var(--blue-dk) 100%)',
            color: '#fff', overflow: 'hidden', boxShadow: '0 10px 30px rgba(71,51,230,.22)',
          }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>{isCurrentMonth ? '今月' : selMonthLabel}のMB粗利</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'var(--font-sans), Inter', fontWeight: 500, fontSize: '38px', fontFeatureSettings: '"tnum" 1', letterSpacing: '-.03em', marginTop: 6, lineHeight: 1.05 }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 500, opacity: .8, marginRight: 4 }}>¥</span>
                  <CountUp value={mbMargin} />
                </div>
                {grossRate != null && <span style={{ fontSize: '.72rem', fontWeight: 500, color: 'rgba(255,255,255,.9)' }}>▲ 粗利率 {grossRate}%</span>}
                <span style={{ fontSize: '.72rem', fontWeight: 500, opacity: .92 }}>前月比 <HeroDelta cur={mbMargin} prev={prev.mbMargin} /></span>
              </div>
              {targetPct != null ? (
                <div style={{ marginTop: 14, maxWidth: 460 }}>
                  <div style={{ height: 8, borderRadius: 5, background: 'rgba(255,255,255,.22)', overflow: 'hidden' }}>
                    <div className="bar-grow" style={{ width: `${targetPct}%`, height: '100%', borderRadius: 5, background: '#fff' }} />
                  </div>
                  <div style={{ fontSize: '.64rem', color: 'rgba(255,255,255,.85)', marginTop: 6 }}>
                    月間目標 ¥{monthlyTarget.toLocaleString()} の <b>{targetPct}%</b>（残り ¥{Math.max(0, monthlyTarget - mbMargin).toLocaleString()}）
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* 最重要KPI（ヒーロー直下に集約・3指標。重複を作らない＝対応中見込みは下のパイプラインへ） */}
          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
            <KpiCard label={`${isCurrentMonth ? '今月' : selMonthLabel}の成約数`} value={curWon} suffix="件" icon="deal" delta={{ cur: curWon, prev: prevWon }} />
            <KpiCard label={`${isCurrentMonth ? '今月' : selMonthLabel}の総受注額`} value={cur.revenue} format="yen" icon="yen" delta={{ cur: cur.revenue, prev: prev.revenue }} />
            <KpiCard label="成約率" value={winRate ?? 0} suffix="%" icon="deal" />
          </div>

          {/* ⑥ 受注額未入力の透明性バナー */}
          {missingDeals.length > 0 && (
            <Link href="/console/deals" className="lift" style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '0.5px solid var(--line)', borderRadius: 12, padding: '11px 16px', marginBottom: 22, textDecoration: 'none', color: 'var(--txt)' }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--st-warn)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '.72rem', lineHeight: 1.6 }}>
                <b>受注額未入力 {missingDeals.length}件</b> の成約案件があります。粗利は入力済の範囲で正確です（未入力分は売上が過小評価されます）。クリックで案件一覧へ。
              </span>
              <span style={{ fontSize: '.66rem', fontWeight: 500 }}>→</span>
            </Link>
          )}

          {/* ② お金の内訳（今月）：受注額 → 各コスト → 残るMB粗利 */}
          <SectionTitle title="お金の内訳" />
          <div className="card-hover ui-card" style={{ background: 'var(--s-0)', border: '0.5px solid var(--line)', borderRadius: 14, padding: '18px 22px', marginBottom: 28 }}>
            <WaterRow label="総受注額" val={cur.revenue} pct={100} color="var(--c-blue)" head />
            {costLines.map((c, i) => (
              <WaterRow key={i} label={c.label} val={c.val} pct={Math.round((c.val / barBase) * 100)} color={c.color} minus />
            ))}
            <div style={{ borderTop: '1.5px solid var(--line)', marginTop: 8, paddingTop: 10 }}>
              <WaterRow label="MB粗利" val={mbMargin} pct={Math.round((Math.max(0, mbMargin) / barBase) * 100)} color={mbMargin >= 0 ? 'var(--c-blue)' : 'var(--red)'} strong />
            </div>
          </div>

          {/* ③ パイプライン（受注前の見込み・平均・商談ステージを1セクションに集約） */}
          <SectionTitle title="パイプライン" />
          <div className="card-hover ui-card" style={{ background: 'var(--s-0)', border: '0.5px solid var(--line)', borderRadius: 14, padding: '18px 22px', marginBottom: 28 }}>
            <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {/* v2.2：KPIの数値は中立（accent=neutral → var(--txt)）。塗り・色数値はヒーロー1面のみ。 */}
              <StatCard label="対応中の見込み" value={`¥${pipeline.toLocaleString()}`} />
              <StatCard label="パイプライン金額" value={`¥${pipelineAmount.toLocaleString()}`} />
              <StatCard label="平均受注額" value={`¥${avgRevenue.toLocaleString()}`} />
            </div>
          </div>

          {/* 情報再構造化（2026-07-14）: 紹介ファネルを常設セクション化（旧 /console/funnel を統合・同一計算の読み取り集計） */}
          <SectionTitle title="紹介ファネル" />
          <Suspense fallback={<div className="ui-skeleton" style={{ height: 170, borderRadius: 14, marginBottom: 18 }} />}>
            <FunnelSection />
          </Suspense>

          {/* ⑥ 要対応（アラート＋停滞＋直近商談を1セクションに統合）＋最近の動き */}
          <SectionTitle title="要対応・最近の動き" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 28 }}>
            {/* 要対応（統合）：アラート → 停滞中 → 直近の商談 */}
            <div className="card-hover ui-card" style={{ background: 'var(--s-0)', border: '0.5px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '15px 18px', borderBottom: '0.5px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: '.84rem' }}>要対応{alerts.length > 0 && <span style={{ color: 'var(--red)', marginLeft: 6 }}>{alerts.length}</span>}</b>
              </div>
              {/* アラート（差戻し経費・期日超過・課題フラグ・受注額未入力） */}
              {alerts.length === 0 ? (
                <EmptyState title="対応が必要なアラートはありません" compact />
              ) : (
                <div className="stagger">
                  {alerts.slice(0, 12).map((a, i) => (
                    <Link key={i} href={`/console/deals?deal=${a.dealId}`} className="lift row-hover" style={{ display: 'flex', gap: 11, padding: '11px 18px', borderBottom: '0.5px solid var(--line)', alignItems: 'center', textDecoration: 'none', color: 'var(--txt)' }}>
                      <StatusDot tone={a.tone}>{a.type}</StatusDot>
                      <span style={{ flex: 1, minWidth: 0, fontSize: '.72rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.detail}</span>
                      <span style={{ color: 'var(--muted)', fontSize: '.72rem', flexShrink: 0 }}>›</span>
                    </Link>
                  ))}
                </div>
              )}
              {/* 停滞中（7日以上動きなし） */}
              <div style={{ padding: '12px 18px 6px', borderTop: '0.5px solid var(--line)' }}>
                <div style={{ fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 6 }}>停滞中（7日以上動きなし）{stalled.length > 0 && <span style={{ color: 'var(--amber)' }}> ・ {stalled.length}件</span>}</div>
                {stalled.length === 0 ? (
                  <EmptyState title="停滞している案件はありません" compact />
                ) : stalled.slice(0, 3).map(d => {
                  const days = Math.floor((now.getTime() - new Date(d.updated_at!).getTime()) / 86_400_000)
                  return (
                    <Link key={d.id} href={`/console/deals?deal=${d.id}`} className="lift" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', textDecoration: 'none', color: 'var(--txt)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: '.72rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerHonorific(d)}</span>
                      <span style={{ flexShrink: 0, fontSize: '.58rem', color: 'var(--amber)', fontWeight: 500 }}>{days}日</span>
                    </Link>
                  )
                })}
              </div>
              {/* 直近の商談 */}
              <div style={{ padding: '8px 18px 14px', borderTop: '0.5px solid var(--line)' }}>
                <div style={{ fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', margin: '4px 0 6px' }}>直近の商談</div>
                {upcomingMeetings.length === 0 ? (
                  <EmptyState title="予定されている商談はありません" compact />
                ) : upcomingMeetings.slice(0, 3).map(d => {
                  const dt = new Date(d.meeting_at!)
                  const isToday = dt.toDateString() === now.toDateString()
                  return (
                    <Link key={d.id} href={`/console/deals?deal=${d.id}`} className="lift" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', textDecoration: 'none', color: 'var(--txt)' }}>
                      <span style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.58rem', color: isToday ? 'var(--c-blue)' : 'var(--muted2)', fontWeight: 500, width: 64 }}>
                        {dt.toLocaleString('ja', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: '.72rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerHonorific(d)}</span>
                      {isToday && <span style={{ flexShrink: 0, fontSize: '.52rem', fontWeight: 500, padding: '1px 6px', borderRadius: 20, background: 'var(--blue-bg)', color: 'var(--c-blue)' }}>本日</span>}
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* 最近の動き */}
            <div className="card-hover ui-card" style={{ background: 'var(--s-0)', border: '0.5px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 18px', borderBottom: '0.5px solid var(--line)' }}>
                <b style={{ fontSize: '.84rem' }}>最近の動き</b>
                <Link href="/console/deals" style={{ fontSize: '.62rem', color: 'var(--c-blue)', fontWeight: 500, textDecoration: 'none' }}>案件へ →</Link>
              </div>
              {(recentEvents ?? []).length === 0 ? (
                <EmptyState title="まだ記録がありません" compact />
              ) : (
                <div className="stagger">
                  {(recentEvents ?? []).map((e: any) => (
                    <Link key={e.id} href={`/console/deals?deal=${e.deal_id}`} className="lift row-hover" style={{ display: 'flex', gap: 11, padding: '12px 18px', borderBottom: '0.5px solid var(--line)', alignItems: 'center', textDecoration: 'none', color: 'var(--txt)' }}>
                      <span style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.58rem', color: 'var(--muted)', width: 34 }}>
                        {new Date(e.created_at).toLocaleDateString('ja', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' })}
                      </span>
                      <b style={{ flex: 1, minWidth: 0, fontSize: '.74rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {e.deals ? customerHonorific(e.deals) : ''}
                      </b>
                      {dealById[e.deal_id]?.partners?.profiles?.name && (
                        <span style={{ flexShrink: 0, fontSize: '.58rem', color: 'var(--muted2)', whiteSpace: 'nowrap' }}>担当: {dealById[e.deal_id]!.partners!.profiles!.name}</span>
                      )}
                      <span style={{ color: 'var(--muted)', fontSize: '.72rem' }}>›</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
    </>
  )
}

// 偽数字を出さない灰色スケルトン（P&L/KPI 領域の高さを確保しレイアウトシフトを抑制）。
function ConsoleDashboardSkeleton() {
  return (
    <div aria-busy="true">
      <div style={{ borderBottom: '0.5px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="ui-skeleton" style={{ width: 170, height: 22, borderRadius: 6 }} />
        <div className="ui-skeleton" style={{ width: 130, height: 30, borderRadius: 8 }} />
      </div>
      <div style={{ padding: '30px 32px 44px', maxWidth: 1120, margin: '0 auto' }}>
        <div className="ui-skeleton" style={{ height: 140, borderRadius: 16, marginBottom: 18 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
          {[0, 1, 2].map(i => <div key={i} className="ui-skeleton" style={{ height: 96, borderRadius: 14 }} />)}
        </div>
        <div className="ui-skeleton" style={{ height: 210, borderRadius: 14, marginBottom: 18 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
          <div className="ui-skeleton" style={{ height: 170, borderRadius: 14 }} />
          <div className="ui-skeleton" style={{ height: 170, borderRadius: 14 }} />
        </div>
      </div>
    </div>
  )
}

// B3：セクション見出し（情報設計の階層・余白用。表示専用・数値計算なし）。
function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ margin: '4px 2px 12px', borderBottom: '0.5px solid var(--line)', paddingBottom: 8 }}>
      <h2 style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '.08em', color: 'var(--t-tertiary)', margin: 0 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 4, lineHeight: 1.6 }}>{subtitle}</p>}
    </div>
  )
}

// ③ お金の内訳の1行（ラベル＋金額＋構成比バー）

function HeroDelta({ cur, prev }: { cur: number; prev: number }) {
  const diff = cur - prev
  const pct = prev !== 0 ? Math.round((diff / Math.abs(prev)) * 100) : null
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '±'
  return <span>{arrow} {pct != null ? `${Math.abs(pct)}%` : `¥${Math.abs(diff).toLocaleString()}`}</span>
}



