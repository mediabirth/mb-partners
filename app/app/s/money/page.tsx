import { redirect } from 'next/navigation'
import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
import { CONTENT, SectionTitle } from '../SupplierChrome'
import { SG_MONEY } from '@/lib/supplier-guides'
import { WaterRow } from '@/components/ui/KpiCard'
import { waterfallFromDeals } from '@/lib/supplier-money'
import EvidenceClip from './EvidenceClip'
import MoneyTabs from './MoneyTabs'
/**
 * お金（洗練 2026-07-14）: MBコンソール「支払」の文法を供給者の立場に翻訳した唯一の画面。
 *   タブ①お支払い（MB Partnersへ）／②お受け取り（あなたへ）。各タブは 見込み→履歴→状態 の同じ縦構造。
 * ★数字は単一ソース＝supplierWaterfall（内部=computeCharges・請求と同一）・supplier_charges・deals.amount（支払と同一入力）。独自計算ゼロ。
 * ★内訳バーは components/ui/KpiCard の WaterRow（MBダッシュボードと同一実装）。
 */
const KIND_JP: Record<string, string> = { omnis_monthly: '月額利用料', half_commission: 'サービス利用料', passthrough_revenue_fee: '販売手数料', payment_fee_5: '決済手数料' }
const CHG_ST: Record<string, { label: string; color: string }> = { unbilled: { label: '締め済み・請求書待ち', color: 'var(--muted2)' }, invoiced: { label: '請求済み', color: 'var(--c-blue)' }, settled: { label: 'お支払い確認済み', color: 'var(--green)' } }
const yen = (n: number) => `¥${Number(n || 0).toLocaleString()}`

