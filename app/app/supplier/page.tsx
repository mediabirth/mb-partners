import { redirect } from 'next/navigation'
import { createClient, getCachedUser, createServiceRoleClient } from '@/lib/supabase/server'
import { customerHonorific } from '@/lib/customer'
import { DEAL_STATUS, ASSIGN_STATUS } from '@/lib/status'
import { loadRateCard } from '@/lib/supplier-fee'
import { computeCharges } from '@/lib/supplier-charges'

/**
 * サプライヤーポータル（Feature I-3）。supplier結線のあるパートナー本人だけに、
 * **自社分のみ**（供給ブランド・案件・請求・委託）を表示する。
 * ★データ境界: 全クエリを本人の partner id でスコープ（セッション由来・URL/クエリからは一切受けない）。
 *   他サプライヤー・他パートナーの報酬詳細・MB内部数字は構造的に取得しない。
 * ★表示は読み取り専用（このページからの書込ゼロ）。進行・お客さま対応はMB運営の管轄。
 */

const LINE = '1px solid var(--line)'
const yen = (n: number) => `¥${Number(n || 0).toLocaleString()}`
// 請求種別の対外語彙（copy-guideline 5f準拠・内部語を出さない）
const KIND_JP: Record<string, string> = {
  omnis_monthly: '月額（プラン基本料）',
  half_commission: '折半手数料（粗利50%）',
  passthrough_revenue_fee: '販売手数料（受注額5%）',
  payment_fee_5: '決済手数料（5%）',
}
// 請求状態の対外語彙（unbilled/invoiced/settled を日本語化）
const CHG_ST: Record<string, { label: string; color: string }> = {
  unbilled: { label: '締め済み・請求書待ち', color: 'var(--muted2)' },
  invoiced: { label: '請求済み', color: 'var(--c-blue)' },
  settled: { label: 'お支払い確認済み', color: 'var(--green)' },
}

