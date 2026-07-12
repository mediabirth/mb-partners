import { redirect } from 'next/navigation'
import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
import CountUp from '@/components/CountUp'
import FrontierSection from './FrontierSection'
import SupplierSection from './SupplierSection'
import SupplierSettings from './SupplierSettings'

/**
 * 統合ダッシュボード（役割ページの一本化・2026-07-13）。
 * 旧 /app/frontier・/app/supplier を単一ページに統合：①今月のハイライト（役割横断ヒーロー）
 * ②あなたの会社（サプライヤー）③あなたの網（フロンティア）④あなたの紹介（全員）。
 * 表示は保有役割のみ。役割なし（リファラルのみ）は /app へ（従来の役割ページと同じ文法）。
 */
export default async function UnifiedDashboardPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: me } = await supabase.from('partners').select('id, is_frontier, supplier_rate_card').eq('profile_id', user.id).single()
  if (!me) redirect('/app')

  const admin = await createServiceRoleClient()
  const { data: myBrands } = await admin.from('services').select('id').eq('supplier_partner_id', me.id)
  const isSupplier = !!me.supplier_rate_card || (myBrands ?? []).length > 0
  const isFrontier = !!me.is_frontier
  if (!isFrontier && !isSupplier) redirect('/app')

  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const inMonth = (d: { fixed_month?: string | null; created_at: string }) => ((d.fixed_month ?? d.created_at) || '').slice(0, 7) === ym

  // ④あなたの紹介（本人の紹介成果・全役割共通）
  const { data: ownDealsRaw } = await admin.from('deals').select('amount, status, fixed_month, created_at').eq('partner_id', me.id).neq('status', 'lost')
  const ownDeals = (ownDealsRaw ?? []).filter(d => inMonth(d) && (d.status === 'confirmed' || d.status === 'paid'))
  const ownReward = ownDeals.reduce((s, d) => s + (Number(d.amount) || 0), 0)

  // ③網の成果（今月のオーバーライド・支払と同一規則＝lib/frontier）
  let netOverride = 0, teamN = 0
  if (isFrontier) {
    const [{ computeOverrides }, { loadSupplierFrontiers }] = await Promise.all([import('@/lib/frontier'), import('@/lib/frontier-payout')])
    const { data: subs } = await admin.from('partners').select('id, frontier_id, frontier_linked_at').eq('frontier_id', me.id)
    teamN = (subs ?? []).length
    if (teamN) {
      const subIds = (subs ?? []).map(s => s.id)
      const { data: deals } = await admin.from('deals').select('partner_id, amount, status, fixed_month, created_at, fee_snapshot').in('partner_id', subIds)
      const linkById: Record<string, { frontier_id: string | null; frontier_linked_at: string | null }> = {}
      for (const s of subs ?? []) linkById[s.id] = { frontier_id: s.frontier_id, frontier_linked_at: s.frontier_linked_at }
      const sf = await loadSupplierFrontiers(admin)
      netOverride = computeOverrides((deals ?? []) as never, linkById, ym, sf)[me.id] ?? 0
    }
  }

  // ②会社の成約（自社ブランドの今月受注額）
  let companyRevenue = 0, companyCount = 0
  if (isSupplier && (myBrands ?? []).length) {
    const { data: cds } = await admin.from('deals').select('status, fixed_month, created_at, deal_items(revenue)').in('service_id', (myBrands ?? []).map(b => b.id)).in('status', ['confirmed', 'paid'])
    for (const d of (cds ?? []) as { status: string; fixed_month: string | null; created_at: string; deal_items: { revenue: number | null }[] | null }[]) {
      if (!inMonth(d)) continue
      companyCount += 1
      companyRevenue += (d.deal_items ?? []).reduce((s, it) => s + (Number(it.revenue) || 0), 0)
    }
  }

  const STAT: React.CSSProperties = { fontSize: '.6rem', opacity: .85 }
  const NUM: React.CSSProperties = { display: 'block', fontFamily: 'Inter', fontSize: '1.05rem', fontWeight: 500, marginTop: 3 }
  const H2: React.CSSProperties = { fontSize: '.92rem', fontWeight: 500, margin: '0 20px', padding: '22px 0 2px' }

  return (
    <div className="page-anim" style={{ paddingBottom: 8 }}>
      {/* ① 今月のハイライト（役割横断・保有役割の統計のみ） */}
      <div className="shine" style={{ margin: '18px 20px 0', background: 'linear-gradient(135deg,#5240F2 0%,#4733E6 52%,#3A28CE 100%)', color: '#fff', borderRadius: 18, padding: '20px 22px 16px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -50, top: -50, width: 180, height: 180, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, border: '1.5px solid rgba(255,255,255,.14)', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', inset: 30, border: '1.5px solid rgba(255,255,255,.2)', borderRadius: '50%' }} />
        </div>
        <div style={{ fontSize: '.56rem', letterSpacing: '.22em', opacity: .85, textTransform: 'uppercase', marginBottom: 10, position: 'relative' }}>今月のハイライト</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', position: 'relative' }}>
          <div style={STAT}>あなたの紹介<span style={NUM}>¥<CountUp value={ownReward} /><span style={{ fontSize: '.6rem', fontWeight: 400, marginLeft: 5 }}>{ownDeals.length}件</span></span></div>
          {isFrontier && <div style={STAT}>網の成果（オーバーライド）<span style={NUM}>¥<CountUp value={netOverride} /><span style={{ fontSize: '.6rem', fontWeight: 400, marginLeft: 5 }}>{teamN}名</span></span></div>}
          {isSupplier && <div style={STAT}>会社の成約（受注額）<span style={NUM}>¥<CountUp value={companyRevenue} /><span style={{ fontSize: '.6rem', fontWeight: 400, marginLeft: 5 }}>{companyCount}件</span></span></div>}
        </div>
      </div>

      {/* ② あなたの会社（サプライヤーのみ） */}
      {isSupplier && (
        <section id="company">
          <h2 style={H2}>あなたの会社</h2>
          <SupplierSection />
          <SupplierSettings />
        </section>
      )}

      {/* ③ あなたの網（フロンティア） */}
      {isFrontier && (
        <section id="network">
          <h2 style={H2}>あなたの網</h2>
          <FrontierSection />
        </section>
      )}

      {/* ④ あなたの紹介（全員） */}
      <section id="referral" style={{ padding: '22px 20px 4px' }}>
        <h2 style={{ fontSize: '.92rem', fontWeight: 500, marginBottom: 10 }}>あなたの紹介</h2>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.74rem', color: 'var(--muted2)' }}>今月の成約報酬</div>
            <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.05rem', fontWeight: 500, marginTop: 2 }}>¥{ownReward.toLocaleString()}<span style={{ fontSize: '.62rem', fontWeight: 400, color: 'var(--muted2)', marginLeft: 6 }}>{ownDeals.length}件</span></div>
          </div>
          <a href="/app/cases" style={{ fontSize: '.66rem', color: 'var(--c-blue)', textDecoration: 'none', flexShrink: 0 }}>案件 ›</a>
          <a href="/app/rewards" style={{ fontSize: '.66rem', color: 'var(--c-blue)', textDecoration: 'none', flexShrink: 0 }}>報酬 ›</a>
        </div>
      </section>
      <div style={{ height: 16 }} />
    </div>
  )
}
