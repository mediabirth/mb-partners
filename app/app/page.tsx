import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerByUserId, getDealsForPartner, getRecentDealEvents } from '@/lib/supabase/queries'
import ServiceIcon from '@/components/ServiceIcon'

const STATUS_LABEL: Record<string, string> = {
  received: '受付', in_progress: '対応中', confirmed: '成約・確定', paid: '支払済',
}

export default async function AppPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const partner = await getPartnerByUserId(supabase, user.id)
  if (!partner) redirect('/login')

  const deals = await getDealsForPartner(supabase, partner.id)
  const recentEvents = await getRecentDealEvents(supabase, deals.map(d => d.id))

  // Stats
  const active = deals.filter(d => ['received', 'in_progress'].includes(d.status))
  const pipeline = active.reduce((s, d) => s + (d.amount || 0), 0)
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthConfirmed = deals.filter(d => d.status === 'confirmed' && d.fixed_month?.startsWith(ym))
  const monthAmount = monthConfirmed.reduce((s, d) => s + (d.amount || 0), 0)
  const confirmedBalance = deals.filter(d => d.status === 'confirmed').reduce((s, d) => s + d.amount, 0)

  // 次回振込 = confirmed deals → next month-end payout
  const nextPayoutDeals = deals.filter(d => d.status === 'confirmed')
  const nextPayoutAmt = nextPayoutDeals.reduce((s, d) => s + d.amount, 0)
  // next month-end date: last day of next month
  const nextPayDate = new Date(now.getFullYear(), now.getMonth() + 1 + 1, 0) // last day of next month
  const nextPayLabel = nextPayoutAmt > 0
    ? `${nextPayDate.getMonth() + 1}/${nextPayDate.getDate()} — ¥${nextPayoutAmt.toLocaleString()}`
    : null

  // Todo: deals waiting for partner action (received status)
  const todos = deals.filter(d => d.status === 'received').slice(0, 3)

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
        <div style={{ fontSize: '.54rem', fontFamily: 'Inter', letterSpacing: '.26em', opacity: .85, marginBottom: 7, textTransform: 'uppercase' }}>
          Confirmed Balance
        </div>
        <div style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '2.5rem', fontFeatureSettings: '"tnum"', letterSpacing: '-.022em', lineHeight: 1.05 }}>
          <span style={{ fontSize: '1.04rem', fontWeight: 600, opacity: .78, marginRight: 4 }}>¥</span>
          {confirmedBalance.toLocaleString()}
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 15, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.28)', position: 'relative', zIndex: 1 }}>
          {nextPayLabel ? (
            <div style={{ fontSize: '.6rem', opacity: .85, whiteSpace: 'nowrap' }}>
              次回振込
              <b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 700, marginTop: 2, fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap', letterSpacing: '-.01em' }}>
                {nextPayLabel}
              </b>
            </div>
          ) : null}
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

      {/* Stats */}
      <div className="stagger" style={{ display: 'flex', gap: 10, margin: '14px 20px 0' }}>
        <StatCard label="進行中の案件" value={`${active.length}`} unit="件" href="/app/cases?f=active" />
        <StatCard label="見込み報酬" value={`¥${pipeline.toLocaleString()}`} href="/app/cases?f=active" />
        <StatCard label="今月の成約" value={`${monthConfirmed.length}`} unit="件" href="/app/rewards" />
      </div>

      {/* Todos */}
      <div style={{ padding: '22px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: '.98rem', fontWeight: 700 }}>やること</h2>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
          {todos.length === 0 ? (
            <p style={{ padding: '16px 14px', fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.7 }}>
              現在、対応待ちの案件はありません。
            </p>
          ) : todos.map(d => (
            <Link key={d.id} href={`/app/cases/${d.id}`} className="row-hover" style={{
              display: 'flex', gap: 11, padding: '13px 14px',
              borderBottom: '1px solid var(--line)', textDecoration: 'none',
              alignItems: 'center',
            }}>
              <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--amber-bg)', color: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
                </svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '.74rem', color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.customer_name} — 受付済み
                </div>
                <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1 }}>
                  {d.services?.name} · {new Date(d.created_at).toLocaleDateString('ja')}
                </div>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>›</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div style={{ padding: '22px 20px 6px', paddingTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: '.98rem', fontWeight: 700 }}>最近の動き</h2>
          <Link href="/app/cases" style={{ fontSize: '.66rem', color: 'var(--blue)', fontWeight: 500, textDecoration: 'none' }}>案件へ →</Link>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
          {recentEvents.length === 0 ? (
            <p style={{ padding: '16px 14px', fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.7 }}>
              最近のアクティビティはありません。<br/>
              「紹介する」ボタンから案件を登録してみましょう。
            </p>
          ) : recentEvents.slice(0, 5).map(e => {
            const deal = dealMap[e.deal_id]
            return (
              <Link key={e.id} href={`/app/cases/${e.deal_id}`} className="row-hover" style={{
                display: 'flex', gap: 11, padding: '12px 14px',
                borderBottom: '1px solid var(--line)', textDecoration: 'none',
                alignItems: 'center',
              }}>
                {deal?.services && (
                  <ServiceIcon icon={deal.services.icon} color={deal.services.color} size={30} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.72rem', color: 'var(--txt)', lineHeight: 1.55, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <b>{deal?.customer_name}</b> — {e.body}
                  </div>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 2 }}>
                    {new Date(e.created_at).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>›</span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Help link */}
      <div style={{ padding: '10px 20px 0' }}>
        <Link href="/app/support" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
          background: '#fff', border: '1px solid var(--line)', borderRadius: 13,
          textDecoration: 'none',
        }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--blue-bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.8">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--txt)' }}>お問い合わせ</div>
            <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 1 }}>報酬・案件・アカウントのご質問はこちら</div>
          </div>
          <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>›</span>
        </Link>
      </div>

      <div style={{ height: 20 }} />
    </div>
  )
}

function StatCard({ label, value, unit, href }: { label: string; value: string; unit?: string; href: string }) {
  return (
    <Link href={href} className="card-hover" style={{
      flex: 1, background: '#fff', border: '1px solid var(--line)', borderRadius: 13,
      padding: '12px 13px', cursor: 'pointer', textDecoration: 'none',
    }}>
      <div style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: 'Inter', fontSize: '1.05rem', fontWeight: 800, marginTop: 3, fontFeatureSettings: '"tnum"', letterSpacing: '-.012em', color: 'var(--txt)' }}>
        {value}{unit && <small style={{ fontSize: '.6rem', color: 'var(--muted)', fontWeight: 500 }}> {unit}</small>}
      </div>
    </Link>
  )
}