export default async function SupplierPortalPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: me } = await supabase.from('partners').select('id, is_frontier, supplier_rate_card').eq('profile_id', user.id).single()
  if (!me) redirect('/app')

  const admin = await createServiceRoleClient()
  // 供給ブランド（自社スコープ・セッション由来のidのみ）
  const { data: brandsRaw } = await admin.from('services').select('id, name, active').eq('supplier_partner_id', me.id).order('sort')
  const brands = brandsRaw ?? []
  // サプライヤー判定＝カード付与 or ブランド結線（コンソールの定義と同一）。非該当は /app へ。
  if (!me.supplier_rate_card && brands.length === 0) redirect('/app')

  const card = await loadRateCard(admin, me.supplier_rate_card)
  const brandIds = brands.map(b => b.id)
  const nameByBrand: Record<string, string> = Object.fromEntries(brands.map(b => [b.id, b.name]))

  // 自社メニューの案件（読み取り専用・受注額=請求ベースのみ。他パートナーの報酬額は取得しない）
  let deals: { id: string; customer_name: string | null; customer_type: string | null; company_name: string | null; contact_name: string | null; status: string; created_at: string; fixed_month: string | null; service_id: string; deal_items: { revenue: number | null }[] | null }[] = []
  if (brandIds.length) {
    const { data } = await admin
      .from('deals')
      .select('id, customer_name, customer_type, company_name, contact_name, status, created_at, fixed_month, service_id, deal_items(revenue)')
      .in('service_id', brandIds)
      .neq('status', 'lost')
      .order('created_at', { ascending: false })
      .limit(30)
    deals = (data ?? []) as typeof deals
  }
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const revOf = (d: (typeof deals)[number]) => (d.deal_items ?? []).reduce((s, it) => s + (Number(it.revenue) || 0), 0)
  const monthDeals = deals.filter(d => ((d.fixed_month ?? d.created_at) || '').slice(0, 7) === ym && (d.status === 'confirmed' || d.status === 'paid'))
  const monthRevenue = monthDeals.reduce((s, d) => s + revOf(d), 0)

  // 今月の請求見込み（コンソールのクローズと同一計算＝乖離ゼロ・自社分のみ）
  const { rows: previewRows } = await computeCharges(admin, me.id, ym)
  const previewTotal = previewRows.reduce((s, r) => s + Number(r.amount), 0)

  // 確定済み請求の履歴（自社分のみ）
  const { data: chargesRaw } = await admin
    .from('supplier_charges')
    .select('id, kind, period, amount, status')
    .eq('supplier_partner_id', me.id)
    .order('period', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(24)
  const charges = chargesRaw ?? []

  // 委託先への支払状況（自社ブランドの案件に紐づく割当のみ）
  let assigns: { status: string | null; base_fee: number | null }[] = []
  let paidTotal = 0
  let unpaidTotal = 0
  if (brandIds.length && deals.length) {
    const dealIds = deals.map(d => d.id)
    const { data: asg } = await admin.from('delivery_assignments').select('status, base_fee').in('deal_id', dealIds)
    assigns = asg ?? []
    const { data: dpi } = await admin.from('delivery_payout_items').select('amount, status').in('deal_id', dealIds)
    for (const p of dpi ?? []) {
      if (p.status === 'paid') paidTotal += Number(p.amount) || 0
      else unpaidTotal += Number(p.amount) || 0
    }
  }
  const asgCount = (keys: string[]) => assigns.filter(a => keys.includes(a.status ?? 'assigned')).length

  const H: React.CSSProperties = { fontSize: '.78rem', fontWeight: 500, margin: '0 0 8px' }
  const CARD: React.CSSProperties = { background: '#fff', border: LINE, borderRadius: 13, overflow: 'hidden' }

  return (
    <div className="page-anim" style={{ paddingBottom: 8 }}>
      {/* ヒーロー：自社メニューの今月流通額（MB経由でこれだけ売れている＝プランの価値を数字で） */}
      <div className="shine" style={{ margin: '18px 20px 0', background: 'linear-gradient(135deg,#5240F2 0%,#4733E6 52%,#3A28CE 100%)', color: '#fff', borderRadius: 18, padding: '22px 22px 18px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ fontSize: '.92rem', fontWeight: 500, letterSpacing: '-.01em' }}>自社メニューの今月の成約</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
          <span className="tnum" style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '2.1rem', letterSpacing: '-.02em' }}>{yen(monthRevenue)}</span>
          <span style={{ fontSize: '.66rem', opacity: .85 }}>受注額（税抜）・{monthDeals.length}件</span>
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.28)' }}>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>供給ブランド<span className="tnum" style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2 }}>{brands.length}</span></div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>進行中の案件<span className="tnum" style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2 }}>{deals.filter(d => d.status === 'received' || d.status === 'in_progress').length}</span></div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>今月のお支払い見込み<span className="tnum" style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2 }}>{yen(previewTotal)}</span></div>
        </div>
      </div>

      {/* 1. 自社メニューの案件（読み取り専用） */}
      <div style={{ padding: '18px 20px 0' }}>
        <h2 style={H}>自社メニューの案件</h2>
        <div style={CARD}>
          {deals.length === 0 ? (
            <p style={{ fontSize: '.74rem', color: 'var(--muted2)', padding: '18px 16px', margin: 0 }}>まだ案件がありません。メニューが公開されると、ここに紹介案件が並びます。</p>
          ) : deals.slice(0, 12).map((d, i) => {
            const st = DEAL_STATUS[d.status] ?? { label: d.status }
            const rev = revOf(d)
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: i === 0 ? 'none' : LINE }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customerHonorific(d)}</div>
                  <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 1 }}>{nameByBrand[d.service_id] ?? ''}</div>
                </div>
                <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.74rem', color: rev > 0 ? 'var(--txt)' : 'var(--muted)' }}>{rev > 0 ? yen(rev) : '—'}</span>
                <span style={{ fontSize: '.58rem', fontWeight: 500, padding: '3px 9px', borderRadius: 999, background: 'var(--bg2)', color: 'var(--muted2)', flexShrink: 0 }}>{st.label}</span>
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '8px 2px 0' }}>お客さま対応・進行はMBが担当します。内容のご相談はサポートからどうぞ。</p>
      </div>

      {/* 2. 月次のお金 */}
      <div style={{ padding: '18px 20px 0' }}>
        <h2 style={H}>月次のお金</h2>
        <div style={{ ...CARD, marginBottom: 10 }}>
          <div style={{ padding: '12px 16px 4px', fontSize: '.62rem', fontWeight: 500, color: 'var(--muted2)' }}>今月のお支払い見込み（{ym.replace('-', '年')}月・税抜）</div>
          {previewRows.length === 0 ? (
            <p style={{ fontSize: '.74rem', color: 'var(--muted2)', padding: '6px 16px 14px', margin: 0 }}>今月分の対象はまだありません。</p>
          ) : (
            <>
              {previewRows.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderTop: i === 0 ? 'none' : LINE, fontSize: '.74rem' }}>
                  <span>{KIND_JP[r.kind] ?? r.kind}{r.snapshot && (r.snapshot as { customer?: string }).customer ? <span style={{ color: 'var(--muted2)', fontSize: '.62rem' }}> ・ {(r.snapshot as { customer?: string }).customer}</span> : null}</span>
                  <span className="tnum" style={{ fontFamily: 'Inter' }}>{yen(Number(r.amount))}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderTop: LINE, fontSize: '.76rem', fontWeight: 500 }}>
                <span>合計（見込み）</span><span className="tnum" style={{ fontFamily: 'Inter' }}>{yen(previewTotal)}</span>
              </div>
            </>
          )}
        </div>
        <div style={CARD}>
          <div style={{ padding: '12px 16px 4px', fontSize: '.62rem', fontWeight: 500, color: 'var(--muted2)' }}>確定済みの請求</div>
          {charges.length === 0 ? (
            <p style={{ fontSize: '.74rem', color: 'var(--muted2)', padding: '6px 16px 14px', margin: 0 }}>確定済みの請求はまだありません。月末の締め後にここへ並びます。</p>
          ) : charges.map((c, i) => {
            const st = CHG_ST[c.status] ?? { label: c.status, color: 'var(--muted2)' }
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: i === 0 ? 'none' : LINE, fontSize: '.72rem' }}>
                <span className="tnum" style={{ fontFamily: 'Inter', color: 'var(--muted2)', flexShrink: 0 }}>{c.period}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{KIND_JP[c.kind] ?? c.kind}</span>
                <span className="tnum" style={{ fontFamily: 'Inter' }}>{yen(Number(c.amount))}</span>
                <span style={{ fontSize: '.56rem', fontWeight: 500, color: st.color, flexShrink: 0 }}>{st.label}</span>
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '8px 2px 0' }}>お支払いは、MBからお送りする請求書に記載の口座へお願いします。適用プラン：{card.id === 'omnis-founding-v1' ? 'ファウンディング（月額）' : '標準（販売手数料5%）'}</p>
      </div>

      {/* 3. 委託先への支払状況（自社案件に紐づく分のみ） */}
      <div style={{ padding: '18px 20px 0' }}>
        <h2 style={H}>委託先への支払状況</h2>
        <div style={CARD}>
          <div style={{ display: 'flex', padding: '14px 16px', gap: 0 }}>
            {([['proposed'], ['accepted', 'assigned'], ['delivered']] as const).map((keys, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', borderLeft: i === 0 ? 'none' : LINE }}>
                <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.05rem', fontWeight: 500 }}>{asgCount([...keys])}</div>
                <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 2 }}>{ASSIGN_STATUS[keys[0]].label}</div>
              </div>
            ))}
          </div>
          {(paidTotal > 0 || unpaidTotal > 0) && (
            <div style={{ borderTop: LINE, display: 'flex', justifyContent: 'space-between', padding: '10px 16px', fontSize: '.72rem' }}>
              <span style={{ color: 'var(--muted2)' }}>委託費の支払い</span>
              <span className="tnum" style={{ fontFamily: 'Inter' }}>支払済 {yen(paidTotal)}{unpaidTotal > 0 ? ` ／ 予定 ${yen(unpaidTotal)}` : ''}</span>
            </div>
          )}
        </div>
        <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '8px 2px 0' }}>委託先へのお支払いはMBの月次サイクルで行われます。</p>
      </div>

      {/* 4. 系統の成果はフロンティアページの管轄（相互リンクのみ・重複させない） */}
      {me.is_frontier && (
        <div style={{ padding: '18px 20px 0' }}>
          <a href="/app/frontier" className="card-hover lift" style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: LINE, borderRadius: 13, padding: '14px 16px', textDecoration: 'none', color: 'var(--txt)' }}>
            <span style={{ color: 'var(--c-blue)', display: 'flex', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 48 48" fill="none">
                <rect x="19" y="19" width="10" height="10" rx="3" fill="currentColor" />
                <rect x="6" y="6" width="8" height="8" rx="2.5" stroke="currentColor" strokeWidth="2.4" />
                <rect x="34" y="6" width="8" height="8" rx="2.5" stroke="currentColor" strokeWidth="2.4" />
                <rect x="6" y="34" width="8" height="8" rx="2.5" stroke="currentColor" strokeWidth="2.4" />
                <rect x="34" y="34" width="8" height="8" rx="2.5" stroke="currentColor" strokeWidth="2.4" />
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>系統の成果</div>
              <div style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 1 }}>フロンティア ダッシュボードで確認</div>
            </div>
            <span style={{ fontSize: '1rem', color: 'var(--muted)' }}>›</span>
          </a>
        </div>
      )}
    </div>
  )
}
