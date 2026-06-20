import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import { getAllDeals } from '@/lib/supabase/queries'
import { loadProjectPnl, sumMonth } from '@/lib/pnl-aggregate'
import ConsoleNav from '@/components/ConsoleNav'
import ChannelMark from '@/components/ChannelMark'
import GlobalSearchClient from './GlobalSearchClient'
import MonthSelector from './MonthSelector'
import { customerHonorific } from '@/lib/customer'
import ConsoleMain from '@/components/ConsolePageTransition'
import CountUp from '@/components/CountUp'
import StatusPill from '@/components/ui/StatusPill'
import StatCard from '@/components/ui/StatCard'
import { dealStatus, projectStatus as projectStatusPill, intakeType as intakePill } from '@/lib/status'
import { PROJECT_STATUSES, INTAKE_LABEL } from '@/lib/phase'

export const runtime = 'edge'

export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const supabase = await createClient()
  const { m: mParam } = await searchParams

  // owner認証では nested partners.profiles が RLS で null → service role で読取（/console は middleware でガード済）
  const admin = await createServiceRoleClient()
  const [profileRes, deals, recentEventsRes, pnl] = await Promise.all([
    supabase.from('profiles').select('name, role, color').eq('id', uid).single(),
    getAllDeals(admin),
    admin.from('deal_events')
      .select('id, body, created_at, deal_id, deals(customer_name, customer_type, company_name, contact_name, service_id, channel, partners(profiles(name)))')
      .order('created_at', { ascending: false })
      .limit(6),
    loadProjectPnl(admin),   // A-3: 全プロジェクトP&L（lib/pnl ベースの正確な集計）
  ])
  const profile = profileRes.data
  const recentEvents = recentEventsRes.data
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

  // 月間目標（運営取り分=MB粗利）。notification_settings(id=1).monthly_target を best-effort 読取。
  let monthlyTarget = 0
  try {
    const s = await admin.from('notification_settings').select('*').eq('id', 1).maybeSingle()
    monthlyTarget = Number((s.data as { monthly_target?: number } | null)?.monthly_target ?? 0) || 0
  } catch { /* 列未追加(DDL前) → 目標なし */ }

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
    { label: 'パートナー報酬（紹介/協力）', val: cur.partnerReward, color: 'var(--blue)' },
    { label: 'フロンティアoverride', val: cur.frontierOverride, color: 'var(--blue-dk)' },
    { label: 'デリバリー委託費', val: cur.deliveryCost, color: 'var(--amber)' },
    { label: 'デリバリー経費（承認済）', val: cur.deliveryExpense, color: 'var(--amber)' },
    { label: 'その他原価', val: cur.otherCost, color: 'var(--muted2)' },
  ]
  const totalCost = costLines.reduce((s, c) => s + c.val, 0)
  const barBase = Math.max(1, cur.revenue)

  // ── F-3b：プロジェクトモデルの次元（intake_type / project_status）を best-effort 取得（DDL前は空で安全）。
  const dimByDeal: Record<string, { intake: string | null; ps: string | null }> = {}
  try {
    const { data } = await admin.from('deals').select('id, intake_type, project_status')
    for (const d of (data ?? []) as Array<{ id: string; intake_type: string | null; project_status: string | null }>) dimByDeal[d.id] = { intake: d.intake_type, ps: d.project_status }
  } catch { /* 列未追加 → 既定で扱う */ }
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
    lost: shodanDeals.filter(d => d.status === 'lost').length,
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
  const assignDeal: Record<string, string> = {}
  try {
    const { data } = await admin.from('delivery_assignments').select('id, deal_id')
    for (const a of (data ?? []) as Array<{ id: string; deal_id: string }>) assignDeal[a.id] = a.deal_id
  } catch { /* 未作成 → アラート無し */ }
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  type Alert = { dealId: string; type: string; detail: string; tone: 'warn' | 'danger' }
  const alerts: Alert[] = []
  const nameOf = (id: string) => { const d = dealById[id]; return d ? customerHonorific(d) : '案件' }
  for (const d of missingDeals) alerts.push({ dealId: d.id, type: '受注額未入力', detail: nameOf(d.id), tone: 'warn' })
  try {
    const { data } = await admin.from('delivery_tasks').select('delivery_assignment_id, title, status, due_date, type')
    for (const t of (data ?? []) as Array<{ delivery_assignment_id: string; title: string; status: string; due_date: string | null; type: string }>) {
      const dealId = assignDeal[t.delivery_assignment_id]
      if (dealId && t.status !== 'done' && t.due_date && t.due_date < todayStr) alerts.push({ dealId, type: '期日超過', detail: `${nameOf(dealId)}・${t.title}`, tone: 'danger' })
    }
  } catch { /* 未作成 */ }
  try {
    const { data } = await admin.from('expense_claims').select('delivery_assignment_id, kind, amount, status')
    for (const e of (data ?? []) as Array<{ delivery_assignment_id: string; kind: string; amount: number; status: string }>) {
      const dealId = assignDeal[e.delivery_assignment_id]
      if (dealId && e.status === 'rejected') alerts.push({ dealId, type: '差戻し経費', detail: `${nameOf(dealId)}・${e.kind} ¥${(e.amount ?? 0).toLocaleString()}`, tone: 'danger' })
    }
  } catch { /* 未作成 */ }
  try {
    const { data } = await admin.from('delivery_updates').select('delivery_assignment_id, body, kind, status')
    for (const u of (data ?? []) as Array<{ delivery_assignment_id: string; body: string | null; kind: string; status: string }>) {
      const dealId = assignDeal[u.delivery_assignment_id]
      if (dealId && u.kind === 'flag' && u.status !== 'resolved' && u.status !== 'closed') alerts.push({ dealId, type: '課題フラグ', detail: `${nameOf(dealId)}・${(u.body ?? '').slice(0, 20)}`, tone: 'warn' })
    }
  } catch { /* 未作成 */ }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />

      <ConsoleMain>
        {/* Top bar */}
        <div className="console-topbar" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h1 style={{ fontSize: '1rem', fontWeight: 900, letterSpacing: '-.01em' }}>ダッシュボード</h1>
            <MonthSelector months={monthOptions} selected={selectedYm} current={ym} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/console/analytics" className="btn btn-g" style={{ fontSize: '.7rem', fontWeight: 700, padding: '7px 14px', textDecoration: 'none' }}>📊 詳細分析</Link>
            <GlobalSearchClient />
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '30px 32px 44px', maxWidth: 1120, margin: '0 auto' }}>

          {/* ヒーロー：今月のMB粗利（正確）＋前月比＋月間目標進捗 */}
          <div className="page-anim shine card-hover" style={{
            position: 'relative', borderRadius: 16, padding: '22px 26px', marginBottom: 18,
            background: 'linear-gradient(120deg, var(--blue) 0%, var(--blue-dk) 100%)',
            color: '#fff', overflow: 'hidden', boxShadow: '0 10px 30px rgba(71,51,230,.22)',
          }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>{isCurrentMonth ? '今月' : selMonthLabel}のMB粗利（正確・プロジェクトP&L集計）</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '2.1rem', letterSpacing: '-.02em', marginTop: 6, lineHeight: 1.05 }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 600, opacity: .8, marginRight: 4 }}>¥</span>
                  <CountUp value={mbMargin} />
                </div>
                <span style={{ fontSize: '.72rem', fontWeight: 700, opacity: .92 }}>前月比 <HeroDelta cur={mbMargin} prev={prev.mbMargin} /></span>
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
              ) : (
                <div style={{ fontSize: '.64rem', color: 'rgba(255,255,255,.7)', marginTop: 10 }}>
                  月間目標は設定からご登録ください（進捗バーを表示します）。
                </div>
              )}
              <div style={{ fontSize: '.66rem', color: 'rgba(255,255,255,.8)', marginTop: 12, lineHeight: 1.7 }}>
                総受注額 <b className="tnum">¥{cur.revenue.toLocaleString()}</b> − コスト計 <b className="tnum">¥{totalCost.toLocaleString()}</b> = MB粗利 <b className="tnum">¥{mbMargin.toLocaleString()}</b>（成約{curWon}件）
              </div>
            </div>
          </div>

          {/* ⑥ 受注額未入力の透明性バナー */}
          {missingDeals.length > 0 && (
            <Link href="/console/deals" className="lift" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--amber-bg)', border: '1px solid var(--amber)', borderRadius: 12, padding: '11px 16px', marginBottom: 18, textDecoration: 'none', color: '#7A5A14' }}>
              <span style={{ fontSize: '1rem' }}>⚠️</span>
              <span style={{ flex: 1, fontSize: '.72rem', lineHeight: 1.6 }}>
                <b>受注額未入力 {missingDeals.length}件</b> の成約案件があります。粗利は入力済の範囲で正確です（未入力分は売上が過小評価されます）。クリックで案件一覧へ。
              </span>
              <span style={{ fontSize: '.66rem', fontWeight: 700 }}>→</span>
            </Link>
          )}

          {/* 本質KPI 4枚 */}
          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
            <KpiCard label="今月成約数" value={curWon} suffix="件" icon="deal" accent="var(--blue)" delta={{ cur: curWon, prev: prevWon }} />
            <KpiCard label="今月の総受注額" value={cur.revenue} format="yen" icon="yen" accent="var(--green)" delta={{ cur: cur.revenue, prev: prev.revenue }} />
            <KpiCard label="成約率（成約÷受付）" value={winRate ?? 0} suffix="%" icon="deal" accent="var(--amber)" sub={`${curWon} / ${curIntake} 件`} />
            <KpiCard label="対応中パイプライン" value={pipeline} format="yen" icon="yen" accent="var(--muted2)" sub="来月見込み（対応中の見込み額）" />
          </div>

          {/* ③ お金の内訳（今月）：受注額 → 各コスト → 残るMB粗利 */}
          <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '18px 22px', marginBottom: 18 }}>
            <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 2 }}>お金の内訳（{isCurrentMonth ? '今月' : selMonthLabel}）</b>
            <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 16 }}>受注額から出ていくお金を引いて、残るMB粗利</div>
            {/* 受注額 */}
            <WaterRow label="総受注額" val={cur.revenue} pct={100} color="var(--green)" head />
            {costLines.map((c, i) => (
              <WaterRow key={i} label={c.label} val={c.val} pct={Math.round((c.val / barBase) * 100)} color={c.color} minus />
            ))}
            <div style={{ borderTop: '1.5px solid var(--line)', marginTop: 8, paddingTop: 10 }}>
              <WaterRow label="残るMB粗利" val={mbMargin} pct={Math.round((Math.max(0, mbMargin) / barBase) * 100)} color={mbMargin >= 0 ? 'var(--blue)' : 'var(--red)'} strong />
            </div>
          </div>

          {/* F-3b ②③④：商談パイプライン / プロジェクト実行 / 流入経路（プロジェクトモデルの次元） */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
            {/* ② 商談パイプライン */}
            <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px' }}>
              <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 2 }}>商談パイプライン</b>
              <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 14 }}>商談ステージ別の件数・見込み額（成約前）</div>
              {shodanStages.map((s, i) => (
                <Link key={s.key} href={`/console/deals`} className="lift" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < shodanStages.length - 1 ? '1px solid #F2F2F6' : 'none', textDecoration: 'none', color: 'var(--txt)' }}>
                  <StatusPill {...dealStatus(s.key)} />
                  <span style={{ flex: 1, fontFamily: 'Inter', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-.02em' }}>{s.count}<span style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 600, marginLeft: 3 }}>件</span></span>
                  <span className="tnum" style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--muted2)' }}>見込 ¥{s.amount.toLocaleString()}</span>
                </Link>
              ))}
            </div>

            {/* ④ 流入経路の内訳 */}
            <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px' }}>
              <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 2 }}>流入経路の内訳</b>
              <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 14 }}>紹介・協力／直営業（件数・受注額）</div>
              {intakeBreak.map((b, i) => (
                <div key={b.intake} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < intakeBreak.length - 1 ? '1px solid #F2F2F6' : 'none' }}>
                  <StatusPill {...intakePill(b.intake)} />
                  <span style={{ flex: 1, fontFamily: 'Inter', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-.02em' }}>{b.count}<span style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 600, marginLeft: 3 }}>件</span></span>
                  <span className="tnum" style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--muted2)' }}>受注 ¥{b.revenue.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ③ プロジェクト実行：project_status 分布 */}
          <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 2 }}>プロジェクト実行</b>
                <div style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>実行中プロジェクトの状態分布（成約後）</div>
              </div>
              <span style={{ fontFamily: 'Inter', fontSize: '.74rem', fontWeight: 800, color: 'var(--muted2)' }}>計 {projectsTotal} 件</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
              {projectDist.map(p => {
                const pill = projectStatusPill(p.ps)
                return (
                  <Link key={p.ps} href={`/console/deals`} className="lift" style={{ textDecoration: 'none', color: 'var(--txt)', background: 'var(--bg2)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'Inter', fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1 }}>{p.count}</div>
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>{pill && <StatusPill size="sm" {...pill} />}</div>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* BR-C3：成約分析・KPI（成約率/ファネル/平均受注額/サービス別・流入別 成約率＋受注額）。読取のみ。 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
            <StatCard label="全体 成約率" value={winRateAll} unit="%" accent="green" sub={`成約 ${funnel.won} / 商談化 ${shodanTotal} 件`} />
            <StatCard label="平均受注額" value={`¥${avgRevenue.toLocaleString()}`} accent="blue" sub={`成約 ${wonCountAll} 件の平均`} />
            <StatCard label="パイプライン金額" value={`¥${pipelineAmount.toLocaleString()}`} accent="amber" sub="受付・商談中の見込み額" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
            {/* 商談→成約ファネル */}
            <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px' }}>
              <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 2 }}>商談 → 成約 ファネル</b>
              <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 16 }}>紹介・協力の商談化件数を基準（直営業は商談を経ないため除外）</div>
              {([['受付', funnel.received, 'var(--amber)'], ['商談中', funnel.inProgress, 'var(--blue)'], ['成約', funnel.won, 'var(--green)'], ['不成立', funnel.lost, 'var(--muted2)']] as const).map(([label, n, color]) => {
                const w = shodanTotal > 0 ? Math.round((n / shodanTotal) * 100) : 0
                return (
                  <div key={label} style={{ padding: '7px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '.72rem', fontWeight: 600 }}>{label}</span>
                      <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--muted2)' }}>{n}件 <span style={{ fontSize: '.58rem' }}>({w}%)</span></span>
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: 'var(--bg2)', overflow: 'hidden' }}><div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 4 }} /></div>
                  </div>
                )
              })}
            </div>

            {/* 流入経路別 成約率＋受注額 */}
            <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px' }}>
              <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 2 }}>流入経路別 成約率・受注額</b>
              <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 16 }}>紹介・協力／直営業の強み・弱み</div>
              {intakeRate.map((r, i) => (
                <div key={r.intake} style={{ padding: '9px 0', borderBottom: i < intakeRate.length - 1 ? '1px solid #F2F2F6' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <StatusPill size="sm" {...intakePill(r.intake)} />
                    <span style={{ flex: 1, fontSize: '.7rem', color: 'var(--muted2)' }}>成約 {r.won}/{r.total}件</span>
                    <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '.9rem' }}>{r.rate}<span style={{ fontSize: '.6rem', fontWeight: 600, color: 'var(--muted2)' }}>%</span></span>
                  </div>
                  <div style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>受注額 <b className="tnum" style={{ color: 'var(--txt)', fontFamily: 'Inter' }}>¥{r.revenue.toLocaleString()}</b></div>
                </div>
              ))}
            </div>
          </div>

          {/* サービス別 成約率＋受注額 */}
          <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px', marginBottom: 18 }}>
            <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 2 }}>サービス別 成約率・受注額</b>
            <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 14 }}>受注額の大きい順（上位）</div>
            {serviceRows.length === 0 ? <p style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>データがありません。</p> : serviceRows.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr auto', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: i < serviceRows.length - 1 ? '1px solid #F2F2F6' : 'none' }}>
                <span style={{ fontSize: '.72rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}<span style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 400, marginLeft: 5 }}>{s.won}/{s.total}件</span></span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 5, borderRadius: 4, background: 'var(--bg2)', overflow: 'hidden' }}><div style={{ width: `${s.rate}%`, height: '100%', background: 'var(--green)', borderRadius: 4 }} /></div>
                  <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', width: 30, textAlign: 'right' }}>{s.rate}%</span>
                </div>
                <span className="tnum" style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.78rem', textAlign: 'right' }}>¥{s.revenue.toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* ④ ディメンション別：MB担当別 / デリバリー別 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
            <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px' }}>
              <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 2 }}>MB担当別の粗利</b>
              <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 14 }}>{isCurrentMonth ? '今月' : selMonthLabel}の成約・担当別</div>
              {directorRows.length === 0 ? <p style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>該当データがありません。</p> : directorRows.map((d, i) => {
                const w = Math.round((Math.max(0, d.margin) / Math.max(1, directorRows[0].margin)) * 100)
                return (
                  <div key={i} style={{ padding: '7px 0', borderBottom: i < directorRows.length - 1 ? '1px solid #F2F2F6' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '.72rem', fontWeight: 600 }}>{d.name} <span style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 400 }}>· {d.count}件</span></span>
                      <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.74rem', fontWeight: 700, color: d.margin >= 0 ? 'var(--txt)' : 'var(--red)' }}>¥{d.margin.toLocaleString()}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 4, background: 'var(--bg2)', overflow: 'hidden' }}><div style={{ width: `${w}%`, height: '100%', background: 'var(--blue)', borderRadius: 4 }} /></div>
                  </div>
                )
              })}
            </div>

            <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px' }}>
              <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 2 }}>デリバリー別の原価</b>
              <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 14 }}>{isCurrentMonth ? '今月' : selMonthLabel}の委託費＋承認済経費</div>
              {vendorRows.length === 0 ? <p style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>デリバリー委託はありません。</p> : vendorRows.map((v, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < vendorRows.length - 1 ? '1px solid #F2F2F6' : 'none' }}>
                  <span style={{ fontSize: '.72rem', fontWeight: 600, minWidth: 0 }}>{v.name}</span>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexShrink: 0 }}>
                    <span style={{ fontSize: '.56rem', color: 'var(--muted2)' }}>委託費 <b className="tnum" style={{ fontFamily: 'Inter', color: 'var(--txt)' }}>¥{v.fee.toLocaleString()}</b></span>
                    <span style={{ fontSize: '.56rem', color: 'var(--muted2)' }}>経費 <b className="tnum" style={{ fontFamily: 'Inter', color: 'var(--txt)' }}>¥{v.expense.toLocaleString()}</b></span>
                    <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.74rem', fontWeight: 700, color: 'var(--amber)' }}>¥{v.total.toLocaleString()}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ⑥ 要対応アラート：差戻し経費・期日超過・課題フラグ・受注額未入力（各行→当該案件詳細） */}
          <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
            <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: '.84rem' }}>要対応アラート{alerts.length > 0 && <span style={{ color: 'var(--red)', marginLeft: 6 }}>{alerts.length}</span>}</b>
              <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>クリックで該当案件へ</span>
            </div>
            {alerts.length === 0 ? (
              <p style={{ padding: '18px', fontSize: '.72rem', color: 'var(--muted2)', textAlign: 'center' }}>対応が必要な項目はありません。すべて順調です。</p>
            ) : (
              <div className="stagger">
                {alerts.slice(0, 12).map((a, i) => (
                  <Link key={i} href={`/console/deals?deal=${a.dealId}`} className="lift row-hover" style={{ display: 'flex', gap: 11, padding: '11px 18px', borderBottom: '1px solid #F2F2F6', alignItems: 'center', textDecoration: 'none', color: 'var(--txt)' }}>
                    <StatusPill size="sm" tone={a.tone}>{a.type}</StatusPill>
                    <span style={{ flex: 1, minWidth: 0, fontSize: '.72rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.detail}</span>
                    <span style={{ color: 'var(--muted)', fontSize: '.72rem', flexShrink: 0 }}>›</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
            {/* 月次推移：直近6ヶ月のMB粗利 */}
            <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px' }}>
              <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 4 }}>MB粗利の推移</b>
              <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 16 }}>直近6ヶ月（プロジェクトP&L集計）</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 130 }}>
                {trend.map((t, i) => {
                  const h = Math.max(3, Math.round((Math.max(0, t.value) / trendMax) * 110))
                  const isLast = i === trend.length - 1
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <span className="tnum" style={{ fontSize: '.52rem', color: 'var(--muted2)', fontFamily: 'Inter' }}>{Math.abs(t.value) >= 1000 ? `${Math.round(t.value / 1000)}k` : t.value}</span>
                      <div className="bar-grow" style={{ width: '100%', maxWidth: 30, height: h, borderRadius: '6px 6px 0 0', background: isLast ? 'var(--blue)' : 'var(--blue-bg)' }} />
                      <span style={{ fontSize: '.56rem', color: isLast ? 'var(--blue)' : 'var(--muted2)', fontWeight: isLast ? 700 : 400 }}>{t.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 要対応：停滞案件＋直近の商談 */}
            <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: '.84rem' }}>要対応</b>
                <Link href="/console/deals" style={{ fontSize: '.62rem', color: 'var(--blue)', fontWeight: 700, textDecoration: 'none' }}>案件へ →</Link>
              </div>
              <div style={{ padding: '12px 18px 6px' }}>
                <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 6 }}>停滞中（7日以上動きなし）{stalled.length > 0 && <span style={{ color: 'var(--amber)' }}> · {stalled.length}件</span>}</div>
                {stalled.length === 0 ? (
                  <p style={{ fontSize: '.66rem', color: 'var(--muted2)', padding: '2px 0 8px' }}>停滞している案件はありません。</p>
                ) : stalled.slice(0, 3).map(d => {
                  const days = Math.floor((now.getTime() - new Date(d.updated_at!).getTime()) / 86_400_000)
                  return (
                    <Link key={d.id} href={`/console/deals?deal=${d.id}`} className="lift" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', textDecoration: 'none', color: 'var(--txt)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: '.72rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerHonorific(d)}</span>
                      <span style={{ flexShrink: 0, fontSize: '.58rem', color: 'var(--amber)', fontWeight: 700 }}>{days}日</span>
                    </Link>
                  )
                })}
              </div>
              <div style={{ padding: '8px 18px 14px', borderTop: '1px solid #F2F2F6' }}>
                <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted2)', margin: '4px 0 6px' }}>直近の商談</div>
                {upcomingMeetings.length === 0 ? (
                  <p style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>予定されている商談はありません。</p>
                ) : upcomingMeetings.slice(0, 3).map(d => {
                  const dt = new Date(d.meeting_at!)
                  const isToday = dt.toDateString() === now.toDateString()
                  return (
                    <Link key={d.id} href={`/console/deals?deal=${d.id}`} className="lift" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', textDecoration: 'none', color: 'var(--txt)' }}>
                      <span style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.58rem', color: isToday ? 'var(--blue)' : 'var(--muted2)', fontWeight: 700, width: 64 }}>
                        {dt.toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: '.72rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerHonorific(d)}</span>
                      {isToday && <span style={{ flexShrink: 0, fontSize: '.52rem', fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: 'var(--blue-bg)', color: 'var(--blue)' }}>本日</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 最近の動き */}
          <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 18px', borderBottom: '1px solid var(--line)' }}>
              <b style={{ fontSize: '.84rem' }}>最近の動き</b>
              <Link href="/console/deals" style={{ fontSize: '.62rem', color: 'var(--blue)', fontWeight: 700, textDecoration: 'none' }}>案件へ →</Link>
            </div>
            {(recentEvents ?? []).length === 0 ? (
              <p style={{ padding: '16px 18px', fontSize: '.72rem', color: 'var(--muted2)' }}>まだ記録がありません</p>
            ) : (
              <div className="stagger">
                {(recentEvents ?? []).map((e: any) => (
                  <Link key={e.id} href={`/console/deals?deal=${e.deal_id}`} className="lift row-hover" style={{ display: 'flex', gap: 11, padding: '12px 18px', borderBottom: '1px solid #F2F2F6', alignItems: 'center', textDecoration: 'none', color: 'var(--txt)' }}>
                    <span style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.58rem', color: 'var(--muted)', width: 34 }}>
                      {new Date(e.created_at).toLocaleDateString('ja', { month: 'numeric', day: 'numeric' })}
                    </span>
                    <b style={{ flex: 1, minWidth: 0, fontSize: '.74rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.deals ? customerHonorific(e.deals) : ''}
                    </b>
                    {e.deals?.channel && <ChannelMark channel={e.deals.channel} showLabel={false} />}
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
      </ConsoleMain>
    </div>
  )
}

// ③ お金の内訳の1行（ラベル＋金額＋構成比バー）
function WaterRow({ label, val, pct, color, minus, head, strong }: { label: string; val: number; pct: number; color: string; minus?: boolean; head?: boolean; strong?: boolean }) {
  return (
    <div style={{ padding: head ? '2px 0 9px' : '6px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: strong || head ? '.76rem' : '.68rem', fontWeight: strong || head ? 800 : 500, color: minus ? 'var(--muted2)' : 'var(--txt)' }}>{minus ? '− ' : ''}{label}</span>
        <span className="tnum" style={{ fontFamily: 'Inter', fontSize: strong || head ? '.84rem' : '.72rem', fontWeight: strong || head ? 800 : 600, color: strong ? color : minus ? 'var(--txt)' : 'var(--txt)' }}>
          {minus && val > 0 ? '−' : ''}¥{Math.abs(val).toLocaleString()}
        </span>
      </div>
      <div style={{ height: head || strong ? 7 : 5, borderRadius: 4, background: 'var(--bg2)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
    </div>
  )
}

function HeroDelta({ cur, prev }: { cur: number; prev: number }) {
  const diff = cur - prev
  const pct = prev !== 0 ? Math.round((diff / Math.abs(prev)) * 100) : null
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '±'
  return <span>{arrow} {pct != null ? `${Math.abs(pct)}%` : `¥${Math.abs(diff).toLocaleString()}`}</span>
}

function DeltaBadge({ cur, prev }: { cur: number; prev: number }) {
  const diff = cur - prev
  const pct = prev !== 0 ? Math.round((diff / Math.abs(prev)) * 100) : null
  const up = diff >= 0
  const color = diff === 0 ? 'var(--muted2)' : up ? 'var(--green)' : 'var(--red)'
  const arrow = diff === 0 ? '±' : up ? '▲' : '▼'
  return (
    <span style={{ fontSize: '.58rem', fontWeight: 700, color }}>
      {arrow}{pct != null ? `${Math.abs(pct)}%` : Math.abs(diff)}
      <span style={{ color: 'var(--muted2)', fontWeight: 400, marginLeft: 4 }}>前月比</span>
    </span>
  )
}

function KpiIcon({ id }: { id: string }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 } as const
  switch (id) {
    case 'deal':  return <svg {...p}><path d="M20 6L9 17l-5-5" /></svg>
    case 'yen':   return <svg {...p}><path d="M12 4l-4 7h8l-4-7zM12 11v9M8 14h8M8 17h8" /></svg>
    case 'users': return <svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
    case 'alert': return <svg {...p}><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg>
    case 'cost':  return <svg {...p}><path d="M12 2v20M17 7H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
    default:      return null
  }
}

function KpiCard({ label, value, suffix, format, icon, accent, alert, delta, sub }: {
  label: string; value: number; suffix?: string; format?: 'number' | 'yen'
  icon: string; accent: string; alert?: boolean
  delta?: { cur: number; prev: number }; sub?: string
}) {
  const TINT: Record<string, string> = {
    'var(--blue)': 'var(--blue-bg)', 'var(--green)': 'var(--green-bg)', 'var(--amber)': 'var(--amber-bg)',
    'var(--muted2)': 'var(--bg2)',
  }
  const numColor = alert ? 'var(--red)' : 'var(--txt)'
  const badgeColor = alert ? 'var(--red)' : accent
  const badgeBg = alert ? 'var(--red-bg)' : (TINT[accent] ?? 'var(--blue-bg)')
  return (
    <div className="card-hover" style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 700, paddingTop: 4 }}>{label}</div>
        <span style={{
          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: badgeBg, color: badgeColor,
        }}>
          <KpiIcon id={icon} />
        </span>
      </div>
      <div style={{ fontFamily: 'Inter', fontSize: '1.5rem', fontWeight: 800, marginTop: 8, fontFeatureSettings: '"tnum"', letterSpacing: '-.02em', color: numColor }}>
        <CountUp value={value} format={format} />
        {suffix && <small style={{ fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 400, marginLeft: 3, color: 'var(--muted2)' }}>{suffix}</small>}
      </div>
      <div style={{ marginTop: 5, minHeight: 14 }}>
        {delta ? <DeltaBadge cur={delta.cur} prev={delta.prev} />
          : sub ? <span style={{ fontSize: '.58rem', color: 'var(--muted2)' }}>{sub}</span> : null}
      </div>
    </div>
  )
}
