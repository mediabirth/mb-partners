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
import InviteFellowCard from '@/components/InviteFellowCard'

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
        : '次の紹介で、新しい報酬が生まれます。'

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
        {/* Ring decoration */}
        <div style={{ position: 'absolute', right: -60, top: -60, width: 200, height: 200, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, border: '1.5px solid rgba(255,255,255,.14)', borderRadius: '50%', animation: 'spin 30s linear infinite' }} />
          <div style={{ position: 'absolute', inset: 28, border: '1.5px solid rgba(255,255,255,.22)', borderRadius: '50%', animation: 'spin 20s linear infinite reverse' }} />
        </div>
        <div style={{ fontSize: '.54rem', fontFamily: 'Inter', letterSpacing: '.26em', opacity: .85, marginBottom: 7, textTransform: 'uppercase' }}>
          確定残高
        </div>
        <div style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '2.5rem', fontFeatureSettings: '"tnum"', letterSpacing: '-.022em', lineHeight: 1.05 }}>
          <span style={{ fontSize: '1.04rem', fontWeight: 600, opacity: .78, marginRight: 4 }}>¥</span>
          <CountUp value={confirmedBalance} />
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 15, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.28)', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '.6rem', opacity: .85, whiteSpace: 'nowrap' }}>
            次回振込
            <b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 700, marginTop: 2, fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap', letterSpacing: '-.01em' }}>
              {nextPayLabel ?? '予定なし'}
            </b>
          </div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>
            今月の確定
            <b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 700, marginTop: 2, fontFeatureSettings: '"tnum"' }}>
              ¥{monthAmount.toLocaleString()}
            </b>
          </div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>
            累計
            <b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 700, marginTop: 2, fontFeatureSettings: '"tnum"' }}>
              ¥{deals.filter(d => d.status === 'paid' || d.status === 'confirmed').reduce((s, d) => s + d.amount, 0).toLocaleString()}
            </b>
          </div>
        </div>
      </div>

      {/* R2-C: フロンティア導線（is_frontier のみ） */}
      {(partner as { is_frontier?: boolean }).is_frontier && (
        <Link href="/app/frontier" className="card-hover lift" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 20px 0', background: 'linear-gradient(120deg,var(--blue-dk),#2a1fb0)', color: '#fff', borderRadius: 14, padding: '14px 16px', textDecoration: 'none' }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {/* Hub マーク（単色フラット・2×2グリッドの世界観） */}
            <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
              <rect x="19" y="19" width="10" height="10" rx="3" fill="#fff"/>
              <rect x="6"  y="6"  width="8" height="8" rx="2.5" stroke="#fff" strokeWidth="2.4"/>
              <rect x="34" y="6"  width="8" height="8" rx="2.5" stroke="#fff" strokeWidth="2.4"/>
              <rect x="6"  y="34" width="8" height="8" rx="2.5" stroke="#fff" strokeWidth="2.4"/>
              <rect x="34" y="34" width="8" height="8" rx="2.5" stroke="#fff" strokeWidth="2.4"/>
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.82rem', fontWeight: 800 }}>フロンティア ダッシュボード</div>
            <div style={{ fontSize: '.62rem', opacity: .85, marginTop: 1 }}>あなたのチームのオーバーライドと招待を管理</div>
          </div>
          <span style={{ fontSize: '1rem', opacity: .9 }}>›</span>
        </Link>
      )}

      {/* ⑨ 動機づけ: 次回振込までの進捗＋励まし */}
      {!isEmpty && (
        <div className="card-hover" style={{ margin: '12px 20px 0', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: '.72rem', fontWeight: 800 }}>次回振込まで <span style={{ color: 'var(--blue)' }}>あと{daysToPay}日</span></span>
            <span style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 600 }}>{nextPayLabel ?? '予定なし'}</span>
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
          <b style={{ fontSize: '.92rem', display: 'block', marginBottom: 6 }}>最初の紹介をしてみよう</b>
          <p style={{ fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.8, marginBottom: 16 }}>
            知り合いをひとり思い浮かべて、つなぐだけ。あとはMBが対応します。
          </p>
          <Link href="/app/refer" className="btn btn-p lift" style={{ display: 'inline-block', textDecoration: 'none', padding: '11px 26px' }}>
            紹介をはじめる
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
          <h2 className="ty-h2">やること</h2>
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
                <div style={{ fontWeight: 700, fontSize: '.74rem', color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {customerHonorific(d)}{(d.service_menus?.name || d.services?.name) ? `（${d.service_menus?.name || d.services?.name}について）` : ''}
                </div>
                <div style={{ fontSize: '.6rem', color: 'var(--blue)', marginTop: 1, fontWeight: 700 }}>
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
                  <div style={{ fontWeight: 700, fontSize: '.74rem', color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.label}
                  </div>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1 }}>
                    {d ? customerHonorific(d) : '協力案件'}{d?.services?.name ? ` · ${d.services.name}` : ''}
                  </div>
                </div>
                {t.remaining > 0 && (
                  <span style={{ flexShrink: 0, fontSize: '.54rem', fontWeight: 700, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 20, padding: '2px 8px' }}>他{t.remaining}件</span>
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
          <h2 className="ty-h2">最近の動き</h2>
          <Link href="/app/cases" style={{ fontSize: '.66rem', color: 'var(--blue)', fontWeight: 500, textDecoration: 'none' }}>案件へ →</Link>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
          {recentEvents.length === 0 ? (
            <p style={{ padding: '16px 14px', fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.7 }}>
              最近のアクティビティはありません。<br/>
              「紹介する」ボタンから案件を登録してみましょう。
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
                <div style={{ flex: 1, minWidth: 0, fontSize: '.76rem', fontWeight: 600, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {deal ? customerHonorific(deal) : ''}
                </div>
                {deal && <StatusPill size="sm" {...dealStatus(deal.status)} />}
                <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>›</span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Feature E（E-1）：仲間（プロ紹介者）を招待する導線（非金銭・/r顧客紹介とは別物）。 */}
      <div style={{ padding: '16px 0 6px' }}>
        <InviteFellowCard partnerId={partner.id} />
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
      <div style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: 'Inter', fontSize: '1.05rem', fontWeight: 800, marginTop: 3, fontFeatureSettings: '"tnum"', letterSpacing: '-.012em', color: 'var(--txt)' }}>
        <CountUp value={countUp} format={format} />{unit && <small style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 500 }}> {unit}</small>}
      </div>
    </Link>
  )
}
