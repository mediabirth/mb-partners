import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerByUserId, getDealWithEvents } from '@/lib/supabase/queries'
import ServiceAvatar from '@/components/ServiceAvatar'
import DealNextActions from '@/components/DealNextActions'
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

const CUSTOMER_PENDING = '（お客さま入力待ち）'

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ next?: string }>
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

  // ── v2 案件ページ＝実行の場：次にやること／ヒヤリング用の派生データ ──
  const { next } = await searchParams
  const method: 'send' | 'self' = next === 'self' ? 'self' : 'send'
  // 担い＝報酬の担い（channel＝reward_type由来）。cooperation(rate/continuous)=アポイント→予約(/book/)、
  //   referral(fixed)=登録リンク(/r/)。refer側の coopMode 判定と構成上一致する。
  const hasAppointment = deal.channel === 'cooperation'
  // ヒヤリングタスク（あれば入力枠を出す／保存で自動チェック）。
  const hearingTask = tasks.find(t => (t.kind ?? '').includes('ヒヤリング') || (t.label ?? '').includes('ヒヤリング'))
  // 現行リンク（生成ロジック不変）：登録=/r/token（partner×service）／予約=/book/partnerCode。
  let registerToken: string | null = null
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const admin = await createServiceRoleClient()
    if (deal.service_id) {
      const { data: link } = await admin.from('referral_links').select('token').eq('partner_id', partner.id).eq('service_id', deal.service_id).maybeSingle()
      registerToken = (link as { token?: string } | null)?.token ?? null
    }
  } catch { /* best-effort */ }
  const registerUrl = registerToken ? `/r/${registerToken}` : null
  const bookingUrl = partner.code ? `/book/${partner.code}` : null
  // ヘッダ表示：リンク送付で名前空欄なら「お客さま入力待ち」。
  const custDisplay = deal.customer_name === CUSTOMER_PENDING ? 'お客さま入力待ち' : (customerHonorific(deal) || 'お客さま')
  const rewardPillText = deal.amount > 0 ? `報酬 ¥${deal.amount.toLocaleString()}` : '報酬 成約時に確定'

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
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-.01em' }}>{custDisplay} の案件</h1>
            <span style={{ fontSize: '.56rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--bg2)', color: 'var(--muted2)' }}>{STATUS_LABEL[deal.status] ?? deal.status}</span>
          </div>
          <div style={{ fontSize: '.64rem', color: 'var(--muted)', marginTop: 3 }}>
            {svc?.name ?? '相談（サービス未定）'}{menu?.name ? ` ─ ${menu.name}` : ''}
          </div>
          <span style={{ display: 'inline-block', fontFamily: 'Inter', fontSize: '.64rem', fontWeight: 800, color: '#fff', background: 'var(--c-blue)', borderRadius: 999, padding: '3px 11px', marginTop: 7 }}>{rewardPillText}</span>
        </div>
      </div>

      {/* v2 次にやること／ヒヤリング（実行の場・最上部）。不成立時は出さない。 */}
      {deal.status !== 'lost' && (
        <DealNextActions
          dealId={deal.id}
          method={method}
          hasAppointment={hasAppointment}
          registerUrl={registerUrl}
          bookingUrl={bookingUrl}
          customerEmail={(deal as { customer_email?: string | null }).customer_email ?? null}
          serviceName={svc?.name ?? null}
          defaultContact={deal.customer_name === CUSTOMER_PENDING ? '' : (customerHonorific(deal) || '')}
          defaultNeed={''}
          hearingEnabled={!!hearingTask}
          hearingInitial={hearingTask?.note ?? ''}
          hearingDone={!!hearingTask?.done}
        />
      )}

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
          ['種別', deal.channel === 'direct' ? '直販' : '紹介'],
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
