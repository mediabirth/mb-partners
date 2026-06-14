import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAllDeals } from '@/lib/supabase/queries'
import ConsoleNav from '@/components/ConsoleNav'
import ChannelChart from './ChannelChart'
import GlobalSearchClient from './GlobalSearchClient'
import ConsoleMain from '@/components/ConsolePageTransition'
import CountUp from '@/components/CountUp'

export const runtime = 'edge'

export default async function ConsolePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const [profileRes, deals, recentEventsRes, activePartnersRes] = await Promise.all([
    supabase.from('profiles').select('name, role, color').eq('id', user.id).single(),
    getAllDeals(supabase),
    supabase.from('deal_events')
      .select('id, body, created_at, deal_id, deals(customer_name, service_id, channel)')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase.from('partners').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ])
  const profile = profileRes.data
  const recentEvents = recentEventsRes.data

  // KPIs
  const now = new Date()
  const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const monthDeals     = deals.filter(d => d.fixed_month?.startsWith(ym) && d.status === 'confirmed')
  const monthGross     = monthDeals.reduce((s, d) => s + d.amount, 0)
  const activePartners = activePartnersRes.count ?? 0
  const pending        = deals.filter(d => d.status === 'received').length

  // Channel mix for chart (3ch: 直販 / リファラル / フロンティア)
  const directTotal   = deals.filter(d => d.channel === 'direct').length
  const referralTotal = deals.filter(d => d.channel === 'referral').length
  const frontierTotal = deals.filter(d => d.channel === 'cooperation' || d.channel === 'frontier').length

  // Monthly confirmed for last 6 months
  const monthlyData: { ym: string; label: string; referral: number; direct: number; frontier: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${d.getMonth() + 1}月`
    const monthConfirmed = deals.filter(dd => dd.status === 'confirmed' && dd.fixed_month?.startsWith(key))
    monthlyData.push({
      ym: key, label,
      direct:   monthConfirmed.filter(dd => dd.channel === 'direct').length,
      referral: monthConfirmed.filter(dd => dd.channel === 'referral').length,
      frontier: monthConfirmed.filter(dd => dd.channel === 'cooperation' || dd.channel === 'frontier').length,
    })
  }

  // Upcoming meetings (deals with meeting_at in future)
  const upcomingMeetings = deals
    .filter(d => d.meeting_at && new Date(d.meeting_at) >= now)
    .sort((a, b) => new Date(a.meeting_at!).getTime() - new Date(b.meeting_at!).getTime())
    .slice(0, 5)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName={profile?.name ?? '管理者'} profileColor={profile?.color ?? '#0E0E14'} />

      <ConsoleMain>
        {/* Top bar */}
        <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 900, letterSpacing: '-.01em' }}>ダッシュボード</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GlobalSearchClient />
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '30px 32px 44px', maxWidth: 1120, margin: '0 auto' }}>

          {/* 今月のハイライト — hero */}
          <div className="page-anim shine card-hover" style={{
            position: 'relative', borderRadius: 16, padding: '20px 24px', marginBottom: 20,
            background: 'linear-gradient(120deg, var(--blue) 0%, var(--blue-dk) 100%)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, overflow: 'hidden', boxShadow: '0 10px 30px rgba(71,51,230,.22)',
          }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>今月のハイライト</div>
              <div style={{ fontSize: '1.18rem', fontWeight: 800, marginTop: 7, letterSpacing: '-.01em', lineHeight: 1.45 }}>
                {monthDeals.length > 0 ? (
                  <>今月は <span className="tnum">{monthDeals.length}</span> 件成約・<span className="tnum">¥{monthGross.toLocaleString()}</span> 確定 🎉</>
                ) : (
                  <>今月の成約はこれから。紹介・協力で動かしていきましょう</>
                )}
              </div>
              <div style={{ fontSize: '.66rem', color: 'rgba(255,255,255,.8)', marginTop: 7 }}>
                稼働パートナー {activePartners}名 · 進行中の案件 {deals.length}件
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
            <KpiCard label="今月の成約(確定)" value={monthDeals.length} suffix="件" icon="deal" accent="var(--blue)" />
            <KpiCard label="今月の確定報酬" value={monthGross} format="yen" icon="yen" accent="var(--green)" />
            <KpiCard label="稼働パートナー" value={activePartners} suffix="名" icon="users" accent="var(--blue)" />
            <KpiCard label="要対応(受付中)" value={pending} suffix="件" icon="alert" accent="var(--amber)" alert={pending > 0} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginBottom: 18 }}>
            {/* Recent activity — lively feed */}
            <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 18px', borderBottom: '1px solid var(--line)' }}>
                <b style={{ fontSize: '.84rem' }}>最近の動き</b>
                <Link href="/console/deals" style={{ fontSize: '.62rem', color: 'var(--blue)', fontWeight: 700, textDecoration: 'none' }}>案件へ →</Link>
              </div>
              {(recentEvents ?? []).length === 0 ? (
                <p style={{ padding: '16px 18px', fontSize: '.72rem', color: 'var(--muted2)' }}>まだ記録がありません</p>
              ) : (
                <div className="stagger">
                  {(recentEvents ?? []).map((e: any) => {
                    const ch = channelMeta(e.deals?.channel)
                    return (
                      <div key={e.id} className="lift" style={{ display: 'flex', gap: 12, padding: '13px 18px', borderBottom: '1px solid #F2F2F6', fontSize: '.73rem', alignItems: 'center' }}>
                        <span className="feed-dot" style={{ background: ch.dot }} />
                        <span style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.6rem', color: 'var(--muted)', width: 38 }}>
                          {new Date(e.created_at).toLocaleDateString('ja', { month: 'numeric', day: 'numeric' })}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <b style={{ fontSize: '.74rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {e.deals?.customer_name}
                            </b>
                            {ch.label && <span className={`chip ${ch.cls}`}>{ch.label}</span>}
                          </div>
                          <small style={{ display: 'block', fontSize: '.62rem', color: 'var(--muted2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {e.body}
                          </small>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Quick links */}
            <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '15px 18px' }}>
              <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 12 }}>クイックアクセス</b>
              {[
                { href: '/console/deals', label: '案件ボード', desc: `${deals.length}件の案件` },
                { href: '/console/partners', label: 'パートナー一覧', desc: `${activePartners}名稼働中` },
                { href: '/console/services', label: 'サービス・報酬ルール', desc: 'マスタデータ管理' },
                { href: '/console/settings', label: '設定', desc: '支払サイクル・通知・管理者' },
              ].map(item => (
                <Link key={item.href} href={item.href} className="lift" style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '11px 10px', margin: '0 -10px', borderRadius: 8, borderBottom: '1px solid #F2F2F6', textDecoration: 'none',
                  color: 'var(--txt)', fontSize: '.77rem',
                }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{item.label}</div>
                    <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 2 }}>{item.desc}</div>
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>›</span>
                </Link>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {/* Channel chart */}
            <ChannelChart monthlyData={monthlyData} directTotal={directTotal} referralTotal={referralTotal} frontierTotal={frontierTotal} />

            {/* Meetings panel */}
            <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 18px', borderBottom: '1px solid var(--line)' }}>
                <b style={{ fontSize: '.84rem' }}>商談スケジュール</b>
                <Link href="/console/deals" style={{ fontSize: '.62rem', color: 'var(--blue)', fontWeight: 700, textDecoration: 'none' }}>全案件 →</Link>
              </div>
              {upcomingMeetings.length === 0 ? (
                <p style={{ padding: '16px 18px', fontSize: '.72rem', color: 'var(--muted2)', lineHeight: 1.7 }}>
                  予定されている商談はありません
                </p>
              ) : upcomingMeetings.map((d, i) => {
                const dt = new Date(d.meeting_at!)
                const isToday = dt.toDateString() === now.toDateString()
                return (
                  <Link key={d.id} href={`/console/deals`} className="lift" style={{
                    display: 'flex', gap: 12, padding: '13px 18px',
                    borderBottom: '1px solid #F2F2F6', textDecoration: 'none',
                    color: 'var(--txt)', alignItems: 'center',
                  }}>
                    <div style={{ flexShrink: 0, textAlign: 'center', width: 36 }}>
                      <div style={{ fontSize: '.58rem', fontFamily: 'Inter', color: isToday ? 'var(--blue)' : 'var(--muted2)', fontWeight: 700 }}>
                        {dt.toLocaleDateString('ja', { month: 'numeric', day: 'numeric' })}
                      </div>
                      <div style={{ fontSize: '.6rem', fontFamily: 'Inter', color: 'var(--muted)', marginTop: 1 }}>
                        {dt.toLocaleTimeString('ja', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.76rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.customer_name}
                      </div>
                      <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 2 }}>
                        {d.services?.name}{d.partners?.profiles?.name ? ` · ${d.partners.profiles.name}` : ''}
                      </div>
                    </div>
                    {isToday && (
                      <span style={{ fontSize: '.58rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'var(--blue-bg)', color: 'var(--blue)', flexShrink: 0, animation: 'pulseDot 2.8s ease-in-out infinite' }}>TODAY</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </ConsoleMain>
    </div>
  )
}

// Channel → display chip + dot color (display only; underlying data unchanged)
function channelMeta(channel?: string): { label: string; cls: string; dot: string } {
  switch (channel) {
    case 'referral':    return { label: '紹介', cls: 'chip-referral',    dot: 'var(--blue)' }
    case 'cooperation':
    case 'frontier':    return { label: '協力', cls: 'chip-cooperation', dot: 'var(--green)' }
    case 'direct':      return { label: '直販', cls: 'chip-direct',      dot: 'var(--txt)' }
    default:            return { label: '',     cls: 'chip-direct',      dot: 'var(--muted)' }
  }
}

function KpiIcon({ id }: { id: string }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 } as const
  switch (id) {
    case 'deal':  return <svg {...p}><path d="M20 6L9 17l-5-5" /></svg>
    case 'yen':   return <svg {...p}><path d="M12 4l-4 7h8l-4-7zM12 11v9M8 14h8M8 17h8" /></svg>
    case 'users': return <svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
    case 'alert': return <svg {...p}><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg>
    default:      return null
  }
}

function KpiCard({ label, value, suffix, format, icon, accent, alert }: {
  label: string; value: number; suffix?: string; format?: 'number' | 'yen'
  icon: string; accent: string; alert?: boolean
}) {
  const TINT: Record<string, string> = {
    'var(--blue)': 'var(--blue-bg)', 'var(--green)': 'var(--green-bg)', 'var(--amber)': 'var(--amber-bg)',
  }
  const numColor = alert ? 'var(--red)' : 'var(--txt)'
  const badgeColor = alert ? 'var(--red)' : accent
  const badgeBg = alert ? 'var(--red-bg)' : (TINT[accent] ?? 'var(--blue-bg)')
  return (
    <div className="card-hover" style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 700, paddingTop: 4 }}>{label}</div>
        <span style={{
          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: badgeBg, color: badgeColor,
        }}>
          <KpiIcon id={icon} />
        </span>
      </div>
      <div style={{ fontFamily: 'Inter', fontSize: '1.5rem', fontWeight: 800, marginTop: 8, fontFeatureSettings: '"tnum"', letterSpacing: '-.02em', color: numColor }}>
        <CountUp value={value} format={format} />
        {suffix && <small style={{ fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 400, marginLeft: 3, color: 'var(--muted2)' }}>{suffix}</small>}
      </div>
    </div>
  )
}

