import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerByUserId, getDealWithEvents } from '@/lib/supabase/queries'
import ServiceIcon from '@/components/ServiceIcon'

const STATUS_LABEL: Record<string, string> = {
  received: '受付', in_progress: '対応中', confirmed: '成約・確定', paid: '支払済',
}
const STATUS_STEP: Record<string, number> = {
  received: 0, in_progress: 1, confirmed: 2, paid: 3,
}
const RAIL_STEPS = ['受付', '対応中', '成約・確定', '支払済']

export const runtime = 'edge'

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const partner = await getPartnerByUserId(supabase, user.id)
  if (!partner) redirect('/login')

  const { id } = await params
  const { deal, events } = await getDealWithEvents(supabase, id, partner.id)
  if (!deal) notFound()

  const step = STATUS_STEP[deal.status] ?? 0
  const svc = (deal as any).services
  const menu = (deal as any).service_menus

  return (
    <div>
      <Link href="/app/cases" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.7rem', color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 500, textDecoration: 'none' }}>
        ← 案件一覧
      </Link>

      {/* Header */}
      <div style={{ padding: '8px 20px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 13, alignItems: 'center' }}>
        {svc && <ServiceIcon icon={svc.icon} color={svc.color} size={46} />}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: '1.18rem', fontWeight: 900, letterSpacing: '-.01em' }}>{deal.customer_name}</h1>
            <span className={`chip ${deal.channel === 'cooperation' ? 'chip-cooperation' : deal.channel === 'referral' ? 'chip-referral' : 'chip-direct'}`}>
              {deal.channel === 'referral' ? '紹介' : deal.channel === 'cooperation' ? '協力' : '営業'}
            </span>
          </div>
          <div style={{ fontSize: '.64rem', color: 'var(--muted)', marginTop: 2 }}>
            {svc?.name} · {new Date(deal.created_at).toLocaleDateString('ja')}
          </div>
        </div>
      </div>

      {/* Status rail */}
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', margin: '0 1px 5px' }}>
          {RAIL_STEPS.map((s, i) => (
            <span key={i} style={{ display: 'contents' }}>
              <span
                className={i === step ? 'stnPulse' : undefined}
                style={{
                  width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                  background: i <= step ? 'var(--blue)' : 'var(--bg)',
                  border: i <= step ? '2px solid var(--blue)' : '2px solid #DBDBE3',
                  boxShadow: i === step ? '0 0 0 4px var(--blue-bg)' : 'none',
                  display: 'inline-block',
                }}
              />
              {i < 3 && <span style={{ height: 2, flex: 1, background: i < step ? 'var(--blue)' : '#E7E7ED' }}/>}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.54rem', color: 'var(--muted)' }}>
          {RAIL_STEPS.map((s, i) => (
            <span key={i} style={{ color: i === step ? 'var(--blue)' : undefined, fontWeight: i === step ? 700 : undefined }}>{s}</span>
          ))}
        </div>
        {/* Reward trigger label at confirmed step */}
        {menu?.ref_trigger && (
          <div style={{ marginTop: 8, fontSize: '.62rem', color: 'var(--blue)', fontWeight: 600 }}>
            報酬発生条件: {menu.ref_trigger}
          </div>
        )}
      </div>

      {/* Deal info */}
      <div style={{ padding: '0 20px' }}>
        {[
          ['ステータス', STATUS_LABEL[deal.status]],
          ['報酬予定額', deal.amount > 0 ? `¥${deal.amount.toLocaleString()}` : '確認中'],
          ['サービス', svc?.name ?? deal.service_id],
          ['メニュー', menu?.name ?? '—'],
          ['チャネル', deal.channel === 'referral' ? '紹介' : '営業'],
          ['登録日', new Date(deal.created_at).toLocaleDateString('ja')],
          ...(deal.meeting_at ? [['商談予定', new Date(deal.meeting_at).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })]] : []),
          ...(deal.fixed_month ? [['計上月', deal.fixed_month.substring(0, 7)]] : []),
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--line)', fontSize: '.75rem', gap: 12 }}>
            <span style={{ color: 'var(--muted2)', flexShrink: 0 }}>{k}</span>
            <span style={{ fontWeight: 700, textAlign: 'right' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div style={{ padding: '6px 20px 20px' }}>
        <h2 style={{ fontSize: '.78rem', fontWeight: 700, margin: '16px 0 12px', color: 'var(--muted2)' }}>これまでの流れ</h2>
        {events.length === 0 ? (
          <p style={{ fontSize: '.7rem', color: 'var(--muted2)' }}>記録はまだありません。</p>
        ) : events.map((e, i) => (
          <div key={e.id} style={{ display: 'flex', gap: 14, position: 'relative', paddingBottom: 17 }}>
            {i < events.length - 1 && (
              <div style={{ position: 'absolute', left: 5, top: 16, bottom: 0, width: 2, background: 'var(--line)' }}/>
            )}
            <div style={{
              width: 12, height: 12, borderRadius: '50%', flexShrink: 0, marginTop: 3,
              background: i === 0 ? 'var(--blue)' : '#D7D7E0',
              border: i === 0 ? '2.5px solid var(--blue-bg)' : '2.5px solid var(--bg2)',
            }}/>
            <div style={{ fontSize: '.74rem', lineHeight: 1.55, color: i === 0 ? 'var(--txt)' : 'var(--muted2)', fontWeight: i === 0 ? 700 : 400 }}>
              {e.body}
              <small style={{ display: 'block', fontSize: '.59rem', color: 'var(--muted)', marginTop: 2, fontWeight: 400 }}>
                {new Date(e.created_at).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </small>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
