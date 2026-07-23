import { Suspense } from 'react'
import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
import CountUp from '@/components/CountUp'
import KpiCard, { WaterRow } from '@/components/ui/KpiCard'
import { waterfallFromDeals } from '@/lib/supplier-money'
import { SupplierTopbar, CONTENT, SectionTitle } from '../s/SupplierChrome'
import { SG_HOME } from '@/lib/supplier-guides'
import { customerHonorific } from '@/lib/customer'
import { DEAL_STATUS } from '@/lib/status'

/**
 * サプライヤー・コンソール ホーム（2026-07-13／洗練 2026-07-14）: MBダッシュボードと同一リズム（概況→内訳→2カラム）。
 * ★数字はポータル/MBコンソールと同一ソース関数（computeCharges・computeOverrides・supplierWaterfall）＝独自計算ゼロ。
 * ★KPIカード・内訳バーは components/ui/KpiCard（MBコンソールと同一実装）＝乖離不能。
 * ★洗練: シェル（トップバー）を即描画し、概況本体は独立Suspenseでストリーム（MBダッシュボードと同方式）。
 */
export default function SupplierConsoleHome() {
  return (
    <div className="page-anim">
      <SupplierTopbar title="ダッシュボード" guide={SG_HOME} />
      <Suspense fallback={<HomeSkeleton />}>
        <SupplierHomeBody />
      </Suspense>
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div style={{ ...CONTENT }} aria-busy="true">
      <div className="ui-skeleton" style={{ height: 128, borderRadius: 16, marginBottom: 14 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {[0, 1, 2].map(i => <div key={i} className="ui-skeleton" style={{ height: 96, borderRadius: 14 }} />)}
      </div>
      <div className="ui-skeleton" style={{ height: 190, borderRadius: 14, marginTop: 20 }} />
    </div>
  )
}

async function SupplierHomeBody() {
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
  const inProgress = deals.filter(d => d.status === 'received' || d.status === 'in_progress').length

  // 網・請求見込み・委託を並列（網は配下dealsに依存するため段2）
  const subs = (subsRes.data ?? []) as { id: string; frontier_id: string | null; frontier_linked_at: string | null }[]
  const teamN = subs.length
  const teamNew = subs.filter(s => (s.frontier_linked_at ?? '').slice(0, 7) === ym).length
  const [previewRes, lastPreviewRes, asgRes, netRes, wfDealsRes, subNamesRes] = await Promise.all([
    chargesMod.computeCharges(admin, me.id, ym).then(r => r.rows.reduce((s, x) => s + Number(x.amount), 0)).catch(() => 0),
    chargesMod.computeCharges(admin, me.id, lastYm).then(r => r.rows.reduce((s, x) => s + Number(x.amount), 0)).catch(() => 0),
    deals.length ? admin.from('delivery_assignments').select('id, status').in('deal_id', deals.map(d => d.id)) : Promise.resolve({ data: [] as never[] }),
    (subs.length && brandIds.length)
      ? admin.from('deals').select('partner_id, status, fixed_month, created_at, deal_items(revenue)').in('partner_id', subs.map(s => s.id)).in('service_id', brandIds).in('status', ['confirmed', 'paid'])
      : Promise.resolve({ data: [] as never[] }),
    // 無音A: ウォーターフォール用deals（全confirmed/paid・limitなし）を1本で取得し、当月/前月とも純関数で導出
    //   （旧: supplierWaterfall×2 が内部で brands+deals+computeCharges を各自往復＝重複）。値の定義は不変。
    brandIds.length
      ? admin.from('deals').select('status, amount, fixed_month, created_at, deal_items(revenue)').in('service_id', brandIds).in('status', ['confirmed', 'paid'])
      : Promise.resolve({ data: [] as never[] }),
    subs.length ? admin.from('partners').select('id, code, profiles(name)').in('id', subs.map(s => s.id)) : Promise.resolve({ data: [] as never[] }),
  ])
  const wfDeals = (wfDealsRes.data ?? []) as { status: string; amount: number | null; fixed_month: string | null; created_at: string; deal_items: { revenue: number | null }[] | null }[]
  const wf = waterfallFromDeals(wfDeals, previewRes, ym)
  const wfLast = waterfallFromDeals(wfDeals, lastPreviewRes, lastYm)
  // パートナーの成果（旧・紹介者ページのヒーローを吸収）: 今月生んだ売上＋上位3名
  const subNames: Record<string, string> = {}
  for (const p of ((subNamesRes.data ?? []) as unknown as { id: string; code: string; profiles: { name: string | null } | null }[])) subNames[p.id] = p.profiles?.name ?? p.code
  let netRevenue = 0, netCount = 0
  const perSub: Record<string, number> = {}
  for (const d of ((netRes as { data: unknown[] }).data ?? []) as { partner_id: string | null; status: string; fixed_month: string | null; created_at: string; deal_items: { revenue: number | null }[] | null }[]) {
    if (!d.partner_id || !inMonth(d)) continue
    const rev = (d.deal_items ?? []).reduce((s, it) => s + (Number(it.revenue) || 0), 0)
    netRevenue += rev; netCount += 1
    perSub[d.partner_id] = (perSub[d.partner_id] ?? 0) + rev
  }
  const topSubs = Object.entries(perSub).sort((a, b2) => b2[1] - a[1]).slice(0, 3)
  // パイプライン（受注前の見込み・コンソール同項目）
  const pipelineDeals = deals.filter(d => d.status === 'received' || d.status === 'in_progress')
  const received = deals.filter(d => d.status === 'received').length
  const negotiating = deals.filter(d => d.status === 'in_progress').length
  const previewTotal = previewRes, lastPreviewTotal = lastPreviewRes

  // 要対応（asg/rejReqsは上の並列で取得済み）
  const needRevenue = monthClosed.concat(deals.filter(d => (d.status === 'confirmed' || d.status === 'paid') && !inMonth(d))).filter(d => revOf(d) === 0)
  const awaitingDelivery = ((asgRes.data ?? []) as { status: string | null }[]).filter(a => a.status === 'accepted' || a.status === 'assigned').length
  const rejReqs = rejReqsRes.data

  const CARD: React.CSSProperties = { background: 'var(--s-0, #fff)', border: '0.5px solid var(--line)', borderRadius: 14 }

  return (
    <>
      <div style={{ ...CONTENT }}>

      {/* ヒーロー（コンソール・ダッシュボード同文法・CTA統合） */}
      <div className="page-anim shine card-hover" style={{ position: 'relative', borderRadius: 16, padding: '20px 24px', marginBottom: 14, background: 'linear-gradient(120deg, var(--c-blue) 0%, #3A28CE 100%)', color: '#fff', overflow: 'hidden' }}>
        <div className="sup-hero" style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: '.56rem', letterSpacing: '.22em', opacity: .85, textTransform: 'uppercase' }}>今月の売上（成約受注額）</div>
            <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '34px', letterSpacing: '-.03em', marginTop: 6, lineHeight: 1.05 }}>
              <span style={{ fontSize: '1rem', opacity: .8, marginRight: 4 }}>¥</span><CountUp value={wf.companyRevenue} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
              <span style={{ fontSize: '.62rem', opacity: .9 }}>{wf.monthCount}件</span>
              {wfLast.companyRevenue > 0 && (
                <span style={{ fontSize: '.6rem', background: 'rgba(255,255,255,.16)', borderRadius: 999, padding: '3px 10px' }}>
                  {wf.companyRevenue >= wfLast.companyRevenue ? '▲' : '▼'} 前月比{Math.abs(Math.round((wf.companyRevenue - wfLast.companyRevenue) / wfLast.companyRevenue * 100))}%
                </span>
              )}
            </div>
          </div>
          <a href="/app/s/partners" style={{ flexShrink: 0, fontSize: '.74rem', fontWeight: 500, color: 'var(--c-blue)', background: '#fff', borderRadius: 999, minHeight: 44, padding: '0 20px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>パートナーを増やす →</a>
        </div>
      </div>

      {/* 数字カード3枚（MBダッシュボードと同一のKpiCard・同グリッド文法） */}
      <div className="stagger sup-kpi" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 16 }}>
        <KpiCard label="進行中の案件" value={inProgress} suffix="件" icon="deal" />
        <KpiCard label="パートナー" value={teamN} suffix={`名${teamNew > 0 ? ` ・ 今月+${teamNew}` : ''}`} icon="users" />
        <KpiCard label="今月のお支払い見込み" value={previewTotal} format="yen" icon="cost" delta={lastPreviewTotal > 0 ? { cur: previewTotal, prev: lastPreviewTotal } : undefined} sub={lastPreviewTotal > 0 ? undefined : '月末締め'} />
      </div>

      {/* お金の内訳（サプライヤー版ウォーターフォール・MBダッシュボードと同一部品/余白・単一ソース=supplierWaterfall） */}
      <SectionTitle title="お金の内訳" />
      <div className="card-hover ui-card" style={{ background: 'var(--s-0)', border: '0.5px solid var(--line)', borderRadius: 14, padding: '18px 22px' }}>
        <WaterRow label="総受注額" val={wf.companyRevenue} pct={wf.companyRevenue > 0 ? 100 : 0} color="var(--c-blue)" head />
        <WaterRow label="紹介者への報酬" val={wf.rewardsMonth} pct={wf.companyRevenue > 0 ? Math.round(wf.rewardsMonth / wf.companyRevenue * 100) : 0} color="var(--blue-dk)" minus />
        <WaterRow label="MB Partners手数料" val={wf.mbFee} pct={wf.companyRevenue > 0 ? Math.round(wf.mbFee / wf.companyRevenue * 100) : 0} color="var(--gauge-deduction)" minus />
        <div style={{ borderTop: '1.5px solid var(--line)', marginTop: 8, paddingTop: 10 }}>
          <WaterRow label="あなたの会社の手残り" val={wf.takeHome} pct={wf.companyRevenue > 0 ? Math.round(Math.max(0, wf.takeHome) / wf.companyRevenue * 100) : 0} color={wf.takeHome >= 0 ? 'var(--c-blue)' : 'var(--red)'} strong />
        </div>
      </div>

      {/* パートナーの成果（旧・パートナーページのヒーローを吸収）＋パイプライン */}
      <div className="sup-2col" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 16 }}>
        <div>
          <SectionTitle title="パートナーの成果" />
          <div style={{ ...CARD, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '13px 15px', borderBottom: '0.5px solid var(--line)' }}>
              <span style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 500 }}>今月生んだ売上</span>
              <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.05rem', fontWeight: 500 }}>¥{netRevenue.toLocaleString()}</span>
              <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>{netCount}件 ・ {teamN}名</span>
              <a href="/app/s/partners" style={{ marginLeft: 'auto', fontSize: '.64rem', color: 'var(--c-blue)', textDecoration: 'none', flexShrink: 0 }}>一覧 →</a>
            </div>
            {topSubs.length === 0 ? (
              <p style={{ fontSize: '.7rem', color: 'var(--muted2)', padding: '12px 15px', margin: 0 }}>今月の成約はまだありません。</p>
            ) : topSubs.map(([pid, rev], i) => (
              <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 15px', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)', fontSize: '.72rem' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{subNames[pid] ?? pid.slice(0, 8)}</span>
                <span className="tnum" style={{ fontFamily: 'Inter' }}>¥{rev.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionTitle title="パイプライン" />
          <div style={{ ...CARD, padding: '13px 15px' }}>
            <div style={{ display: 'flex' }}>
              {[['受付', received], ['対応中', negotiating], ['進行中 計', pipelineDeals.length]].map(([l, v], i) => (
                <div key={String(l)} style={{ flex: 1, textAlign: 'center', borderLeft: i === 0 ? 'none' : '0.5px solid var(--line)' }}>
                  <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.05rem', fontWeight: 500 }}>{String(v)}</div>
                  <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 2 }}>{String(l)}</div>
                </div>
              ))}
            </div>
            <a href="/app/s/deals" style={{ display: 'inline-block', marginTop: 10, fontSize: '.64rem', color: 'var(--c-blue)', textDecoration: 'none' }}>案件一覧 →</a>
          </div>
        </div>
      </div>

      <div className="sup-2col" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginTop: 16 }}>
        {/* 要対応 */}
        <div>
          <SectionTitle title="次の一手" />
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
          <SectionTitle title="今月の流れ" />
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
      </div>
      <style>{`@media (min-width:1024px){ .sup-2col{grid-template-columns:1fr 1fr !important} }
@media (min-width:768px){ .sup-kpi{grid-template-columns:repeat(3,1fr) !important} }
.sup-new{animation:supNew 1.6s ease-out}
@keyframes supNew{from{background:var(--blue-bg2)}to{background:transparent}}
@media (prefers-reduced-motion:reduce){.sup-new{animation:none}}`}</style>
    </>
  )
}
