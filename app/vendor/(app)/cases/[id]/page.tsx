import { redirect } from 'next/navigation'
import Link from 'next/link'
import ServiceAvatar from '@/components/ServiceAvatar'
import { loadVendorBundle } from '@/lib/vendor-data'
import { VENDOR_CASE_ST, VENDOR_OFFER_ST } from '@/lib/vendor-status'
import { customerHonorific } from '@/lib/customer'
import VendorOfferActions from './VendorOfferActions'
import VendorCaseExpense from './VendorCaseExpense'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'edge'

// 純化バッチ: ベンダー案件詳細＝契約とお金の公式記録に徹する。
//   提示→承諾→納品済み→経費申請→承認→支払。PM系（タスク/メッセージ/進捗%）は撤去。
// ベンダー純化P1: 納品済みの宣言は発注元（コンソール/サプライヤー）が行う＝本画面は承諾と閲覧と経費のみ。
export default async function VendorCaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')
  const a = b.assignments.find(x => x.id === id)
  if (!a) redirect('/vendor/cases')   // 自分の割当以外は不可（隔離）
  const admin = await createServiceRoleClient()
  const snapshotMenuId = a.deal?.reward_snapshot?.menu_id ?? null
  const legacyServiceMenuId = snapshotMenuId ? null : a.deal?.menu_id ?? null
  const [menuRes, eventsRes] = await Promise.all([
    snapshotMenuId
      ? admin.from('menus').select('name').eq('id', snapshotMenuId).maybeSingle()
      : legacyServiceMenuId
        ? admin.from('menus').select('name').eq('service_menu_id', legacyServiceMenuId).eq('active', true).order('sort').limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    a.deal?.id
      ? admin.from('deal_events').select('body, created_at').eq('deal_id', a.deal.id).order('created_at')
      : Promise.resolve({ data: [] as { body: string; created_at: string }[] }),
  ])
  const events = (eventsRes.data ?? []) as { body: string; created_at: string }[]
  const eventAt = (pattern: RegExp) => events.find(event => pattern.test(event.body))?.created_at ?? null
  const offeredAt = eventAt(/委託を提示/) ?? a.assigned_at
  const acceptedAt = eventAt(/委託を承諾/)
  const deliveredAt = eventAt(/納品済みにしました/)
  const svc = a.deal?.services
  const expenses = b.expenses.filter(e => e.assignment_id === id)
  const cust = (a.deal && customerHonorific(a.deal)) || ''
  const delivered = a.status === 'delivered'
  const accepted = a.status === 'accepted' || a.status === 'assigned'
  // 状態＝割当のライフサイクル（提示中/了承済/納品済み/辞退）優先。それ以外は案件状態語。
  const offerSt = VENDOR_OFFER_ST[a.status] ?? VENDOR_CASE_ST[a.deal?.status ?? ''] ?? { label: '実行中', c: 'var(--c-blue)', bg: 'var(--blue-bg)' }

  return (
    <div className="page-anim">
      <div style={{ padding: '12px 20px 0' }}>
        <Link href="/vendor/cases" style={{ fontSize: '.7rem', color: 'var(--muted2)', textDecoration: 'none' }}>← 担当案件</Link>
      </div>
      <div style={{ padding: '10px 20px 14px', display: 'flex', gap: 13, alignItems: 'center' }}>
        {svc ? <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={46} /> : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="案件" size={46} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: '1.12rem', fontWeight: 500, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cust || '案件'}</h1>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: offerSt.c, display: 'inline-block' }} />
              <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>{offerSt.label}</span>
            </span>
          </div>
          <div style={{ fontSize: '.64rem', color: 'var(--muted)', marginTop: 2 }}>{cust || 'お客さま'} ・ {svc?.name ?? 'サービス'}{menuRes.data?.name ? ` ・ ${menuRes.data.name}` : ''}</div>
        </div>
      </div>

      {/* 委託提示への応答（提示中）／辞退の注記 */}
      {a.status === 'proposed' && <VendorOfferActions assignmentId={a.id} baseFee={a.base_fee} />}
      {a.status === 'declined' && (
        <p style={{ margin: '10px 20px 0', fontSize: '.68rem', color: 'var(--muted2)' }}>この委託提示は辞退しました。</p>
      )}

      {/* 委託費（契約の金額） */}
      {a.status !== 'proposed' && a.status !== 'declined' && (
        <div style={{ padding: '4px 20px 0' }}>
          <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '15px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '.72rem', color: 'var(--muted2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              委託費
              <span style={{ fontSize: '.5rem', fontWeight: 500, color: delivered ? 'var(--green)' : 'var(--amber)', border: '0.5px solid var(--line)', borderRadius: 20, padding: '2px 9px' }}>{delivered ? '納品済み' : '納品後に確定'}</span>
            </span>
            <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.15rem', fontWeight: 500 }}>¥{a.base_fee.toLocaleString()}</span>
          </div>
        </div>
      )}

      <div style={{ padding: '12px 20px 4px' }}>
        <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '11px 16px' }}>
          {([
            ['提示', offeredAt, !!offeredAt],
            ['受諾', acceptedAt, ['accepted', 'assigned', 'delivered'].includes(a.status)],
            ['納品', deliveredAt, a.status === 'delivered'],
          ] as const).map(([label, at, done], index) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 38, borderTop: index ? '0.5px solid var(--line)' : 'none' }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: done ? 'var(--green)' : 'var(--line)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '.72rem', color: done ? 'var(--txt)' : 'var(--muted)' }}>{label}</span>
              <span style={{ fontSize: '.58rem', color: 'var(--muted)' }}>{at ? new Date(at).toLocaleString('ja', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : done ? '日時記録なし' : '未完了'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 経費（納品済みで申請可・納品の確認は発注元が行う） */}
      {(accepted || delivered) && (
        <VendorCaseExpense assignmentId={id} label={cust || '案件'} initial={expenses} delivered={delivered} />
      )}

      {/* 支払・報酬明細への導線 */}
      {a.status !== 'proposed' && a.status !== 'declined' && (
        <div style={{ padding: '0 20px 30px' }}>
          <Link href="/vendor/rewards" className="ui-btn ui-btn--secondary ui-btn--lg" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>委託費の明細を見る</Link>
        </div>
      )}
    </div>
  )
}
