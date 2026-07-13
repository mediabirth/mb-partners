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

  type D = { id: string; customer_name: string | null; customer_type: string | null; company_name: string | null; contact_name: string | null; status: string; amount: number | null; fixed_month: string | null; created_at: string; service_id: string; deal_items: { id: string; revenue: number | null }[] | null }
  // サクサク: brands確定後の取得を全て並列化（結果は従来と同一・待ち時間のみ短縮）
  const now2 = now
  const last = new Date(now2.getFullYear(), now2.getMonth() - 1, 1)
  const lastYm = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}`
  const [dealsRes, subsRes, chargesMod, rejReqsRes] = await Promise.all([
    brandIds.length
      ? admin.from('deals').select('id, customer_name, customer_type, company_name, contact_name, status, amount, fixed_month, created_at, service_id, deal_items(id, revenue)').in('service_id', brandIds).neq('status', 'lost').order('created_at', { ascending: false }).limit(60)
      : Promise.resolve({ data: [] as never[] }),
    me.is_frontier ? admin.from('partners').select('id, frontier_id, frontier_linked_at').eq('frontier_id', me.id) : Promise.resolve({ data: [] as never[] }),
    import('@/lib/supplier-charges'),
    admin.from('supplier_change_requests').select('id, kind, reason').eq('supplier_partner_id', me.id).eq('status', 'rejected').order('decided_at', { ascending: false }).limit(3),
  ])
  const deals = (dealsRes.data ?? []) as D[]
  const revOf = (d: D) => (d.deal_items ?? []).reduce((s, it) => s + (Number(it.revenue) || 0), 0)
  const monthClosed = deals.filter(d => (d.status === 'confirmed' || d.status === 'paid') && inMonth(d))
  const companyRevenue = monthClosed.reduce((s, d) => s + revOf(d), 0)
  const inProgress = deals.filter(d => d.status === 'received' || d.status === 'in_progress').length
  const lastRevenue = deals.filter(d => (d.status === 'confirmed' || d.status === 'paid') && ((d.fixed_month ?? d.created_at) || '').slice(0, 7) === lastYm).reduce((s, d) => s + revOf(d), 0)
  const momPct = lastRevenue > 0 ? Math.round((companyRevenue - lastRevenue) / lastRevenue * 100) : null

  // 網・請求見込み・委託を並列（網は配下dealsに依存するため段2）
  const subs = (subsRes.data ?? []) as { id: string; frontier_id: string | null; frontier_linked_at: string | null }[]
  let teamN = subs.length, monthOverride = 0
  const teamNew = subs.filter(s => (s.frontier_linked_at ?? '').slice(0, 7) === ym).length
  const [overrideRes, previewRes, lastPreviewRes, asgRes] = await Promise.all([
    (async () => {
      if (!teamN) return 0
      const [{ computeOverrides }, { loadSupplierFrontiers }] = await Promise.all([import('@/lib/frontier'), import('@/lib/frontier-payout')])
      const { data: sd } = await admin.from('deals').select('partner_id, amount, status, fixed_month, created_at, fee_snapshot').in('partner_id', subs.map(s => s.id))
      const linkById: Record<string, { frontier_id: string | null; frontier_linked_at: string | null }> = {}
      for (const s of subs) linkById[s.id] = { frontier_id: s.frontier_id, frontier_linked_at: s.frontier_linked_at }
      return computeOverrides((sd ?? []) as never, linkById, ym, await loadSupplierFrontiers(admin))[me.id] ?? 0
    })().catch(() => 0),
    chargesMod.computeCharges(admin, me.id, ym).then(r => r.rows.reduce((s, x) => s + Number(x.amount), 0)).catch(() => 0),
    chargesMod.computeCharges(admin, me.id, lastYm).then(r => r.rows.reduce((s, x) => s + Number(x.amount), 0)).catch(() => 0),
    deals.length ? admin.from('delivery_assignments').select('id, status').in('deal_id', deals.map(d => d.id)) : Promise.resolve({ data: [] as never[] }),
  ])
  monthOverride = overrideRes
  const previewTotal = previewRes, lastPreviewTotal = lastPreviewRes
  const rewardsMonth = monthClosed.reduce((s, d) => s + (Number((d as unknown as { amount?: number }).amount) || 0), 0)
  const takeHome = companyRevenue - rewardsMonth - previewTotal

  // 要対応（asg/rejReqsは上の並列で取得済み）
  const needRevenue = monthClosed.concat(deals.filter(d => (d.status === 'confirmed' || d.status === 'paid') && !inMonth(d))).filter(d => revOf(d) === 0)
  const awaitingDelivery = ((asgRes.data ?? []) as { status: string | null }[]).filter(a => a.status === 'accepted' || a.status === 'assigned').length
  const rejReqs = rejReqsRes.data

  const CARD: React.CSSProperties = { background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13 }
  const H2: React.CSSProperties = { fontSize: '.82rem', fontWeight: 700, margin: '0 0 8px' }

  return (
    <div className="page-anim" style={{ padding: '18px 18px 40px', maxWidth: 1120, margin: '0 auto', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h1 style={{ fontSize: '.95rem', fontWeight: 700 }}>ホーム</h1>
        <PageGuide data={SG_HOME} />
      </div>

      {/* ヒーロー（コンソール・ダッシュボード同文法・CTA統合） */}
      <div className="page-anim shine card-hover" style={{ position: 'relative', borderRadius: 16, padding: '20px 24px', marginBottom: 14, background: 'linear-gradient(120deg, var(--c-blue) 0%, #3A28CE 100%)', color: '#fff', overflow: 'hidden' }}>
        <div className="sup-hero" style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: '.56rem', letterSpacing: '.22em', opacity: .85, textTransform: 'uppercase' }}>今月の売上（成約受注額）</div>
            <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '34px', letterSpacing: '-.03em', marginTop: 6, lineHeight: 1.05 }}>
              <span style={{ fontSize: '1rem', opacity: .8, marginRight: 4 }}>¥</span><CountUp value={companyRevenue} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
              <span style={{ fontSize: '.62rem', opacity: .9 }}>{monthClosed.length}件</span>
              {momPct != null && (
                <span style={{ fontSize: '.6rem', background: 'rgba(255,255,255,.16)', borderRadius: 999, padding: '3px 10px' }}>
                  {momPct >= 0 ? '▲' : '▼'} 前月比{Math.abs(momPct)}%
                </span>
              )}
            </div>
          </div>
          <a href="/app/s/network" style={{ flexShrink: 0, fontSize: '.74rem', fontWeight: 700, color: 'var(--c-blue)', background: '#fff', borderRadius: 999, minHeight: 44, padding: '0 20px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>紹介者を増やす →</a>
        </div>
      </div>

      {/* 数字カード3枚 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {[
          { l: '進行中の案件', v: inProgress, yen: false, sub: '件' },
          { l: '紹介者', v: teamN, yen: false, sub: `名${teamNew > 0 ? ` ・ 今月+${teamNew}` : ''}` },
          { l: '今月のお支払い見込み', v: previewTotal, yen: true, sub: lastPreviewTotal > 0 ? `先月 ¥${lastPreviewTotal.toLocaleString()} ${previewTotal >= lastPreviewTotal ? '↗' : '↘'}` : '月末締め' },
        ].map(c => (
          <div key={c.l} style={{ ...CARD, padding: '13px 15px' }}>
            <div style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 500 }}>{c.l}</div>
            <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.15rem', fontWeight: 700, marginTop: 4 }}>
              {c.yen && '¥'}<CountUp value={c.v} /><span style={{ fontSize: '.58rem', fontWeight: 400, color: 'var(--muted2)', marginLeft: 5 }}>{c.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* お金の内訳（サプライヤー版ウォーターフォール・コンソール同バー表現・単一ソース由来） */}
      <h2 style={{ ...H2, marginTop: 16 }}>お金の内訳</h2>
      <div style={{ ...CARD, padding: '16px 18px' }}>
        <WaterRow label="総受注額" val={companyRevenue} pct={100} color="var(--c-blue)" head />
        <WaterRow label="紹介者への報酬" val={rewardsMonth} pct={companyRevenue > 0 ? Math.round(rewardsMonth / companyRevenue * 100) : 0} color="var(--blue-dk)" minus />
        <WaterRow label="MB Partners手数料" val={previewTotal} pct={companyRevenue > 0 ? Math.round(previewTotal / companyRevenue * 100) : 0} color="var(--amber)" minus />
        <div style={{ borderTop: '1.5px solid var(--line)', marginTop: 8, paddingTop: 10 }}>
          <WaterRow label="あなたの会社の手残り" val={takeHome} pct={companyRevenue > 0 ? Math.round(Math.max(0, takeHome) / companyRevenue * 100) : 0} color={takeHome >= 0 ? 'var(--c-blue)' : 'var(--red)'} strong />
        </div>
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
              <a key={d.id} href="/app/s/deals" className={i === 0 ? 'sup-new' : undefined} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '11px 15px', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)', textDecoration: 'none', color: 'var(--txt)' }}>
                <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.58rem', color: 'var(--muted)', width: 34, flexShrink: 0 }}>{new Date(d.created_at).toLocaleDateString('ja', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' })}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: '.74rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customerHonorific(d)}<span style={{ color: 'var(--muted2)', fontWeight: 400, fontSize: '.62rem' }}> ・ {nameByBrand[d.service_id] ?? ''}</span></span>
                <span style={{ fontSize: '.58rem', fontWeight: 500, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 999, padding: '3px 9px', flexShrink: 0 }}>{DEAL_STATUS[d.status]?.label ?? d.status}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
      <style>{`@media (min-width:1024px){ .sup-2col{grid-template-columns:1fr 1fr !important} }
.sup-new{animation:supNew 1.6s ease-out}
@keyframes supNew{from{background:var(--blue-bg2)}to{background:transparent}}
@media (prefers-reduced-motion:reduce){.sup-new{animation:none}}`}</style>
    </div>
  )
}


// お金の内訳の1行（MBコンソールの WaterRow と同表現・表示のみ）
function WaterRow({ label, val, pct, color, minus, head, strong }: { label: string; val: number; pct: number; color: string; minus?: boolean; head?: boolean; strong?: boolean }) {
  return (
    <div style={{ padding: head ? '2px 0 9px' : '6px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: strong || head ? '.76rem' : '.68rem', fontWeight: 500, color: minus ? 'var(--muted2)' : 'var(--txt)' }}>{minus ? '− ' : ''}{label}</span>
        <span className="tnum" style={{ fontFamily: 'Inter', fontSize: strong || head ? '.84rem' : '.72rem', fontWeight: 500 }}>{minus && val > 0 ? '−' : ''}¥{Math.abs(val).toLocaleString()}</span>
      </div>
      <div style={{ height: head || strong ? 9 : 7, borderRadius: 4, background: 'var(--bg2)', overflow: 'hidden' }}>
        <div className="bar-grow" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
    </div>
  )
}
