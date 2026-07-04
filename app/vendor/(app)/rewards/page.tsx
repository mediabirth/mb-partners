import { redirect } from 'next/navigation'
import StatusPill from '@/components/ui/StatusPill'
import RewardHero from '@/components/ui/RewardHero'
import ServiceAvatar from '@/components/ServiceAvatar'
import { paymentState } from '@/lib/status'
import { loadVendorBundle } from '@/lib/vendor-data'
import { customerHonorific } from '@/lib/customer'

export const runtime = 'edge'
function monthLabel(p: string) { const [y, m] = p.split('-'); return `${y}年${Number(m)}月` }

export default async function VendorRewards() {
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')
  const unpaid = b.payouts.filter(p => p.status === 'unpaid').reduce((s, p) => s + p.amount, 0)
  const paid = b.payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)
  const total = unpaid + paid

  return (
    <div className="page-anim">
      {/* 委託費ヒーロー（app と同一の見え方・共有RewardHero）。ベンダーの金銭は全面「委託費」言語。 */}
      <RewardHero
        label="委託費 合計"
        amount={total}
        items={[
          { key: 'unpaid', label: '未払い', value: unpaid, format: 'yen' },
          { key: 'paid', label: '支払済', value: paid, format: 'yen' },
          { key: 'count', label: '明細', value: b.payouts.length, suffix: '件' },
        ]}
      />

      {/* 委託費は「完了したプロジェクトの結果」という位置づけを明示（見た目は app と共通）。 */}
      <p style={{ fontSize: '.62rem', color: 'var(--muted2)', lineHeight: 1.7, margin: '12px 20px 0' }}>完了したプロジェクトの委託費・承認済経費が、確定後にここへ反映されます。</p>

      <div style={{ padding: '18px 20px 6px' }}><h2 className="ty-h2">委託費の明細</h2></div>
      <div style={{ padding: '0 20px 8px' }}>
        {b.payouts.length === 0 ? (
          <div style={{ background: '#fff', border: '0.5px dashed var(--line)', borderRadius: 14, padding: '22px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '.74rem', fontWeight: 500 }}>まだ明細はありません</div>
            <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 3, lineHeight: 1.6 }}>案件を納品し MB が確定すると、ここに委託費が積み上がります。</div>
          </div>
        ) : b.payouts.map(p => {
          const isPaid = p.status === 'paid'
          const hasExpense = (p.expense_total ?? 0) > 0
          const svc = p.service
          return (
            <div key={p.id} className="card-hover ui-card" style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '14px 15px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                {svc ? <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={38} /> : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="案件" size={38} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerHonorific(p) || monthLabel(p.period)}</div>
                  <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 1 }}>{monthLabel(p.period)}{p.paid_at ? ` ・ 支払 ${new Date(p.paid_at).toLocaleDateString('ja', { timeZone: 'Asia/Tokyo' })}` : ''}</div>
                </div>
                <StatusPill size="sm" {...paymentState(p.status)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 11, paddingTop: 11, borderTop: '0.5px solid var(--line)' }}>
                {/* 内訳は経費がある月のみ展開（無ければ委託費＝総額で重複を出さない） */}
                <div style={{ fontSize: '.6rem', color: 'var(--muted2)', lineHeight: 1.7 }}>
                  {hasExpense ? (<>委託費 <b className="tnum" style={{ color: 'var(--txt)' }}>¥{p.base_fee.toLocaleString()}</b><br />承認済経費 <b className="tnum" style={{ color: 'var(--txt)' }}>¥{p.expense_total.toLocaleString()}</b></>) : '委託費'}
                </div>
                <div className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.28rem', fontWeight: 500, color: isPaid ? 'var(--muted2)' : 'var(--txt)' }}>¥{p.amount.toLocaleString()}</div>
              </div>
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: '.6rem', color: 'var(--muted)', padding: '0 20px 20px', lineHeight: 1.7 }}>※ 支払予定は MB が支払を確定した時点の金額です。承認済の経費が反映されます。</p>
    </div>
  )
}
