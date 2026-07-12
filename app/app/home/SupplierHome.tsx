import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
import CountUp from '@/components/CountUp'
import FrontierInvite from '../frontier/FrontierInvite'
import SupplierSection from '../dashboard/SupplierSection'
import SupplierSettings from '../dashboard/SupplierSettings'
import FrontierSection from '../dashboard/FrontierSection'

/**
 * ペルソナ・ホーム（サプライヤー）: ホーム＝ミニコンソール（2026-07-13・勝彦診断）。
 * 「商品を出し・紹介もし・リファラルも生む」会社の全体像を、ログイン直後の1画面で。
 * 数字はコンソール/請求と同一ソース（computeCharges・computeOverrides）＝乖離ゼロ。
 * リファラル獲得が最優先のため、招待・紹介のアクション帯をヒーロー直下に置く。
 */
export default async function SupplierHome() {
  const user = await getCachedUser()
  if (!user) return null
  const supabase = await createClient()
  const { data: me } = await supabase.from('partners').select('id, is_frontier, supplier_rate_card').eq('profile_id', user.id).maybeSingle()
  if (!me) return null
  const admin = await createServiceRoleClient()
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const inMonth = (d: { fixed_month?: string | null; created_at: string }) => ((d.fixed_month ?? d.created_at) || '').slice(0, 7) === ym

  // 会社: 自社ブランドの今月受注額・進行中件数
  const { data: brands } = await admin.from('services').select('id, name, active').eq('supplier_partner_id', me.id).order('sort')
  const brandIds = (brands ?? []).map(b => b.id)
  let companyRevenue = 0, companyCount = 0, inProgress = 0
  if (brandIds.length) {
    const { data: cds } = await admin.from('deals').select('status, fixed_month, created_at, deal_items(revenue)').in('service_id', brandIds).neq('status', 'lost')
    for (const d of (cds ?? []) as { status: string; fixed_month: string | null; created_at: string; deal_items: { revenue: number | null }[] | null }[]) {
      if (d.status === 'received' || d.status === 'in_progress') inProgress += 1
      if ((d.status === 'confirmed' || d.status === 'paid') && inMonth(d)) {
        companyCount += 1
        companyRevenue += (d.deal_items ?? []).reduce((s, it) => s + (Number(it.revenue) || 0), 0)
      }
    }
  }

  // 網: 配下と今月の還元（支払と同一規則）
  let teamN = 0, monthOverride = 0
  if (me.is_frontier) {
    const [{ computeOverrides }, { loadSupplierFrontiers }] = await Promise.all([import('@/lib/frontier'), import('@/lib/frontier-payout')])
    const { data: subs } = await admin.from('partners').select('id, frontier_id, frontier_linked_at').eq('frontier_id', me.id)
    teamN = (subs ?? []).length
    if (teamN) {
      const subIds = (subs ?? []).map(s => s.id)
      const { data: deals } = await admin.from('deals').select('partner_id, amount, status, fixed_month, created_at, fee_snapshot').in('partner_id', subIds)
      const linkById: Record<string, { frontier_id: string | null; frontier_linked_at: string | null }> = {}
      for (const s of subs ?? []) linkById[s.id] = { frontier_id: s.frontier_id, frontier_linked_at: s.frontier_linked_at }
      const sf = await loadSupplierFrontiers(admin)
      monthOverride = computeOverrides((deals ?? []) as never, linkById, ym, sf)[me.id] ?? 0
    }
  }

  // お金: 今月のお支払い見込み（コンソールのクローズと同一計算）
  let previewTotal = 0
  try {
    const { computeCharges } = await import('@/lib/supplier-charges')
    const { rows } = await computeCharges(admin, me.id, ym)
    previewTotal = rows.reduce((s, r) => s + Number(r.amount), 0)
  } catch { /* fail-safe: 0表示 */ }

  const STAT: React.CSSProperties = { fontSize: '.6rem', opacity: .85, minWidth: 86 }
  const NUM: React.CSSProperties = { display: 'block', fontFamily: 'Inter', fontSize: '1rem', fontWeight: 500, marginTop: 3 }
  const H2: React.CSSProperties = { fontSize: '.92rem', fontWeight: 500, margin: '0 20px', padding: '20px 0 2px' }

  return (
    <div className="page-anim" style={{ paddingBottom: 8 }}>
      {/* ヒーロー: 今月の全体像（1列） */}
      <div className="shine" style={{ margin: '18px 20px 0', background: 'linear-gradient(135deg,#5240F2 0%,#4733E6 52%,#3A28CE 100%)', color: '#fff', borderRadius: 18, padding: '20px 22px 16px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ fontSize: '.56rem', letterSpacing: '.22em', opacity: .85, textTransform: 'uppercase', marginBottom: 10 }}>今月の全体像</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={STAT}>成約受注額<span style={NUM}>¥<CountUp value={companyRevenue} /><span style={{ fontSize: '.58rem', fontWeight: 400, marginLeft: 4 }}>{companyCount}件</span></span></div>
          <div style={STAT}>進行中の案件<span style={NUM}><CountUp value={inProgress} /><span style={{ fontSize: '.58rem', fontWeight: 400, marginLeft: 4 }}>件</span></span></div>
          <div style={STAT}>網（配下と還元）<span style={NUM}>¥<CountUp value={monthOverride} /><span style={{ fontSize: '.58rem', fontWeight: 400, marginLeft: 4 }}>{teamN}名</span></span></div>
          <div style={STAT}>今月のお支払い見込み<span style={NUM}>¥<CountUp value={previewTotal} /></span></div>
        </div>
      </div>

      {/* 最優先アクション帯: リファラル獲得を常に前へ */}
      <div style={{ margin: '12px 20px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '13px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1, fontSize: '.74rem', fontWeight: 500 }}>リファラルを招待</div>
          <a href="/app/refer" style={{ flexShrink: 0, fontSize: '.7rem', fontWeight: 500, color: '#fff', background: 'var(--c-blue)', borderRadius: 999, padding: '7px 16px', textDecoration: 'none' }}>紹介する →</a>
        </div>
        <FrontierInvite />
      </div>

      {/* 商品（ブランド・公開状態・サービス設定＝自己設定の入口） */}
      <section id="products">
        <h2 style={H2}>商品</h2>
        {(brands ?? []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 20px 0' }}>
            {(brands ?? []).map(b => (
              <span key={b.id} style={{ fontSize: '.62rem', fontWeight: 500, color: 'var(--muted2)', background: '#fff', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 12px' }}>
                {b.name}<span style={{ marginLeft: 5, color: b.active ? 'var(--c-blue)' : 'var(--muted)' }}>{b.active ? '公開中' : '非公開'}</span>
              </span>
            ))}
          </div>
        )}
        <SupplierSettings />
      </section>

      {/* 案件・お金・委託（ポータル/コンソールと同一ソース） */}
      <section id="company">
        <h2 style={H2}>案件とお金</h2>
        <SupplierSection hideBrandChips />
      </section>

      {/* 網の動き */}
      <section id="network">
        <h2 style={H2}>網の動き</h2>
        <FrontierSection />
      </section>
    </div>
  )
}
