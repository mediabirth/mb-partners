import { redirect } from 'next/navigation'
import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
import CountUp from '@/components/CountUp'
import { SupplierTopbar, CONTENT } from '../SupplierChrome'
import { SG_NETWORK } from '@/lib/supplier-guides'
import InviteModal from './InviteModal'
import DeliverySection from './DeliverySection'

/**
 * パートナー（v5・MBコンソール「パートナー」と同体裁）:
 * 招待（唯一のフォーム・上部）→ KPI3枚 → パートナー一覧テーブル（状態・今月成約・今月売上・累計売上）。
 * 数字は自社メニューの受注額集計＋computeOverrides（支払と同一規則）＝単一ソース。
 */
export default async function SupplierPartnersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === 'delivery' ? 'delivery' : 'partner'
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

  const [{ data: subsRaw }, kickMod] = await Promise.all([
    admin.from('partners').select('id, code, status, frontier_id, frontier_linked_at, profiles(name, color)').eq('frontier_id', me.id),
    Promise.all([import('@/lib/frontier'), import('@/lib/frontier-payout')]),
  ])
  const subs = (subsRaw ?? []) as unknown as { id: string; code: string; status: string; frontier_id: string | null; frontier_linked_at: string | null; profiles: { name: string | null; color: string | null } | null }[]
  const subIds = subs.map(s => s.id)

  // 自社メニューの成約（今月/累計・パートナー別）
  const per: Record<string, { mCount: number; mRev: number; tRev: number }> = {}
  let netRevenue = 0, netCount = 0
  if (subIds.length && brandIds.length) {
    const { data: nd } = await admin.from('deals').select('partner_id, status, fixed_month, created_at, deal_items(revenue)').in('partner_id', subIds).in('service_id', brandIds).in('status', ['confirmed', 'paid'])
    for (const d of (nd ?? []) as { partner_id: string | null; status: string; fixed_month: string | null; created_at: string; deal_items: { revenue: number | null }[] | null }[]) {
      if (!d.partner_id) continue
      const rev = (d.deal_items ?? []).reduce((s, it) => s + (Number(it.revenue) || 0), 0)
      const e = (per[d.partner_id] ??= { mCount: 0, mRev: 0, tRev: 0 })
      e.tRev += rev
      if (inMonth(d)) { e.mCount += 1; e.mRev += rev; netRevenue += rev; netCount += 1 }
    }
  }
  // MB Partnersメニュー分の還元（支払と同一規則）
  let mbKickback = 0
  if (me.is_frontier && subIds.length) {
    const [{ computeOverrides }, { loadSupplierFrontiers }] = kickMod
    const { data: deals } = await admin.from('deals').select('partner_id, amount, status, fixed_month, created_at, fee_snapshot').in('partner_id', subIds)
    const linkById: Record<string, { frontier_id: string | null; frontier_linked_at: string | null }> = {}
    for (const s of subs) linkById[s.id] = { frontier_id: s.frontier_id, frontier_linked_at: s.frontier_linked_at }
    mbKickback = computeOverrides((deals ?? []) as never, linkById, ym, await loadSupplierFrontiers(admin))[me.id] ?? 0
  }
  const sorted = [...subs].sort((a, b2) => (per[b2.id]?.mRev ?? 0) - (per[a.id]?.mRev ?? 0))

  const CARD: React.CSSProperties = { background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14 }
  const TH: React.CSSProperties = { textAlign: 'left', fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', padding: '9px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }
  const TD: React.CSSProperties = { fontSize: '.72rem', padding: '11px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap' }

  return (
    <div className="page-anim">
      <SupplierTopbar title="パートナー" guide={SG_NETWORK} action={<InviteModal mode={tab === 'delivery' ? 'delivery' : 'partner'} />} />
      <div style={{ ...CONTENT }}>

      {/* 区分タブ（MBコンソール パートナーの区分と同文法: パートナー/委託先） */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {([['partner', 'パートナー'], ['delivery', '委託先']] as const).map(([v, l]) => (
          <a key={v} href={v === 'partner' ? '/app/s/partners' : '/app/s/partners?tab=delivery'}
            style={{ fontSize: '.72rem', fontWeight: 500, minHeight: 36, padding: '0 16px', borderRadius: 999, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', border: `1.5px solid ${tab === v ? 'var(--c-blue)' : 'var(--line)'}`, background: tab === v ? 'var(--blue-bg2)' : '#fff', color: tab === v ? 'var(--c-blue)' : 'var(--muted2)' }}>{l}</a>
        ))}
      </div>

      {tab === 'delivery' ? <DeliverySection /> : <>

      {/* KPI 3枚（コンソール同体裁） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, margin: '12px 0' }}>
        {[
          { l: 'パートナー', v: subs.length, yen: false, sub: `名${subs.filter(s => (s.frontier_linked_at ?? '').slice(0, 7) === ym).length ? ` ・ 今月+${subs.filter(s => (s.frontier_linked_at ?? '').slice(0, 7) === ym).length}` : ''}` },
          { l: '今月の成約', v: netCount, yen: false, sub: '件' },
          { l: '今月生んだ売上', v: netRevenue, yen: true, sub: '受注額（税抜）' },
        ].map(c => (
          <div key={c.l} style={{ ...CARD, padding: '13px 15px' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 500 }}>{c.l}</div>
            <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.15rem', fontWeight: 500, marginTop: 4 }}>
              {c.yen && '¥'}<CountUp value={c.v} /><span style={{ fontSize: '.58rem', fontWeight: 400, color: 'var(--muted2)', marginLeft: 5 }}>{c.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 一覧テーブル（コンソール partners と同体裁） */}
      <div style={{ ...CARD, overflow: 'hidden' }}>
        {sorted.length === 0 ? (
          <p style={{ fontSize: '.74rem', color: 'var(--muted2)', padding: '16px 15px', margin: 0 }}>まだパートナーがいません。上の招待リンクを共有すると、登録した方がここに並びます。</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead><tr><th style={TH}>パートナー</th><th style={TH}>状態</th><th style={TH}>今月の成約</th><th style={TH}>今月の売上</th><th style={TH}>累計売上</th></tr></thead>
              <tbody>
                {sorted.map(s => {
                  const st = per[s.id] ?? { mCount: 0, mRev: 0, tRev: 0 }
                  return (
                    <tr key={s.id}>
                      <td style={{ ...TD, fontWeight: 500 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                          <span style={{ width: 28, height: 28, borderRadius: '50%', background: s.profiles?.color ?? 'var(--c-blue)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 500 }}>{(s.profiles?.name ?? s.code)[0]}</span>
                          {s.profiles?.name ?? s.code}
                          <span className="tnum" style={{ fontSize: '.58rem', color: 'var(--muted2)', fontFamily: 'Inter', fontWeight: 400 }}>{s.code}</span>
                        </span>
                      </td>
                      <td style={TD}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: s.status === 'active' ? 'var(--st-success, #0f9d76)' : 'var(--muted)', flexShrink: 0 }} />
                          <span style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>{s.status === 'active' ? '稼働中' : '停止'}</span>
                        </span>
                      </td>
                      <td className="tnum" style={{ ...TD, fontFamily: 'Inter' }}>{st.mCount}件</td>
                      <td className="tnum" style={{ ...TD, fontFamily: 'Inter' }}>¥{st.mRev.toLocaleString()}</td>
                      <td className="tnum" style={{ ...TD, fontFamily: 'Inter', color: 'var(--muted2)' }}>¥{st.tRev.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MB Partnersメニュー分の還元（小さく・契約ベース） */}
      <div style={{ ...CARD, marginTop: 12, padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: '.68rem', fontWeight: 500 }}>MB Partnersのサービスを紹介した分の還元（今月）</div>
        <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '.92rem', fontWeight: 500, flexShrink: 0 }}>¥{mbKickback.toLocaleString()}</div>
      </div>

      <div style={{ ...CARD, marginTop: 12, padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, fontSize: '.72rem' }}>あなた自身の紹介もいつでも歓迎です</div>
        <a href="/app/refer" style={{ flexShrink: 0, fontSize: '.7rem', fontWeight: 500, color: '#fff', background: 'var(--c-blue)', borderRadius: 999, minHeight: 40, padding: '0 16px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>紹介する →</a>
      </div>
      </>}
      </div>
    </div>
  )
}
