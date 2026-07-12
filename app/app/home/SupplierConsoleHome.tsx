import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
import CountUp from '@/components/CountUp'
import PageGuide from '@/components/PageGuide'
import { SG_HOME } from '@/lib/supplier-guides'
import { customerHonorific } from '@/lib/customer'
import { DEAL_STATUS } from '@/lib/status'

/**
 * サプライヤー・コンソール ホーム（2026-07-13）: 数字4枚＋要対応＋最近の動き＋主アクション。
 * ★数字はポータル/MBコンソールと同一ソース関数（computeCharges・computeOverrides）＝独自計算ゼロ。
 */
export default async function SupplierConsoleHome() {
  const user = await getCachedUser()
  if (!user) return null
  const supabase = await createClient()
  const { data: me } = await supabase.from('partners').select('id, is_frontier, supplier_rate_card').eq('profile_id', user.id).maybeSingle()
  if (!me) return null
  const admin = await createServiceRoleClient()
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const inMonth = (d: { fixed_month?: string | null; created_at: string }) => ((d.fixed_month ?? d.created_at) || '').slice(0, 7) === ym

  const { data: brands } = await admin.from('services').select('id, name').eq('supplier_partner_id', me.id)
  const brandIds = (brands ?? []).map(b => b.id)
  const nameByBrand = Object.fromEntries((brands ?? []).map(b => [b.id, b.name]))

  type D = { id: string; customer_name: string | null; customer_type: string | null; company_name: string | null; contact_name: string | null; status: string; fixed_month: string | null; created_at: string; service_id: string; deal_items: { id: string; revenue: number | null }[] | null }
  let deals: D[] = []
  if (brandIds.length) {
    const { data } = await admin.from('deals').select('id, customer_name, customer_type, company_name, contact_name, status, fixed_month, created_at, service_id, deal_items(id, revenue)').in('service_id', brandIds).neq('status', 'lost').order('created_at', { ascending: false }).limit(60)
    deals = (data ?? []) as D[]
  }
  const revOf = (d: D) => (d.deal_items ?? []).reduce((s, it) => s + (Number(it.revenue) || 0), 0)
  const monthClosed = deals.filter(d => (d.status === 'confirmed' || d.status === 'paid') && inMonth(d))
  const companyRevenue = monthClosed.reduce((s, d) => s + revOf(d), 0)
  const inProgress = deals.filter(d => d.status === 'received' || d.status === 'in_progress').length
  // 前月比（±%・表示のみ）
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastYm = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}`
  const lastRevenue = deals.filter(d => (d.status === 'confirmed' || d.status === 'paid') && ((d.fixed_month ?? d.created_at) || '').slice(0, 7) === lastYm).reduce((s, d) => s + revOf(d), 0)
  const momPct = lastRevenue > 0 ? Math.round((companyRevenue - lastRevenue) / lastRevenue * 100) : null

  // 網（支払と同一規則）
  let teamN = 0, monthOverride = 0, teamNew = 0
  if (me.is_frontier) {
    const [{ computeOverrides }, { loadSupplierFrontiers }] = await Promise.all([import('@/lib/frontier'), import('@/lib/frontier-payout')])
    const { data: subs } = await admin.from('partners').select('id, frontier_id, frontier_linked_at').eq('frontier_id', me.id)
    teamN = (subs ?? []).length
    teamNew = (subs ?? []).filter(s => (s.frontier_linked_at ?? '').slice(0, 7) === ym).length
    if (teamN) {
      const subIds = (subs ?? []).map(s => s.id)
      const { data: sd } = await admin.from('deals').select('partner_id, amount, status, fixed_month, created_at, fee_snapshot').in('partner_id', subIds)
      const linkById: Record<string, { frontier_id: string | null; frontier_linked_at: string | null }> = {}
      for (const s of subs ?? []) linkById[s.id] = { frontier_id: s.frontier_id, frontier_linked_at: s.frontier_linked_at }
      monthOverride = computeOverrides((sd ?? []) as never, linkById, ym, await loadSupplierFrontiers(admin))[me.id] ?? 0
    }
  }

  // お支払い見込み（請求と同一計算）
  let previewTotal = 0
  try {
    const { computeCharges } = await import('@/lib/supplier-charges')
    previewTotal = (await computeCharges(admin, me.id, ym)).rows.reduce((s, r) => s + Number(r.amount), 0)
  } catch { /* fail-safe */ }

  // 要対応
  const needRevenue = monthClosed.concat(deals.filter(d => (d.status === 'confirmed' || d.status === 'paid') && !inMonth(d))).filter(d => revOf(d) === 0)
  let awaitingDelivery = 0
  if (deals.length) {
    const { data: asg } = await admin.from('delivery_assignments').select('id, status').in('deal_id', deals.map(d => d.id))
    awaitingDelivery = (asg ?? []).filter(a => a.status === 'accepted' || a.status === 'assigned').length
  }
  const { data: rejReqs } = await admin.from('supplier_change_requests').select('id, kind, reason').eq('supplier_partner_id', me.id).eq('status', 'rejected').order('decided_at', { ascending: false }).limit(3)

  const CARD: React.CSSProperties = { background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13 }
  const H2: React.CSSProperties = { fontSize: '.82rem', fontWeight: 700, margin: '0 0 8px' }

  return (
    <div className="page-anim" style={{ padding: '18px 18px 40px', maxWidth: 980, margin: '0 auto', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h1 style={{ fontSize: '.95rem', fontWeight: 700 }}>ホーム</h1>
        <PageGuide data={SG_HOME} />
      </div>

      {/* 数字4枚 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {[
          { l: '今月の売上（成約受注額）', v: companyRevenue, yen: true, sub: momPct == null ? `${monthClosed.length}件` : `${monthClosed.length}件 ・ 前月比${momPct >= 0 ? '+' : ''}${momPct}%` },
          { l: '進行中の案件', v: inProgress, yen: false, sub: '件' },
          { l: '網のメンバー', v: teamN, yen: false, sub: `名${teamNew > 0 ? ` ・ 今月+${teamNew}` : ''}` },
          { l: '今月のお支払い見込み', v: previewTotal, yen: true, sub: '月末締め' },
        ].map(c => (
          <div key={c.l} style={{ ...CARD, padding: '13px 15px' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 500 }}>{c.l}</div>
            <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.15rem', fontWeight: 700, marginTop: 4 }}>
              {c.yen && '¥'}<CountUp value={c.v} /><span style={{ fontSize: '.58rem', fontWeight: 400, color: 'var(--muted2)', marginLeft: 5 }}>{c.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 網への導線（カード1枚・ボタンのみ＝フォームは網ページに一本化・§0(b)/§2） */}
      <div style={{ ...CARD, marginTop: 12, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.76rem', fontWeight: 700 }}>網を広げるほど、売上が積み上がります</div>
          <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 2 }}>招待リンクの共有・自分の紹介は「網」から</div>
        </div>
        <a href="/app/s/network" style={{ flexShrink: 0, fontSize: '.72rem', fontWeight: 700, color: '#fff', background: 'var(--c-blue)', borderRadius: 999, minHeight: 44, padding: '0 18px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>網を広げる →</a>
      </div>

      <div className="sup-2col" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 16 }}>
        {/* 要対応 */}
        <div>
          <h2 style={H2}>次の一手</h2>
          <div style={{ ...CARD, overflow: 'hidden' }}>
            {needRevenue.length === 0 && awaitingDelivery === 0 && (rejReqs ?? []).length === 0 ? (
              <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '14px 15px', margin: 0 }}>今日は対応が必要な項目はありません。</p>
            ) : (
              <>
                {needRevenue.slice(0, 5).map((d, i) => (
                  <a key={d.id} href="/app/s/deals" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '11px 15px', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)', textDecoration: 'none', color: 'var(--txt)', fontSize: '.72rem' }}>
                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b>{customerHonorific(d)}</b> の受注額が未入力です</span>
                    <span style={{ color: 'var(--c-blue)', flexShrink: 0 }}>入力 ›</span>
                  </a>
                ))}
                {awaitingDelivery > 0 && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '11px 15px', borderTop: '0.5px solid var(--line)', fontSize: '.72rem' }}>
                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--c-blue)', flexShrink: 0 }} />
                    <span>納品待ちの委託が {awaitingDelivery} 件あります（進行はMB Partnersが担当）</span>
                  </div>
                )}
                {(rejReqs ?? []).map(r => (
                  <a key={r.id} href="/app/s/settings" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '11px 15px', borderTop: '0.5px solid var(--line)', textDecoration: 'none', color: 'var(--txt)', fontSize: '.72rem' }}>
                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>変更申請が見送りになりました{r.reason ? `（${r.reason}）` : ''}</span>
                    <span style={{ color: 'var(--c-blue)', flexShrink: 0 }}>詳細 ›</span>
                  </a>
                ))}
              </>
            )}
          </div>
        </div>

        {/* 最近の動き */}
        <div>
          <h2 style={H2}>今月の流れ</h2>
          <div style={{ ...CARD, overflow: 'hidden' }}>
            {deals.length === 0 ? (
              <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '14px 15px', margin: 0 }}>まだ案件がありません。メニューが公開されるとここに並びます。</p>
            ) : deals.slice(0, 6).map((d, i) => (
              <a key={d.id} href="/app/s/deals" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '11px 15px', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)', textDecoration: 'none', color: 'var(--txt)' }}>
                <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.58rem', color: 'var(--muted)', width: 34, flexShrink: 0 }}>{new Date(d.created_at).toLocaleDateString('ja', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' })}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: '.74rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customerHonorific(d)}<span style={{ color: 'var(--muted2)', fontWeight: 400, fontSize: '.62rem' }}> ・ {nameByBrand[d.service_id] ?? ''}</span></span>
                <span style={{ fontSize: '.58rem', fontWeight: 500, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 999, padding: '3px 9px', flexShrink: 0 }}>{DEAL_STATUS[d.status]?.label ?? d.status}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
      <style>{`@media (min-width:1024px){ .sup-2col{grid-template-columns:1fr 1fr !important} }`}</style>
    </div>
  )
}
