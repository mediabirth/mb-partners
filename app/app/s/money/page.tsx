import { redirect } from 'next/navigation'
import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
import { SupplierTopbar, CONTENT } from '../SupplierChrome'
import { SG_MONEY } from '@/lib/supplier-guides'
/**
 * お金: 「払う（MBへ・委託先）」と「もらう（紹介報酬）」の2カラム（PC）。
 * ★数字は単一ソース＝computeCharges（請求と同一）・supplier_charges・deals.amount（支払と同一入力）。
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
  const { rows: preview } = await computeCharges(admin, me!.id, ym).catch(() => ({ rows: [] as never[] }))
  const previewTotal = preview.reduce((s, r) => s + Number((r as { amount: number }).amount), 0)
  const { data: charges } = await admin.from('supplier_charges').select('id, kind, period, amount, status').eq('supplier_partner_id', me!.id).order('period', { ascending: false }).limit(24)
  // ② パートナーへの報酬（今月・自社メニュー成約分＝deals.amount・支払はMB Partnersが代行）
  // ③ 委託先への委託費（アサイン別・支払はMB Partnersが代行）
  const { data: myBrands } = await admin.from('services').select('id').eq('supplier_partner_id', me!.id)
  let partnerRewardMonth = 0, partnerRewardCount = 0
  let asgRows: { name: string; customer: string; base_fee: number; status: string | null }[] = []
  if ((myBrands ?? []).length) {
    const { data: ds } = await admin.from('deals').select('id, customer_name, customer_type, company_name, contact_name, amount, status, fixed_month, created_at').in('service_id', (myBrands ?? []).map(b => b.id)).in('status', ['confirmed', 'paid'])
    for (const dd of (ds ?? [])) {
      if (inMonth(dd)) { partnerRewardMonth += Number(dd.amount) || 0; partnerRewardCount++ }
    }
    const { data: dsAll } = await admin.from('deals').select('id, customer_name, customer_type, company_name, contact_name').in('service_id', (myBrands ?? []).map(b => b.id))
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
  // もらう: 本人の紹介報酬（支払と同一入力=deals.amount）
  const { data: own } = await admin.from('deals').select('amount, status, fixed_month, created_at').eq('partner_id', me!.id).in('status', ['confirmed', 'paid'])
  const ownMonth = (own ?? []).filter(inMonth).reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const ownTotal = (own ?? []).reduce((s, d) => s + (Number(d.amount) || 0), 0)
  // 網の還元（MB Partnersメニュー分・支払と同一規則）
  let netKick = 0
  if ((me as { is_frontier?: boolean }).is_frontier) {
    const [{ computeOverrides }, { loadSupplierFrontiers }] = await Promise.all([import('@/lib/frontier'), import('@/lib/frontier-payout')])
    const { data: subs } = await admin.from('partners').select('id, frontier_id, frontier_linked_at').eq('frontier_id', me!.id)
    if ((subs ?? []).length) {
      const { data: sd } = await admin.from('deals').select('partner_id, amount, status, fixed_month, created_at, fee_snapshot').in('partner_id', (subs ?? []).map(s => s.id))
      const linkById: Record<string, { frontier_id: string | null; frontier_linked_at: string | null }> = {}
      for (const s of subs ?? []) linkById[s.id] = { frontier_id: s.frontier_id, frontier_linked_at: s.frontier_linked_at }
      netKick = computeOverrides((sd ?? []) as never, linkById, ym, await loadSupplierFrontiers(admin))[me!.id] ?? 0
    }
  }
  const bank = (me as { bank?: { bank_name?: string; branch_name?: string; account_type?: string; account_number?: string; account_holder?: string } | null }).bank ?? null

  const CARD: React.CSSProperties = { background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14 }
  const H2: React.CSSProperties = { fontSize: '11px', fontWeight: 500, letterSpacing: '.08em', color: 'var(--t-tertiary)', margin: '4px 2px 12px', borderBottom: '0.5px solid var(--line)', paddingBottom: 8 }
  const SUB: React.CSSProperties = { fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', padding: '11px 15px 4px' }

  return (
    <div className="page-anim">
      <SupplierTopbar title="お金" guide={SG_MONEY} />
      <div style={{ ...CONTENT }}>
      <div className="sup-money" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
        {/* あなたのお支払い（3区分＝①MBへ直接／②パートナーへ=MB代行／③委託先へ=MB代行） */}
        <div>
          <h2 style={H2}>① MB Partnersへのお支払い</h2>
          <div style={{ ...CARD, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ ...SUB, display: 'flex', alignItems: 'baseline', gap: 8 }}>今月のお支払い見込み<span style={{ fontSize: '.54rem', fontWeight: 400, color: 'var(--muted)' }}>{ym.replace('-', '年')}月・税抜</span></div>
            {preview.length === 0 ? (
              <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '4px 15px 13px', margin: 0 }}>今月分の対象はまだありません。</p>
            ) : (
              <>
                {(preview as { kind: string; amount: number; snapshot?: { customer?: string } }[]).map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '9px 15px', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)', fontSize: '.72rem' }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{KIND_JP[r.kind] ?? r.kind}{r.snapshot?.customer ? <span style={{ color: 'var(--muted2)', fontSize: '.6rem' }}> ・ {r.snapshot.customer}</span> : null}</span>
                    <span className="tnum" style={{ fontFamily: 'Inter', flexShrink: 0 }}>{yen(Number(r.amount))}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 15px', borderTop: '0.5px solid var(--line)', fontSize: '.74rem', fontWeight: 500 }}>
                  <span>合計（見込み）</span><span className="tnum" style={{ fontFamily: 'Inter' }}>{yen(previewTotal)}</span>
                </div>
              </>
            )}
          </div>
          <div style={{ ...CARD, overflow: 'hidden', marginBottom: 10 }}>
            <div style={SUB}>請求の履歴</div>
            {(charges ?? []).length === 0 ? (
              <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '4px 15px 13px', margin: 0 }}>確定済みの請求はまだありません。</p>
            ) : (charges ?? []).map((c, i) => {
              const st = CHG_ST[c.status] ?? { label: c.status, color: 'var(--muted2)' }
              return (
                <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 15px', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)', fontSize: '.7rem' }}>
                  <span className="tnum" style={{ fontFamily: 'Inter', color: 'var(--muted2)', flexShrink: 0 }}>{c.period}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{KIND_JP[c.kind] ?? c.kind}</span>
                  <span className="tnum" style={{ fontFamily: 'Inter' }}>{yen(Number(c.amount))}</span>
                  <span style={{ fontSize: '.56rem', fontWeight: 500, color: st.color, flexShrink: 0 }}>{st.label}</span>
                </div>
              )
            })}
          </div>
          <h2 style={{ ...H2, marginTop: 20 }}>② パートナーへの報酬</h2>
          <div style={{ ...CARD, padding: '12px 15px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.05rem', fontWeight: 500 }}>{yen(partnerRewardMonth)}</span>
              <span style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>今月の成約 {partnerRewardCount}件分</span>
              <span style={{ marginLeft: 'auto', fontSize: '.56rem', fontWeight: 500, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>お支払いはMB Partnersが代行</span>
            </div>
          </div>

          <h2 style={{ ...H2, marginTop: 20 }}>③ 委託先への委託費</h2>
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
                  <span style={{ color: 'var(--muted2)' }}>合計 <span style={{ fontSize: '.56rem' }}>（お支払いはMB Partnersが代行）</span></span>
                  <span className="tnum" style={{ fontFamily: 'Inter', fontWeight: 500 }}>{yen(asgRows.reduce((s2, a) => s2 + a.base_fee, 0))}</span>
                </div>
              </>
            )}
          </div>
        </div>
        {/* お受け取り（紹介報酬＋網の還元を1カードに・下に振込先口座） */}
        <div>
          <h2 style={H2}>お受け取り</h2>
          <div style={{ ...CARD, overflow: 'hidden', marginBottom: 10 }}>
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
          <div style={{ ...CARD, padding: '12px 15px' }}>
            <div style={{ fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 6 }}>振込先口座</div>
            {bank?.bank_name ? (
              <div style={{ fontSize: '.74rem', lineHeight: 1.8 }}>
                {bank.bank_name} {bank.branch_name}<br />
                {bank.account_type ?? '普通'} <span className="tnum" style={{ fontFamily: 'Inter' }}>{bank.account_number}</span> ・ {bank.account_holder}
              </div>
            ) : <p style={{ fontSize: '.72rem', color: 'var(--muted2)', margin: 0 }}>未登録です。</p>}
            <a href="/app/s/settings" style={{ display: 'inline-block', marginTop: 8, fontSize: '.66rem', color: 'var(--c-blue)', textDecoration: 'none' }}>口座の変更は設定から →</a>
          </div>
        </div>
      </div>
      <style>{`.sup-money>div{min-width:0}
@media (min-width:1024px){ .sup-money{grid-template-columns:3fr 2fr !important} }`}</style>
      </div>
    </div>
  )
}
