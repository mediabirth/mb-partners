import { redirect } from 'next/navigation'
import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
import PageGuide from '@/components/PageGuide'
import { SG_MONEY } from '@/lib/supplier-guides'
/**
 * お金: 「払う（MBへ・委託先）」と「もらう（紹介報酬）」の2カラム（PC）。
 * ★数字は単一ソース＝computeCharges（請求と同一）・supplier_charges・deals.amount（支払と同一入力）。
 */
const KIND_JP: Record<string, string> = { omnis_monthly: '月額（プラン基本料）', half_commission: '折半手数料（粗利50%）', passthrough_revenue_fee: '販売手数料（受注額5%）', payment_fee_5: '決済手数料（5%）' }
const CHG_ST: Record<string, { label: string; color: string }> = { unbilled: { label: '締め済み・請求書待ち', color: 'var(--muted2)' }, invoiced: { label: '請求済み', color: 'var(--c-blue)' }, settled: { label: 'お支払い確認済み', color: 'var(--green)' } }
const yen = (n: number) => `¥${Number(n || 0).toLocaleString()}`

export default async function SupplierMoneyPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: me } = await supabase.from('partners').select('id, supplier_rate_card').eq('profile_id', user!.id).maybeSingle()
  if (!me) redirect('/app')
  const admin = await createServiceRoleClient()
  if (!me!.supplier_rate_card) {
    const { data: sv } = await admin.from('services').select('id').eq('supplier_partner_id', me!.id).limit(1)
    if (!sv?.length) redirect('/app')
  }
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const { computeCharges } = await import('@/lib/supplier-charges')
  const { rows: preview } = await computeCharges(admin, me!.id, ym).catch(() => ({ rows: [] as never[] }))
  const previewTotal = preview.reduce((s, r) => s + Number((r as { amount: number }).amount), 0)
  const { data: charges } = await admin.from('supplier_charges').select('id, kind, period, amount, status').eq('supplier_partner_id', me!.id).order('period', { ascending: false }).limit(24)
  // 委託（自社案件に紐づく分）
  const { data: myBrands } = await admin.from('services').select('id').eq('supplier_partner_id', me!.id)
  let asgSummary = { proposed: 0, accepted: 0, delivered: 0 }
  if ((myBrands ?? []).length) {
    const { data: ds } = await admin.from('deals').select('id').in('service_id', (myBrands ?? []).map(b => b.id))
    if ((ds ?? []).length) {
      const { data: asg } = await admin.from('delivery_assignments').select('status').in('deal_id', (ds ?? []).map(d => d.id))
      for (const a of asg ?? []) {
        if (a.status === 'proposed') asgSummary.proposed++
        else if (a.status === 'accepted' || a.status === 'assigned') asgSummary.accepted++
        else if (a.status === 'delivered') asgSummary.delivered++
      }
    }
  }
  // もらう: 本人の紹介報酬（支払と同一入力=deals.amount）
  const { data: own } = await admin.from('deals').select('amount, status, fixed_month, created_at').eq('partner_id', me!.id).in('status', ['confirmed', 'paid'])
  const inMonth = (d: { fixed_month?: string | null; created_at: string }) => ((d.fixed_month ?? d.created_at) || '').slice(0, 7) === ym
  const ownMonth = (own ?? []).filter(inMonth).reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const ownTotal = (own ?? []).reduce((s, d) => s + (Number(d.amount) || 0), 0)

  const CARD: React.CSSProperties = { background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13 }
  const H2: React.CSSProperties = { fontSize: '.78rem', fontWeight: 700, margin: '0 0 8px' }
  const SUB: React.CSSProperties = { fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', padding: '11px 15px 4px' }

  return (
    <div className="page-anim" style={{ padding: '18px 18px 40px', maxWidth: 980, margin: '0 auto', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h1 style={{ fontSize: '.95rem', fontWeight: 700 }}>お金</h1>
        <PageGuide data={SG_MONEY} />
      </div>
      <div className="sup-money" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
        {/* 払う */}
        <div>
          <h2 style={H2}>払う（MBへ）</h2>
          <div style={{ ...CARD, overflow: 'hidden', marginBottom: 10 }}>
            <div style={SUB}>今月のお支払い見込み（{ym.replace('-', '年')}月・税抜）</div>
            {preview.length === 0 ? (
              <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '4px 15px 13px', margin: 0 }}>今月分の対象はまだありません。</p>
            ) : (
              <>
                {(preview as { kind: string; amount: number; snapshot?: { customer?: string } }[]).map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 15px', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)', fontSize: '.72rem' }}>
                    <span>{KIND_JP[r.kind] ?? r.kind}{r.snapshot?.customer ? <span style={{ color: 'var(--muted2)', fontSize: '.6rem' }}> ・ {r.snapshot.customer}</span> : null}</span>
                    <span className="tnum" style={{ fontFamily: 'Inter' }}>{yen(Number(r.amount))}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 15px', borderTop: '0.5px solid var(--line)', fontSize: '.74rem', fontWeight: 700 }}>
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
          <div style={{ ...CARD, padding: '11px 15px' }}>
            <div style={{ fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 6 }}>委託先への支払い（MBの月次サイクルで実施）</div>
            <div style={{ display: 'flex', gap: 0 }}>
              {[['提示中', asgSummary.proposed], ['了承済', asgSummary.accepted], ['納品済み', asgSummary.delivered]].map(([l, v], i) => (
                <div key={String(l)} style={{ flex: 1, textAlign: 'center', borderLeft: i === 0 ? 'none' : '0.5px solid var(--line)' }}>
                  <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '.95rem', fontWeight: 700 }}>{String(v)}</div>
                  <div style={{ fontSize: '.56rem', color: 'var(--muted2)', marginTop: 2 }}>{String(l)}</div>
                </div>
              ))}
            </div>
          </div>
          <p style={{ fontSize: '.6rem', color: 'var(--muted2)', margin: '8px 2px 0' }}>お支払いは、MBからお送りする請求書に記載の口座へお願いします。</p>
        </div>
        {/* もらう */}
        <div>
          <h2 style={H2}>もらう（あなたへ）</h2>
          <div style={{ ...CARD, padding: '13px 15px' }}>
            <div style={{ fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)' }}>あなたの紹介報酬（今月・成約以降）</div>
            <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.2rem', fontWeight: 700, marginTop: 4 }}>{yen(ownMonth)}</div>
            <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 6 }}>累計 {yen(ownTotal)} ・ 網の還元と合わせて月次で振込</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <a href="/app/rewards" style={{ fontSize: '.68rem', color: 'var(--c-blue)', textDecoration: 'none' }}>報酬明細 ›</a>
              <a href="/app/s/network" style={{ fontSize: '.68rem', color: 'var(--c-blue)', textDecoration: 'none' }}>網の還元 ›</a>
            </div>
          </div>
        </div>
      </div>
      <style>{`@media (min-width:1024px){ .sup-money{grid-template-columns:3fr 2fr !important} }`}</style>
    </div>
  )
}
