import { redirect } from 'next/navigation'
import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
import CountUp from '@/components/CountUp'
import PageGuide from '@/components/PageGuide'
import { SG_NETWORK } from '@/lib/supplier-guides'
import SupplierInvite from './SupplierInvite'

/**
 * 網（リファラル）v2（設計図§3）——サプライヤーの真実の数字。
 * ヒーロー=「あなたの網が今月生んだ売上」＝系統パートナー紹介による自社メニュー成約の受注額合計
 * （網の価値の正体。overrideではない）。チーム=今月の成約n件・売上¥X。
 * MBメニュー紹介分の還元は別カードで小さく正確に（契約ベース・支払と同一規則computeOverrides）。
 * 招待フォームはシステム全体でこのページの1箇所のみ（リンクコピー主体）。試算カードは置かない。
 */
export default async function SupplierNetworkPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: me } = await supabase.from('partners').select('id, is_frontier, supplier_rate_card').eq('profile_id', user!.id).maybeSingle()
  if (!me) redirect('/app')
  const admin = await createServiceRoleClient()
  const { data: myBrands } = await admin.from('services').select('id').eq('supplier_partner_id', me.id)
  if (!me.supplier_rate_card && !(myBrands ?? []).length) redirect('/app')
  const brandIds = (myBrands ?? []).map(b => b.id)
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const inMonth = (d: { fixed_month?: string | null; created_at: string }) => ((d.fixed_month ?? d.created_at) || '').slice(0, 7) === ym

  const { data: subs } = await admin.from('partners').select('id, code, frontier_id, frontier_linked_at, profiles(name, color)').eq('frontier_id', me.id)
  const subList = (subs ?? []) as { id: string; code: string; frontier_id: string | null; frontier_linked_at: string | null; profiles: { name: string | null; color: string | null } | null }[]
  const subIds = subList.map(s => s.id)

  // 網が今月生んだ売上＝配下の紹介×自社メニュー×成約以降×当月（受注額合計・単一の受注額集計）
  let netRevenue = 0, netCount = 0
  const perSub: Record<string, { count: number; revenue: number }> = {}
  if (subIds.length && brandIds.length) {
    const { data: nd } = await admin.from('deals').select('partner_id, status, fixed_month, created_at, service_id, deal_items(revenue)').in('partner_id', subIds).in('service_id', brandIds).in('status', ['confirmed', 'paid'])
    for (const d of (nd ?? []) as { partner_id: string | null; status: string; fixed_month: string | null; created_at: string; deal_items: { revenue: number | null }[] | null }[]) {
      if (!inMonth(d) || !d.partner_id) continue
      const rev = (d.deal_items ?? []).reduce((s, it) => s + (Number(it.revenue) || 0), 0)
      netRevenue += rev; netCount += 1
      const e = (perSub[d.partner_id] ??= { count: 0, revenue: 0 })
      e.count += 1; e.revenue += rev
    }
  }

  // MBメニュー紹介分の還元（法人override・契約期間中）＝支払と同一規則（self_serviceは自動的に対象外＝MB分のみ）
  let mbKickback = 0
  if (me.is_frontier && subIds.length) {
    const [{ computeOverrides }, { loadSupplierFrontiers }] = await Promise.all([import('@/lib/frontier'), import('@/lib/frontier-payout')])
    const { data: deals } = await admin.from('deals').select('partner_id, amount, status, fixed_month, created_at, fee_snapshot').in('partner_id', subIds)
    const linkById: Record<string, { frontier_id: string | null; frontier_linked_at: string | null }> = {}
    for (const s of subList) linkById[s.id] = { frontier_id: s.frontier_id, frontier_linked_at: s.frontier_linked_at }
    mbKickback = computeOverrides((deals ?? []) as never, linkById, ym, await loadSupplierFrontiers(admin))[me.id] ?? 0
  }

  const CARD: React.CSSProperties = { background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13 }

  return (
    <div className="page-anim" style={{ padding: '18px 18px 40px', maxWidth: 720, margin: '0 auto', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h1 style={{ fontSize: '.95rem', fontWeight: 700 }}>網（リファラル）</h1>
        <PageGuide data={SG_NETWORK} />
      </div>

      {/* 招待（唯一のフォーム・最上部・リンク主体） */}
      <SupplierInvite />

      {/* ヒーロー: 網が今月生んだ売上 */}
      <div className="shine" style={{ margin: '12px 0 0', background: 'linear-gradient(135deg,#5240F2 0%,#4733E6 52%,#3A28CE 100%)', color: '#fff', borderRadius: 16, padding: '18px 20px 15px', overflow: 'hidden' }}>
        <div style={{ fontSize: '.56rem', letterSpacing: '.2em', opacity: .85, textTransform: 'uppercase', marginBottom: 7 }}>あなたの網が今月生んだ売上</div>
        <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '1.9rem', letterSpacing: '-.02em', lineHeight: 1.05 }}>
          <span style={{ fontSize: '.9rem', opacity: .8, marginRight: 4 }}>¥</span><CountUp value={netRevenue} />
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 11, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.28)' }}>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>成約<span className="tnum" style={{ display: 'block', fontFamily: 'Inter', fontSize: '.86rem', fontWeight: 500, marginTop: 2 }}>{netCount}件</span></div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>網のメンバー<span className="tnum" style={{ display: 'block', fontFamily: 'Inter', fontSize: '.86rem', fontWeight: 500, marginTop: 2 }}>{subList.length}名</span></div>
        </div>
      </div>

      {/* チーム一覧: 今月の成約n件・売上¥X */}
      <h2 style={{ fontSize: '.82rem', fontWeight: 700, margin: '18px 0 8px' }}>網のメンバー</h2>
      {subList.length === 0 ? (
        <div style={{ ...CARD, padding: '16px 16px' }}>
          <p style={{ fontSize: '.74rem', color: 'var(--muted2)', margin: 0, lineHeight: 1.8 }}>まだメンバーがいません。上の招待リンクを共有すると、登録した方がここに並びます。</p>
        </div>
      ) : (
        <div style={{ ...CARD, overflow: 'hidden' }}>
          {subList.map((s, i) => {
            const st = perSub[s.id] ?? { count: 0, revenue: 0 }
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)' }}>
                <span style={{ width: 32, height: 32, borderRadius: '50%', background: s.profiles?.color ?? 'var(--c-blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.76rem', fontWeight: 500, flexShrink: 0 }}>{(s.profiles?.name ?? s.code)[0]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.profiles?.name ?? s.code}</div>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 2 }}>今月の成約 {st.count}件</div>
                </div>
                <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '.84rem', fontWeight: 700, flexShrink: 0 }}>¥{st.revenue.toLocaleString()}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* MBメニュー紹介分の還元（小さく・契約ベースの言葉） */}
      <div style={{ ...CARD, marginTop: 12, padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.68rem', fontWeight: 500 }}>MB Partnersのサービスを紹介した分の還元</div>
          <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 2 }}>網のメンバーがMB Partnersのメニューを成約すると、契約期間中は還元が発生します（今月分）</div>
        </div>
        <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '.92rem', fontWeight: 700, flexShrink: 0 }}>¥{mbKickback.toLocaleString()}</div>
      </div>

      {/* 自分の紹介導線（常設） */}
      <div style={{ ...CARD, marginTop: 12, padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, fontSize: '.72rem' }}>あなた自身の紹介もいつでも歓迎です</div>
        <a href="/app/refer" style={{ flexShrink: 0, fontSize: '.7rem', fontWeight: 500, color: '#fff', background: 'var(--c-blue)', borderRadius: 999, minHeight: 40, padding: '0 16px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>紹介する →</a>
      </div>
    </div>
  )
}
