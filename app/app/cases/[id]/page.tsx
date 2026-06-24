import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerByUserId, getDealWithEvents } from '@/lib/supabase/queries'
import ServiceAvatar from '@/components/ServiceAvatar'
import ChannelMark from '@/components/ChannelMark'
import TaskChecklist, { type DealTask } from '@/components/TaskChecklist'
import { customerHonorific } from '@/lib/customer'

const STATUS_LABEL: Record<string, string> = {
  received: '受付', in_progress: '対応中', confirmed: '成約・確定', paid: '支払済', lost: '不成立',
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

  // P: 協力dealの対応タスク（best-effort・テーブル未作成なら空）。
  let tasks: DealTask[] = []
  if (deal.channel === 'cooperation') {
    try {
      const { createServiceRoleClient } = await import('@/lib/supabase/server')
      const admin = await createServiceRoleClient()
      const { data } = await admin.from('deal_tasks').select('id, label, kind, required, done, note, sort').eq('deal_id', id).order('sort')
      tasks = (data ?? []) as DealTask[]
    } catch { /* best-effort */ }
  }

  // L2: 案件の明細内訳（best-effort・テーブル未作成なら空）。所有確認は getDealWithEvents で済。
  let items: { id: string; kind: string; amount: number; base_amount: number | null; services?: { name: string } | null }[] = []
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const admin = await createServiceRoleClient()
    const { data } = await admin.from('deal_items').select('id, kind, amount, base_amount, sort, services(name)').eq('deal_id', id).order('sort')
    items = (data ?? []) as typeof items
  } catch { /* best-effort */ }

  return (
    <div>
      <Link href="/app/cases" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.7rem', color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 500, textDecoration: 'none' }}>
        ← 案件一覧
      </Link>

      {/* Header（L3: サービス未定は相談アバター） */}
      <div style={{ padding: '8px 20px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 13, alignItems: 'center' }}>
        {svc
          ? <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={46} />
          : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="相談" size={46} />}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: '1.18rem', fontWeight: 800, letterSpacing: '-.01em' }}>{customerHonorific(deal)}</h1>
            <ChannelMark channel={deal.channel} />
          </div>
          <div style={{ fontSize: '.64rem', color: 'var(--muted)', marginTop: 2 }}>
            {svc?.name ?? '相談（サービス未定）'} · {new Date(deal.created_at).toLocaleDateString('ja')}
          </div>
        </div>
      </div>

      {/* Status rail（不成立は見送りバナー） */}
      {deal.status === 'lost' ? (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: '.78rem', fontWeight: 800 }}>不成立（見送り）</p>
            <p style={{ fontSize: '.68rem', color: 'var(--muted2)', marginTop: 6, lineHeight: 1.7 }}>
              この案件は今回見送りとなりました。ご紹介ありがとうございました。本プログラムは成功報酬制のため、報酬は成約時のみ発生します。
            </p>
          </div>
        </div>
      ) : (
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', margin: '0 1px 5px' }}>
          {RAIL_STEPS.map((s, i) => (
            <span key={i} style={{ display: 'contents' }}>
              <span
                className={i === step ? 'stnPulse' : undefined}
                style={{
                  width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                  background: i <= step ? 'var(--c-blue)' : 'var(--bg)',
                  border: i <= step ? '2px solid var(--c-blue)' : '2px solid #DBDBE3',
                  boxShadow: i === step ? '0 0 0 4px var(--blue-bg)' : 'none',
                  display: 'inline-block',
                }}
              />
              {i < 3 && <span style={{ height: 2, flex: 1, background: i < step ? 'var(--c-blue)' : '#E7E7ED' }}/>}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.54rem', color: 'var(--muted)' }}>
          {RAIL_STEPS.map((s, i) => (
            <span key={i} style={{ color: i === step ? 'var(--c-blue)' : undefined, fontWeight: i === step ? 700 : undefined }}>{s}</span>
          ))}
        </div>
        {/* Reward trigger label at confirmed step */}
        {menu?.ref_trigger && (
          <div style={{ marginTop: 8, fontSize: '.62rem', color: 'var(--c-blue)', fontWeight: 600 }}>
            報酬発生条件: {menu.ref_trigger}
          </div>
        )}
      </div>
      )}

      {/* Deal info */}
      <div style={{ padding: '0 20px' }}>
        {[
          ['ステータス', STATUS_LABEL[deal.status]],
          ['報酬予定額', deal.amount > 0 ? `¥${deal.amount.toLocaleString()}` : '確認中'],
          ['サービス', svc?.name ?? '相談（サービス未定）'],
          ['メニュー', menu?.name ?? '—'],
          ['チャネル', deal.channel === 'referral' ? '紹介' : deal.channel === 'cooperation' ? '協力' : '直販'],
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

      {/* L2: 案件の明細内訳（サービス×金額）＋合計。明細1件でも自然に表示。 */}
      {items.length > 0 && (
        <div style={{ padding: '8px 20px 0' }}>
          <h2 style={{ fontSize: '.78rem', fontWeight: 700, margin: '14px 0 8px', color: 'var(--muted2)' }}>内訳</h2>
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
            {items.map((it, i) => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 14px', borderBottom: '1px solid #F2F2F6' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '.76rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.services?.name ?? 'サービス'}</div>
                  {it.kind === 'rate' && it.base_amount != null && (
                    <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 1 }}>実績 ¥{it.base_amount.toLocaleString()}</div>
                  )}
                </div>
                <span className="tnum" style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.78rem', fontWeight: 700, color: it.amount > 0 ? 'var(--txt)' : 'var(--muted)' }}>
                  {it.amount > 0 ? `¥${it.amount.toLocaleString()}` : '確認中'}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--bg2)' }}>
              <span style={{ fontSize: '.72rem', fontWeight: 800 }}>案件合計</span>
              <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.86rem', fontWeight: 800, color: 'var(--c-blue)' }}>¥{deal.amount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* P: 協力dealの対応タスク（ゲーム風チェックリスト）。紹介dealでは非表示。 */}
      {deal.channel === 'cooperation' && tasks.length > 0 && (
        <div style={{ paddingTop: 16 }}>
          <TaskChecklist tasks={tasks} />
        </div>
      )}

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
              background: i === 0 ? 'var(--c-blue)' : '#D7D7E0',
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
