import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerByUserId, getDealWithEvents } from '@/lib/supabase/queries'
import ServiceAvatar from '@/components/ServiceAvatar'
import RewardPill from '@/components/ui/RewardPill'
import { rewardValueText } from '@/lib/reward-format'
import DealNextActions from '@/components/DealNextActions'
import TaskChecklist, { type DealTask } from '@/components/TaskChecklist'
import MenuInfoButton from '@/components/MenuInfoButton'
import { customerHonorific } from '@/lib/customer'
import { statusNarrative } from '@/lib/deal-status-narrative'
import { DEAL_STATUS } from '@/lib/status'

// 操縦席: ステータス語は正典（lib/status.ts DEAL_STATUS）から導出（ローカル再定義の廃止）
const STATUS_LABEL: Record<string, string> = Object.fromEntries(Object.entries(DEAL_STATUS).map(([k, v]) => [k, v.label]))
const STATUS_STEP: Record<string, number> = { received: 0, in_progress: 1, confirmed: 2, paid: 3 }
const RAIL_STEPS = ['受付', '対応中', '成約', '支払済']

export const runtime = 'edge'

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

  // 対応タスク（cooperation deal のみ）＋タスク説明（ⓘ用）＋明細（best-effort）。
  let tasks: DealTask[] = []
  let taskDesc: Record<string, string> = {}
  let items: { id: string; kind: string; amount: number; base_amount: number | null; services?: { name: string } | null }[] = []
  // お客さま向け新名称（reward_snapshot に記録された新menu id → menus.name）。改名せず表示のみ。
  let newMenuName: string | null = null
  // メニューⓘ（共有 MenuDetailSheet）用：メニュー説明＋サービスの説明/イメージ画像。取れなければⓘ非表示（安全側）。
  let menuInfoDescription: string | null = null
  let svcExtra: { description: string | null; image_url: string | null } | null = null
  const snapMenuId = ((deal as { reward_snapshot?: { menu_id?: string } | null }).reward_snapshot)?.menu_id ?? null
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const admin = await createServiceRoleClient()
    // 磨き④: 相互独立な5本の直列awaitを1段のPromise.allへ（読み取りのみ・結果不変）。
    const [tasksRes, tplsRes, itRes, mmRes, sxRes] = await Promise.all([
      deal.channel === 'cooperation'
        ? admin.from('deal_tasks').select('id, label, kind, required, done, note, sort').eq('deal_id', id).order('sort')
        : Promise.resolve({ data: null }),
      deal.service_id
        ? admin.from('cooperation_task_templates').select('label, description').eq('service_id', deal.service_id).eq('active', true)
        : Promise.resolve({ data: null }),
      admin.from('deal_items').select('id, kind, amount, base_amount, sort, services(name)').eq('deal_id', id).order('sort'),
      snapMenuId
        ? admin.from('menus').select('name, description').eq('id', snapMenuId).maybeSingle()
        : Promise.resolve({ data: null }),
      deal.service_id
        ? admin.from('services').select('description, image_url').eq('id', deal.service_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    tasks = (tasksRes.data ?? []) as DealTask[]
    for (const t of (tplsRes.data ?? []) as { label: string; description: string | null }[]) if (t.description) taskDesc[t.label] = t.description
    items = (itRes.data ?? []) as typeof items
    newMenuName = (mmRes.data as { name?: string } | null)?.name ?? null
    menuInfoDescription = (mmRes.data as { description?: string | null } | null)?.description ?? null
    // ⓘの表示条件は従来同様「新メニュー名が解決できたとき」のみ（svcExtra 自体は並列取得済み）
    svcExtra = newMenuName ? ((sxRes.data as { description: string | null; image_url: string | null } | null) ?? null) : null
  } catch { /* best-effort */ }
  const menuLabel: string | null = newMenuName || ((deal as any).service_menus?.name ?? null)

  const { next } = await searchParams
  const method: 'send' | 'self' = next === 'self' ? 'self' : 'send'
  // 担い＝reward_type由来の channel。cooperation=アポイント→予約(/book/)、referral=連絡のみ（リンク導線なし）。
  const hasAppointment = deal.channel === 'cooperation'
  const hearingTask = tasks.find(t => (t.kind ?? '').includes('ヒヤリング') || (t.label ?? '').includes('ヒヤリング'))
  // ① 正式なフルURL（相対だとコピー/送付先が壊れるため）。
  const bookingUrl = partner.code ? `https://mb-partners.app/book/${partner.code}` : null
  const custDisplay = customerHonorific(deal) || 'お客さま'
  // 報酬ピル文言：reward_snapshot（凍結報酬）から値/率のみ。無ければ確定金額 or「成約時に確定」。★money表示値は既存を読むだけ。
  const snapReward = (deal as { reward_snapshot?: { reward_type?: string; reward_value?: number | string; reward_trigger?: string | null; default_months?: number | null } | null }).reward_snapshot
  const rewardText = snapReward?.reward_type
    ? rewardValueText({ reward_type: snapReward.reward_type as 'fixed' | 'rate' | 'continuous', reward_value: snapReward.reward_value ?? 0 })
    : (deal.amount > 0 ? `¥${deal.amount.toLocaleString()}` : '成約時に確定')

  // メニューⓘ（共有シート）：reward_snapshot.menu_id 経由でメニューが解決できた場合のみ表示（安全側）。
  const showMenuInfo = !!(svc && newMenuName && menuLabel)
  const sheetReward = snapReward?.reward_type
    ? { reward_type: snapReward.reward_type as 'fixed' | 'rate' | 'continuous', reward_value: snapReward.reward_value ?? 0, reward_trigger: snapReward.reward_trigger ?? null, default_months: snapReward.default_months ?? null }
    : null
  const sheetTasks = tasks.map(t => ({ label: t.label, description: taskDesc[t.label] ?? null }))

  return (
    <div>
      <Link href="/app/cases" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 400, textDecoration: 'none' }}>
        ← 案件一覧
      </Link>

      {/* 1. ヘッダ */}
      <div style={{ padding: '10px 20px 20px', display: 'flex', gap: 13, alignItems: 'center' }}>
        {svc
          ? <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={44} />
          : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="相談" size={44} />}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-.01em' }}>{custDisplay} の案件</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--muted2)' }}>{svc?.name ?? '相談（サービス未定）'}{menuLabel ? ` ─ ${menuLabel}` : ''}</span>
            {/* メニューⓘ：タップで共有 MenuDetailSheet（データが解決できた案件のみ） */}
            {showMenuInfo && (
              <MenuInfoButton
                svc={{ name: svc.name, logo_path: svc.logo_path ?? null, icon: svc.icon ?? '', color: svc.color ?? '', image_url: svcExtra?.image_url ?? null, description: svcExtra?.description ?? null }}
                menuName={menuLabel!}
                menuDescription={menuInfoDescription}
                reward={sheetReward}
                tasks={sheetTasks}
              />
            )}
            {/* ステータス＝6pxドット＋テキスト（塗りピル廃止） */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: deal.status === 'lost' ? 'var(--muted)' : 'var(--c-blue)', display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: 'var(--muted2)' }}>{STATUS_LABEL[deal.status] ?? deal.status}</span>
            </span>
          </div>
          {/* 報酬＝accentピル（報酬は唯一ピルで語ってよい情報・共通コンポーネント） */}
          <div style={{ marginTop: 8 }}>
            <RewardPill>{rewardText}</RewardPill>
          </div>
        </div>
      </div>

      {deal.status === 'lost' ? (
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: 14, fontWeight: 500 }}>不成立（見送り）</p>
            <p style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 6, lineHeight: 1.7 }}>
              この案件は今回見送りとなりました。ご紹介ありがとうございました。本プログラムは成功報酬制のため、報酬は成約時のみ発生します。
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* 2. 次にやること（アポ型のみ・1.5px accent） */}
          <DealNextActions
            dealId={deal.id}
            method={method}
            hasAppointment={hasAppointment}
            bookingUrl={bookingUrl}
            customerEmail={(deal as { customer_email?: string | null }).customer_email ?? null}
            serviceName={svc?.name ?? null}
            defaultContact={customerHonorific(deal) || ''}
            defaultNeed={''}
          />

          {/* 3a. 協力タスクあり（⑥）：タスクチェック（状態表示・チェックイン・モーション） */}
          {deal.channel === 'cooperation' && tasks.length > 0 && (
            <TaskChecklist tasks={tasks} descriptions={taskDesc}
              hearing={hearingTask ? { dealId: deal.id, initial: hearingTask.note ?? '', done: !!hearingTask.done } : null} />
          )}

          {/* 3b. 協力タスク0件＝つなぐだけ（⑦）：いまの状況ナラティブカード */}
          {!(deal.channel === 'cooperation' && tasks.length > 0) && statusNarrative(deal.status) && (
            <div style={{ padding: '24px 20px 0' }}>
              <div style={{ border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px 16px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)', letterSpacing: '.06em', marginBottom: 8 }}>いまの状況</div>
                <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.55 }}>{statusNarrative(deal.status)!.title}</div>
                {statusNarrative(deal.status)!.sub && (
                  <div style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 5, lineHeight: 1.6 }}>{statusNarrative(deal.status)!.sub}</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 13, borderTop: '0.5px solid var(--line)' }}>
                  <span style={{ color: 'var(--muted)', display: 'flex', flexShrink: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted2)' }}>あなたのタスクはありません。あとはMBにお任せください</span>
                </div>
              </div>
            </div>
          )}

          {/* 4. 進捗ミニステップ（決定②: 報酬到達文言は全種削除・報酬はヘッダのピルに一本化） */}
          <div style={{ padding: '24px 20px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', margin: '0 1px 6px' }}>
              {RAIL_STEPS.map((s, i) => (
                <span key={i} style={{ display: 'contents' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: i <= step ? 'var(--c-blue)' : 'var(--bg)', border: i <= step ? '1.5px solid var(--c-blue)' : '1.5px solid #DBDBE3', display: 'inline-block' }} />
                  {i < 3 && <span style={{ height: 1, flex: 1, background: i < step ? 'var(--c-blue)' : '#E7E7ED' }} />}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
              {RAIL_STEPS.map((s, i) => (
                <span key={i} style={{ color: i === step ? 'var(--c-blue)' : undefined, fontWeight: i === step ? 500 : 400 }}>{s}</span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 5. 詳細（報酬内訳・履歴）：折りたたみ（既定閉） */}
      <details style={{ padding: '12px 20px 24px' }}>
        <summary style={{ cursor: 'pointer', listStyle: 'none', fontSize: 12, fontWeight: 500, color: 'var(--muted2)', padding: '8px 0' }}>詳細を見る（報酬内訳・履歴）</summary>

        <div style={{ marginTop: 8 }}>
          {[
            ['ステータス', STATUS_LABEL[deal.status]],
            ['報酬予定額（税抜）', deal.amount > 0 ? `¥${deal.amount.toLocaleString()}` : '確認中'],
            ['メニュー', menuLabel ? `${svc?.name ?? ''} ─ ${menuLabel}` : (svc?.name ?? '相談（サービス未定）')],
            ['登録日', new Date(deal.created_at).toLocaleDateString('ja', { timeZone: 'Asia/Tokyo' })],
            ...(deal.meeting_at ? [['商談予定', new Date(deal.meeting_at).toLocaleString('ja', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })]] : []),
            ...(deal.fixed_month ? [['計上月', deal.fixed_month.substring(0, 7)]] : []),
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid var(--line)', fontSize: 13, gap: 12 }}>
              <span style={{ color: 'var(--muted2)', flexShrink: 0 }}>{k}</span>
              <span style={{ fontWeight: 400, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>

        {items.length > 1 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted2)', marginBottom: 8 }}>内訳</div>
            <div style={{ border: '0.5px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
              {items.map(it => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 14px', borderBottom: '0.5px solid var(--line)' }}>
                  <span style={{ fontSize: 13, fontWeight: 400, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.services?.name ?? 'サービス'}</span>
                  <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 500, color: it.amount > 0 ? 'var(--txt)' : 'var(--muted)' }}>{it.amount > 0 ? `¥${it.amount.toLocaleString()}` : '確認中'}</span>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--bg2)' }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>案件合計</span>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--txt)' }}>¥{deal.amount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* ⑦ 履歴は記録が出るまで非表示（空状態の説明文を出さない） */}
        {events.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted2)', marginBottom: 12 }}>これまでの流れ</div>
          {events.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', gap: 14, position: 'relative', paddingBottom: 17 }}>
              {i < events.length - 1 && <div style={{ position: 'absolute', left: 5, top: 16, bottom: 0, width: 1, background: 'var(--line)' }} />}
              <div style={{ width: 11, height: 11, borderRadius: '50%', flexShrink: 0, marginTop: 3, background: i === 0 ? 'var(--c-blue)' : '#D7D7E0' }} />
              <div style={{ fontSize: 13, lineHeight: 1.55, color: i === 0 ? 'var(--txt)' : 'var(--muted2)', fontWeight: 400 }}>
                {e.body}
                <small style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 2, fontWeight: 400 }}>
                  {new Date(e.created_at).toLocaleString('ja', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </small>
              </div>
            </div>
          ))}
        </div>
        )}
      </details>
    </div>
  )
}