export default async function SupplierMoneyPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: me } = await supabase.from('partners').select('id, is_frontier, supplier_rate_card, bank').eq('profile_id', user!.id).maybeSingle()
  if (!me) redirect('/app')
  const admin = await createServiceRoleClient()
  if (!me!.supplier_rate_card) {
    const { data: sv } = await admin.from('services').select('id').eq('supplier_partner_id', me!.id).limit(1)
    if (!sv?.length) redirect('/app')
  }
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const inMonth = (d: { fixed_month?: string | null; created_at: string }) => ((d.fixed_month ?? d.created_at) || '').slice(0, 7) === ym
  const { computeCharges } = await import('@/lib/supplier-charges')
  // 無音A(2026-07-18): 直列だった取得を2段の並列へ（値・語彙・境界は不変／wfは取得済みdealsから純関数で導出）
  const [{ rows: preview }, chargesRes, myBrandsRes, ownRes, subsRes] = await Promise.all([
    computeCharges(admin, me!.id, ym).catch(() => ({ rows: [] as never[], warnings: [] as never[] })),
    admin.from('supplier_charges').select('id, kind, period, amount, status, deal_id').eq('supplier_partner_id', me!.id).order('period', { ascending: false }).limit(24),
    admin.from('services').select('id').eq('supplier_partner_id', me!.id),
    admin.from('deals').select('amount, status, fixed_month, created_at').eq('partner_id', me!.id).in('status', ['confirmed', 'paid']),
    (me as { is_frontier?: boolean }).is_frontier ? admin.from('partners').select('id, frontier_id, frontier_linked_at').eq('frontier_id', me!.id) : Promise.resolve({ data: [] as never[] }),
  ])
  const previewTotal = preview.reduce((s, r) => s + Number((r as { amount: number }).amount), 0)
  const charges = chargesRes.data
  const myBrands = myBrandsRes.data
  const own = ownRes.data
  const subs0 = (subsRes.data ?? []) as { id: string; frontier_id: string | null; frontier_linked_at: string | null }[]

  // ベンダー純化P2: 請求該当行の売上エビデンス参照（📎・署名URLはクリック時に発行）
  const evDealIds = [...new Set([...(preview as { deal_id?: string | null }[]).map(r => r.deal_id), ...(charges ?? []).map(c => (c as { deal_id?: string | null }).deal_id)].filter(Boolean))] as string[]
  const evByDeal: Record<string, { id: string; label: string | null }[]> = {}
  if (evDealIds.length) {
    const { data: evs } = await admin.from('deal_evidences').select('id, deal_id, label').in('deal_id', evDealIds)
    for (const e of evs ?? []) (evByDeal[e.deal_id as string] ??= []).push({ id: e.id as string, label: (e.label as string) ?? null })
  }
  // ② 紹介者別の内訳（氏名主体＋コード小・service role読取=RLS名前落ちなし・数字は支払と同一入力 deals.amount）
  // ③ 委託先への委託費（アサイン別・支払はMB Partnersが代行）— 名前解決は service role 経由（RLS名前落ちなし）
  const brandIds0 = (myBrands ?? []).map(b => b.id)
  const [mdsRes, dsAllRes] = await Promise.all([
    brandIds0.length
      ? admin.from('deals').select('partner_id, amount, status, fixed_month, created_at, deal_items(revenue), partners(code, is_system, company_name, profiles(name))').in('service_id', brandIds0).in('status', ['confirmed', 'paid'])
      : Promise.resolve({ data: [] as never[] }),
    brandIds0.length
      ? admin.from('deals').select('id, customer_name, customer_type, company_name, contact_name').in('service_id', brandIds0)
      : Promise.resolve({ data: [] as never[] }),
  ])
  const wf = waterfallFromDeals((mdsRes.data ?? []) as never, previewTotal, ym)
  let refRows: { name: string; code: string | null; amount: number; count: number }[] = []
  if ((myBrands ?? []).length) {
    const mds = mdsRes.data
    const byP = new Map<string, { name: string; code: string | null; amount: number; count: number }>()
    for (const d0 of (mds ?? []) as unknown as { partner_id: string | null; amount: number | null; status: string; fixed_month: string | null; created_at: string; partners: { code: string; is_system: boolean; company_name: string | null; profiles: { name: string | null } | null } | null }[]) {
      if (!d0.partner_id || !inMonth(d0)) continue
      const pa = d0.partners
      const name = pa?.is_system ? 'MB Partners（直接）' : (pa?.company_name || pa?.profiles?.name || pa?.code || '—')
      const cur = byP.get(d0.partner_id) ?? { name, code: pa?.is_system ? null : ((pa?.company_name || pa?.profiles?.name) ? pa?.code ?? null : null), amount: 0, count: 0 }
      cur.amount += Number(d0.amount) || 0; cur.count += 1
      byP.set(d0.partner_id, cur)
    }
    refRows = [...byP.values()].sort((a, b) => b.amount - a.amount)
  }
  let asgRows: { name: string; customer: string; base_fee: number; status: string | null }[] = []
  if ((myBrands ?? []).length) {
    const dsAll = dsAllRes.data
    const idsAll = (dsAll ?? []).map(x => x.id)
    if (idsAll.length) {
      const { data: asg } = await admin.from('delivery_assignments').select('deal_id, delivery_id, base_fee, status').in('deal_id', idsAll).neq('status', 'declined')
      const dlvIds = [...new Set((asg ?? []).map(a => a.delivery_id))]
      const { data: dlvs } = dlvIds.length ? await admin.from('deliveries').select('id, name').in('id', dlvIds) : { data: [] as never[] }
      const { customerHonorific } = await import('@/lib/customer')
      asgRows = (asg ?? []).map(a => ({
        name: ((dlvs ?? []) as { id: string; name: string }[]).find(v => v.id === a.delivery_id)?.name ?? '委託先',
        customer: customerHonorific(((dsAll ?? []).find(x => x.id === a.deal_id) ?? {}) as never),
        base_fee: Number(a.base_fee) || 0,
        status: a.status,
      }))
    }
  }
  // もらう: 本人の紹介報酬（支払と同一入力=deals.amount・段1で取得済み）
  const ownMonth = (own ?? []).filter(inMonth).reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const ownTotal = (own ?? []).reduce((s, d) => s + (Number(d.amount) || 0), 0)
  // 網の還元（MB Partnersメニュー分・支払と同一規則）
  let netKick = 0
  if ((me as { is_frontier?: boolean }).is_frontier) {
    const [{ computeOverrides }, { loadSupplierFrontiers }] = await Promise.all([import('@/lib/frontier'), import('@/lib/frontier-payout')])
    const subs = subs0
    if ((subs ?? []).length) {
      const { data: sd } = await admin.from('deals').select('partner_id, amount, status, fixed_month, created_at, fee_snapshot').in('partner_id', (subs ?? []).map(s => s.id))
      const linkById: Record<string, { frontier_id: string | null; frontier_linked_at: string | null }> = {}
      for (const s of subs ?? []) linkById[s.id] = { frontier_id: s.frontier_id, frontier_linked_at: s.frontier_linked_at }
      netKick = computeOverrides((sd ?? []) as never, linkById, ym, await loadSupplierFrontiers(admin))[me!.id] ?? 0
    }
  }
  const bank = (me as { bank?: { bank_name?: string; branch_name?: string; account_type?: string; account_number?: string; account_holder?: string } | null }).bank ?? null

  const CARD: React.CSSProperties = { background: 'var(--s-0, #fff)', border: '0.5px solid var(--line)', borderRadius: 14 }
  const SUB: React.CSSProperties = { fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', padding: '11px 15px 4px' }

  // ── タブ① お支払い（MB Partnersへ）: 内訳（ウォーターフォール）→ 見込み → 履歴 → 代行区分 ──
  const payPanel = (
    <div style={{ ...CONTENT, maxWidth: 880 }}>
      {/* お金の内訳（MBダッシュボードと同一部品・単一ソース=supplierWaterfall） */}
      <SectionTitle title="お金の内訳" subtitle="今月・税抜。手数料は請求と同一計算です。" />
      <div className="card-hover ui-card" style={{ background: 'var(--s-0)', border: '0.5px solid var(--line)', borderRadius: 14, padding: '18px 22px', marginBottom: 20 }}>
        <WaterRow label="総受注額" val={wf.companyRevenue} pct={wf.companyRevenue > 0 ? 100 : 0} color="var(--c-blue)" head />
        <WaterRow label="紹介者への報酬" val={wf.rewardsMonth} pct={wf.companyRevenue > 0 ? Math.round(wf.rewardsMonth / wf.companyRevenue * 100) : 0} color="var(--blue-dk)" minus />
        <WaterRow label="MB Partners手数料" val={wf.mbFee} pct={wf.companyRevenue > 0 ? Math.round(wf.mbFee / wf.companyRevenue * 100) : 0} color="var(--gauge-deduction)" minus />
        <div style={{ borderTop: '1.5px solid var(--line)', marginTop: 8, paddingTop: 10 }}>
          <WaterRow label="あなたの会社の手残り" val={wf.takeHome} pct={wf.companyRevenue > 0 ? Math.round(Math.max(0, wf.takeHome) / wf.companyRevenue * 100) : 0} color={wf.takeHome >= 0 ? 'var(--c-blue)' : 'var(--red)'} strong />
        </div>
      </div>

      {/* ① MB Partnersへ（直接のお振込）: 見込み → 履歴（状態つき） */}
      <SectionTitle title="① MB Partnersへのお支払い" subtitle="MB Partnersからお送りする請求書に記載の口座へお振込みください。" />
      <div style={{ ...CARD, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ ...SUB, display: 'flex', alignItems: 'baseline', gap: 8 }}>今月のお支払い見込み<span style={{ fontSize: '.54rem', fontWeight: 400, color: 'var(--muted)' }}>{ym.replace('-', '年')}月・税抜</span></div>
        {preview.length === 0 ? (
          <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '4px 15px 13px', margin: 0 }}>今月分の対象はまだありません。</p>
        ) : (
          <>
            {(preview as { kind: string; amount: number; deal_id?: string | null; snapshot?: { customer?: string } }[]).map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '9px 15px', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)', fontSize: '.72rem' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{KIND_JP[r.kind] ?? r.kind}{r.snapshot?.customer ? <span style={{ color: 'var(--muted2)', fontSize: '.6rem' }}> ・ {r.snapshot.customer}</span> : null}</span>
                {r.deal_id && evByDeal[r.deal_id] ? <EvidenceClip evidences={evByDeal[r.deal_id]} /> : null}
                <span className="tnum" style={{ fontFamily: 'Inter', flexShrink: 0 }}>{yen(Number(r.amount))}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 15px', borderTop: '0.5px solid var(--line)', fontSize: '.74rem', fontWeight: 500 }}>
              <span>合計（見込み）</span><span className="tnum" style={{ fontFamily: 'Inter' }}>{yen(previewTotal)}</span>
            </div>
          </>
        )}
      </div>
      <div style={{ ...CARD, overflow: 'hidden', marginBottom: 20 }}>
        <div style={SUB}>請求の履歴</div>
        {(charges ?? []).length === 0 ? (
          <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '4px 15px 13px', margin: 0 }}>確定済みの請求はまだありません。</p>
        ) : (charges ?? []).map((c, i) => {
          const st = CHG_ST[c.status] ?? { label: c.status, color: 'var(--muted2)' }
          const evs = (c as { deal_id?: string | null }).deal_id ? evByDeal[(c as { deal_id?: string | null }).deal_id as string] : undefined
          return (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 15px', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)', fontSize: '.7rem' }}>
              <span className="tnum" style={{ fontFamily: 'Inter', color: 'var(--muted2)', flexShrink: 0 }}>{c.period}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{KIND_JP[c.kind] ?? c.kind}</span>
              {evs ? <EvidenceClip evidences={evs} /> : null}
              <span className="tnum" style={{ fontFamily: 'Inter' }}>{yen(Number(c.amount))}</span>
              <span style={{ fontSize: '.56rem', fontWeight: 500, color: st.color, flexShrink: 0 }}>{st.label}</span>
            </div>
          )
        })}
      </div>

      {/* ②③ MB Partnersが支払いを代行する区分（あなたの振込は不要） */}
      <SectionTitle title="② 紹介者（パートナー）への報酬" subtitle="お支払いはMB Partnersが代行します。" />
      <div style={{ ...CARD, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', padding: '12px 15px', borderBottom: refRows.length ? '0.5px solid var(--line)' : 'none' }}>
          <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.05rem', fontWeight: 500 }}>{yen(wf.rewardsMonth)}</span>
          <span style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>今月の成約 {wf.monthCount}件分</span>
        </div>
        {/* 紹介者別（氏名主体＋コード小） */}
        {refRows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 15px', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)', fontSize: '.72rem' }}>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
              {r.name}{r.code && <span className="tnum" style={{ fontSize: '.56rem', color: 'var(--muted2)', fontWeight: 500, fontFamily: 'Inter', marginLeft: 6 }}>{r.code}</span>}
            </span>
            <span style={{ fontSize: '.6rem', color: 'var(--muted2)', flexShrink: 0 }}>{r.count}件</span>
            <span className="tnum" style={{ fontFamily: 'Inter', flexShrink: 0 }}>{yen(r.amount)}</span>
          </div>
        ))}
      </div>

      <SectionTitle title="③ 委託先への委託費" subtitle="お支払いはMB Partnersが代行します（月次サイクル）。" />
      <div style={{ ...CARD, overflow: 'hidden' }}>
        {asgRows.length === 0 ? (
          <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '13px 15px', margin: 0 }}>委託はまだありません（案件の詳細から提示できます）。</p>
        ) : (
          <>
            {asgRows.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 15px', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)', fontSize: '.72rem' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}<span style={{ color: 'var(--muted2)', fontSize: '.6rem' }}> ・ {a.customer}</span></span>
                <span className="tnum" style={{ fontFamily: 'Inter' }}>{yen(a.base_fee)}</span>
                <span style={{ fontSize: '.56rem', fontWeight: 500, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 999, padding: '3px 9px', flexShrink: 0 }}>{a.status === 'proposed' ? '提示中' : a.status === 'delivered' ? '納品済み' : '了承済'}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 15px', borderTop: '0.5px solid var(--line)', fontSize: '.72rem' }}>
              <span style={{ color: 'var(--muted2)' }}>合計</span>
              <span className="tnum" style={{ fontFamily: 'Inter', fontWeight: 500 }}>{yen(asgRows.reduce((s2, a) => s2 + a.base_fee, 0))}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )

  // ── タブ② お受け取り（あなたへ）: 見込み → 内訳 → 振込先口座 ──
  const receivePanel = (
    <div style={{ ...CONTENT, maxWidth: 880 }}>
      <SectionTitle title="今月のお受け取り" subtitle="あなた自身の紹介分と、紹介者の還元（MB Partnersメニュー分）の合算です。" />
      <div style={{ ...CARD, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '12px 15px', borderBottom: '0.5px solid var(--line)' }}>
          <div style={{ fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)' }}>今月のお受け取り見込み</div>
          <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.25rem', fontWeight: 500, marginTop: 4 }}>{yen(ownMonth + netKick)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 15px', fontSize: '.72rem' }}>
          <span style={{ color: 'var(--muted2)' }}>あなたの紹介分</span><span className="tnum" style={{ fontFamily: 'Inter' }}>{yen(ownMonth)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 15px', borderTop: '0.5px solid var(--line)', fontSize: '.72rem' }}>
          <span style={{ color: 'var(--muted2)' }}>紹介者の還元（MB Partnersメニュー分）</span><span className="tnum" style={{ fontFamily: 'Inter' }}>{yen(netKick)}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, padding: '10px 15px', borderTop: '0.5px solid var(--line)' }}>
          <a href="/app/rewards" style={{ fontSize: '.68rem', color: 'var(--c-blue)', textDecoration: 'none' }}>報酬明細 →</a>
          <span style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>累計 {yen(ownTotal)}</span>
        </div>
      </div>
      <SectionTitle title="振込先口座" />
      <div style={{ ...CARD, padding: '12px 15px' }}>
        {bank?.bank_name ? (
          <div style={{ fontSize: '.74rem', lineHeight: 1.8 }}>
            {bank.bank_name} {bank.branch_name}<br />
            {bank.account_type ?? '普通'} <span className="tnum" style={{ fontFamily: 'Inter' }}>{bank.account_number}</span> ・ {bank.account_holder}
          </div>
        ) : <p style={{ fontSize: '.72rem', color: 'var(--muted2)', margin: 0 }}>未登録です。</p>}
        <a href="/app/s/settings" style={{ display: 'inline-block', marginTop: 8, fontSize: '.66rem', color: 'var(--c-blue)', textDecoration: 'none' }}>口座の変更は設定から →</a>
      </div>
    </div>
  )

  return (
    <div className="page-anim">
      <MoneyTabs guide={SG_MONEY} pay={payPanel} receive={receivePanel} />
    </div>
  )
}
