import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUid } from '@/lib/supabase/server'
import { getPartnerWithDeals, getRecentEventsByUserId } from '@/lib/supabase/queries'
import ServiceAvatar from '@/components/ServiceAvatar'
import CountUp from '@/components/CountUp'
import StatusPill from '@/components/ui/StatusPill'
import { dealStatus } from '@/lib/status'
import { nextPayoutDate } from '@/lib/payout'
import { customerHonorific } from '@/lib/customer'
import SynapseCrest from './synapse/SynapseCrest'
import PushOptIn from '@/components/PushOptIn'

export const runtime = 'edge'

export default async function AppPage() {
  const uid = await getCachedUid()
  if (!uid) redirect('/login')
  const supabase = await createClient()

  // Single parallel round: partner+deals combined query + events by userId
  // (avoids needing partner.id before fetching events)
  const [partnerResult, recentEvents] = await Promise.all([
    getPartnerWithDeals(supabase, uid),
    getRecentEventsByUserId(supabase, uid),
  ])
  // If no partner record, go to root — root page routes admins to /console.
  // Redirecting to /login here would loop: login→/app→/login for admins.
  if (!partnerResult) redirect('/')
  const { partner, deals } = partnerResult
  // ★HOME clean：SYNAPSE の件数/示唆/先回りは一覧側へ集約（HOMEは控えめな導線pillのみ）。

  // Stats
  const active = deals.filter(d => ['received', 'in_progress'].includes(d.status))
  const pipeline = active.reduce((s, d) => s + (d.amount || 0), 0)
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthConfirmed = deals.filter(d => d.status === 'confirmed' && d.fixed_month?.startsWith(ym))
  const monthAmount = monthConfirmed.reduce((s, d) => s + (d.amount || 0), 0)
  const confirmedBalance = deals.filter(d => d.status === 'confirmed').reduce((s, d) => s + d.amount, 0)

  // 次回振込 = confirmed deals → next month-end payout（締め/振込日は lib/payout の単一ソース）
  const nextPayoutDeals = deals.filter(d => d.status === 'confirmed')
  const nextPayoutAmt = nextPayoutDeals.reduce((s, d) => s + d.amount, 0)
  const nextPayDate = nextPayoutDate(now) // 翌月末（月末締め・翌月末払い）
  const nextPayLabel = nextPayoutAmt > 0
    ? `${nextPayDate.getMonth() + 1}/${nextPayDate.getDate()} — ¥${nextPayoutAmt.toLocaleString()}`
    : null

  // C2③ 商談予定（meeting_at が未来）を日時順
  const upcomingMeetings = deals
    .filter(d => d.meeting_at && new Date(d.meeting_at).getTime() >= now.getTime())
    .sort((a, b) => new Date(a.meeting_at!).getTime() - new Date(b.meeting_at!).getTime())

  // お客さま向け新名称の解決マップ（reward_snapshot->>menu_id → menus.name）。改名せず表示のみ。best-effort。
  const menuNameById: Record<string, string> = {}
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase/server')
    const admin = await createServiceRoleClient()
    const { data: menus } = await admin.from('menus').select('id, name')
    for (const m of (menus ?? []) as { id: string; name: string }[]) menuNameById[m.id] = m.name
  } catch { /* best-effort */ }
  const dealMenuName = (d: { reward_snapshot?: { menu_id?: string } | null; service_menus?: { name?: string } | null; services?: { name?: string } | null }) =>
    (d.reward_snapshot?.menu_id && menuNameById[d.reward_snapshot.menu_id]) || d.service_menus?.name || d.services?.name || ''

  // P2: 進行中の協力案件で未完了の「手動」タスク（やることに控えめ表示・自動タスクは出さない）。best-effort。
  const coopActiveIds = active.filter(d => d.channel === 'cooperation').map(d => d.id)
  // 対象（案件）ごとに「次にやるべき1件」へ集約。複数タスクは残数バッジで表現（データ/ゲートは無改修＝表示集約のみ）。
  let pendingTasks: { id: string; deal_id: string; label: string; remaining: number }[] = []
  if (coopActiveIds.length) {
    try {
      const { createServiceRoleClient } = await import('@/lib/supabase/server')
      const admin = await createServiceRoleClient()
      const { data } = await admin
        .from('deal_tasks')
        .select('id, deal_id, label, kind, done, sort')
        .in('deal_id', coopActiveIds).eq('kind', 'manual').eq('done', false)
        .order('sort')
      const byDeal = new Map<string, { id: string; deal_id: string; label: string; remaining: number }>()
      for (const t of (data ?? []) as { id: string; deal_id: string; label: string }[]) {
        const ex = byDeal.get(t.deal_id)
        if (ex) ex.remaining++                                  // 同一案件の追加タスクは残数に集約
        else byDeal.set(t.deal_id, { id: t.id, deal_id: t.deal_id, label: t.label, remaining: 0 })
      }
      pendingTasks = [...byDeal.values()].slice(0, 5)
    } catch { /* best-effort（テーブル未作成なら空） */ }
  }

  // ⑨ 動機づけ: 次回振込までの進捗＋やさしい励まし
  const daysToPay   = Math.max(0, Math.ceil((nextPayDate.getTime() - now.getTime()) / 86_400_000))
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const cycleProgress = Math.min(1, now.getDate() / daysInMonth)
  const isEmpty = deals.length === 0
  const encouragement = isEmpty
    ? ''
    : nextPayoutAmt > 0
      ? `確定報酬 ¥${nextPayoutAmt.toLocaleString()} が次回振込にのります。`
      : active.length > 0
        ? 'いい調子です。進行中の案件が成約すると報酬になります。'
        : ''

  // Recent feed
  const dealMap = Object.fromEntries(deals.map(d => [d.id, d]))

  return (
    <div>
      {/* Balance card */}
      <div style={{
        margin: '18px 20px 0',
        background: 'linear-gradient(135deg,#5240F2 0%,#4733E6 52%,#3A28CE 100%)',
        borderRadius: 18, padding: '24px 22px 18px', color: '#fff', position: 'relative', overflow: 'hidden',
      }}>
        {/* Ring decoration（微回転・prefers-reduced-motion で静止） */}
        <div style={{ position: 'absolute', right: -60, top: -60, width: 200, height: 200, pointerEvents: 'none' }}>
          <div className="syn-spin" style={{ position: 'absolute', inset: 0, border: '1.5px solid rgba(255,255,255,.14)', borderRadius: '50%' }} />
          <div className="syn-spin-rev" style={{ position: 'absolute', inset: 28, border: '1.5px solid rgba(255,255,255,.22)', borderRadius: '50%' }} />
        </div>
        {/* SYNAPSE 導線：共有紋章（light）＋「SYNAPSE」のみ。件数の主表示は一覧へ集約。タップで /app/synapse へ。 */}
        <Link href="/app/synapse" aria-label="SYNAPSE つながり" style={{ position: 'absolute', top: 12, right: 12, zIndex: 3, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', padding: '4px 9px 4px 4px', borderRadius: 999, background: 'rgba(255,255,255,.10)', border: '1px solid rgba(255,255,255,.18)' }}>
          <SynapseCrest size={30} tone="light" />
          <span style={{ fontSize: '.56rem', fontWeight: 500, letterSpacing: '.06em', color: 'rgba(255,255,255,.95)', whiteSpace: 'nowrap' }}>SYNAPSE</span>
        </Link>
        <div style={{ fontSize: '.54rem', fontFamily: 'Inter', letterSpacing: '.26em', opacity: .85, marginBottom: 7, textTransform: 'uppercase' }}>
          確定残高
        </div>
        <div style={{ fontFamily: 'var(--font-sans), Inter', fontWeight: 500, fontSize: '40px', fontFeatureSettings: '"tnum" 1', letterSpacing: '-.03em', lineHeight: 1.05 }}>
          <span style={{ fontSize: '1.04rem', fontWeight: 500, opacity: .78, marginRight: 4 }}>¥</span>
          <CountUp value={confirmedBalance} />
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 15, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.28)', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '.6rem', opacity: .85, whiteSpace: 'nowrap' }}>
            次回振込
            <b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2, fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap', letterSpacing: '-.01em' }}>
              {nextPayLabel ?? '予定なし'}
            </b>
          </div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>
            今月の確定
            <b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2, fontFeatureSettings: '"tnum"' }}>
              ¥{monthAmount.toLocaleString()}
            </b>
          </div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>
            累計
            <b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2, fontFeatureSettings: '"tnum"' }}>
              ¥{deals.filter(d => d.status === 'paid' || d.status === 'confirmed').reduce((s, d) => s + d.amount, 0).toLocaleString()}
            </b>
          </div>
        </div>
      </div>

      {/* フロンティア導線はマイページへ移設（A確定）。ホームからは撤去。 */}

      {/* ⑨ 動機づけ: 次回振込までの進捗＋励まし */}
      {!isEmpty && (
        <div className="card-hover" style={{ margin: '12px 20px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '.72rem', fontWeight: 500 }}>次回振込まで <span style={{ color: 'var(--blue)' }}>あと{daysToPay}日</span></span>
            <span style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 500 }}>{nextPayLabel ?? '予定なし'}</span>
          </div>
          <div className="bar-grow" style={{ height: 7, borderRadius: 4, background: 'var(--bg2)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(cycleProgress * 100)}%`, height: '100%', borderRadius: 4, background: 'linear-gradient(90deg,var(--blue) 0%,var(--blue-dk) 100%)' }} />
          </div>
          <p style={{ fontSize: '.64rem', color: 'var(--muted)', margin: '9px 0 0', lineHeight: 1.6 }}>{encouragement}</p>
        </div>
      )}

      {/* ⑨ 空状態: 最初の紹介をしてみよう */}
      {isEmpty && (
        <div className="page-anim" style={{ margin: '16px 20px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: '26px 22px', textAlign: 'center' }}>
          <div className="celebrate-pop" style={{ fontSize: '2.2rem', marginBottom: 10 }} aria-hidden>✨</div>
          <b style={{ fontSize: '.92rem', display: 'block', marginBottom: 6 }}>最初のご案内をしてみよう</b>
          <p style={{ fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.8, marginBottom: 16 }}>
            知り合いをひとり思い浮かべて、つなぐだけ。あとはMBが対応します。
          </p>
          <Link href="/app/refer" className="btn btn-p lift" style={{ display: 'inline-block', textDecoration: 'none', padding: '11px 26px' }}>
            はじめる
          </Link>
        </div>
      )}

      {/* Stats */}
      {!isEmpty && (
      <div className="stagger" style={{ display: 'flex', gap: 10, margin: '14px 20px 0' }}>
        <StatCard label="進行中の案件" countUp={active.length} unit="件" href="/app/cases?f=active" />
        <StatCard label="見込み報酬" countUp={pipeline} format="yen" href="/app/cases?f=active" />
        <StatCard label="今月の成約" countUp={monthConfirmed.length} unit="件" href="/app/rewards" />
      </div>
      )}

      {/* やること：今後の商談スケジュールのみ（受付済みは「最近の動き」に集約） */}
      <div style={{ padding: '22px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: '11px', fontWeight: 500, color: 'var(--t-tertiary)', letterSpacing: '.08em', margin: 0 }}>やること</h2>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
          {/* C2③ 商談予定（日時順） */}
          {upcomingMeetings.map(d => (
            <Link key={`mtg-${d.id}`} href={`/app/cases/${d.id}`} className="row-hover lift" style={{
              display: 'flex', gap: 11, padding: '13px 14px', borderBottom: '1px solid var(--line)', textDecoration: 'none', alignItems: 'center',
            }}>
              <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--blue-bg)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: '.74rem', color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {customerHonorific(d)}{dealMenuName(d) ? `（${dealMenuName(d)}について）` : ''}
                </div>
                <div style={{ fontSize: '.6rem', color: 'var(--blue)', marginTop: 1, fontWeight: 500 }}>
                  {new Date(d.meeting_at!).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })}
                </div>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>›</span>
            </Link>
          ))}

          {/* P2: 進行中の協力案件で未完了の手動タスク（控えめ・報酬額は出さない） */}
          {pendingTasks.map(t => {
            const d = dealMap[t.deal_id]
            return (
              <Link key={`task-${t.id}`} href={`/app/cases/${t.deal_id}`} className="row-hover lift" style={{
                display: 'flex', gap: 11, padding: '13px 14px', borderBottom: '1px solid var(--line)', textDecoration: 'none', alignItems: 'center',
              }}>
                <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--green-bg)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '.74rem', color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.label}
                  </div>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1 }}>
                    {d ? customerHonorific(d) : '案件'}{d?.services?.name ? ` · ${d.services.name}` : ''}
                  </div>
                </div>
                {t.remaining > 0 && (
                  <span style={{ flexShrink: 0, fontSize: '.54rem', fontWeight: 500, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 20, padding: '2px 8px' }}>他{t.remaining}件</span>
                )}
                <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>›</span>
              </Link>
            )
          })}

          {upcomingMeetings.length === 0 && pendingTasks.length === 0 && (
            <p style={{ padding: '16px 14px', fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.7 }}>
              今後の商談予定はありません。
            </p>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div style={{ padding: '22px 20px 6px', paddingTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: '11px', fontWeight: 500, color: 'var(--t-tertiary)', letterSpacing: '.08em', margin: 0 }}>最近の動き</h2>
          <Link href="/app/cases" style={{ fontSize: '.66rem', color: 'var(--blue)', fontWeight: 500, textDecoration: 'none' }}>案件へ →</Link>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
          {recentEvents.length === 0 ? (
            <p style={{ padding: '16px 14px', fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.7 }}>
              最近のアクティビティはありません。
            </p>
          ) : recentEvents.slice(0, 5).map(e => {
            const deal = (e as { deal?: typeof dealMap[string] }).deal ?? dealMap[e.deal_id]
            return (
              /* ② アイコン＋名前＋状態のみ・1行（長文/冗長な日時は排除） */
              <Link key={e.id} href={`/app/cases/${e.deal_id}`} className="row-hover lift" style={{
                display: 'flex', gap: 11, padding: '12px 14px',
                borderBottom: '1px solid var(--line)', textDecoration: 'none',
                alignItems: 'center',
              }}>
                {deal?.services
                  ? <ServiceAvatar logoPath={deal.services.logo_path} icon={deal.services.icon} color={deal.services.color} name={deal.services.name} size={30} />
                  : deal && <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="相談" size={30} />}
                <div style={{ flex: 1, minWidth: 0, fontSize: '.76rem', fontWeight: 500, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {deal ? customerHonorific(deal) : ''}
                </div>
                {/* ③ APP表示は4語統一（共有 lib/status は3面共通のため触れず、ここで表示だけ差し替え）。 */}
                {deal && (() => { const s = dealStatus(deal.status); return <StatusPill size="sm" tone={s.tone} children={s.children === '成約・確定' ? '成約' : s.children} /> })()}
                <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>›</span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* 磨き③: Push許可のソフト前置き（許可未判断のときだけ表示・作成済みで未マウントだった張りぼて解消） */}
      <div style={{ margin: '14px 20px 0' }}>
        <PushOptIn />
      </div>

      <div style={{ height: 12 }} />
    </div>
  )
}

function StatCard({ label, countUp, format, unit, href }: { label: string; countUp: number; format?: 'number' | 'yen'; unit?: string; href: string }) {
  return (
    <Link href={href} className="card-hover" style={{
      flex: 1, background: '#fff', border: '1px solid var(--line)', borderRadius: 13,
      padding: '12px 13px', cursor: 'pointer', textDecoration: 'none',
    }}>
      <div style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontFamily: 'Inter', fontSize: '1.05rem', fontWeight: 500, marginTop: 3, fontFeatureSettings: '"tnum"', letterSpacing: '-.012em', color: 'var(--txt)' }}>
        <CountUp value={countUp} format={format} />{unit && <small style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 500 }}> {unit}</small>}
      </div>
    </Link>
  )
}
