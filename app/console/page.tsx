import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAllDeals } from '@/lib/supabase/queries'
import ConsoleNav from '@/components/ConsoleNav'
import ChannelChart from './ChannelChart'
import GlobalSearchClient from './GlobalSearchClient'
import ConsoleMain from '@/components/ConsolePageTransition'

export const runtime = 'edge'

export default async function ConsolePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const [profileRes, deals, recentEventsRes, activePartnersRes] = await Promise.all([
    supabase.from('profiles').select('name, role, color').eq('id', user.id).single(),
    getAllDeals(supabase),
    supabase.from('deal_events')
      .select('id, body, created_at, deal_id, deals(customer_name, service_id)')
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
        <div style={{ padding: '28px 28px', maxWidth: 1100, margin: '0 auto' }}>

          {/* KPIs */}
          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
            <KpiCard label="今月の成約(確定)" value={monthDeals.length} suffix="件" highlight />
            <KpiCard label="今月の確定報酬" value={`¥${monthGross.toLocaleString()}`} />
            <KpiCard label="稼働パートナー" value={activePartners} suffix="名" />
            <KpiCard label="要対応(受付中)" value={pending} suffix="件" alert={pending > 0} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Recent activity */}
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                <b style={{ fontSize: '.84rem' }}>最近の動き</b>
                <Link href="/console/deals" style={{ fontSize: '.62rem', color: 'var(--blue)', fontWeight: 700, textDecoration: 'none' }}>案件へ →</Link>
              </div>
              {(recentEvents ?? []).length === 0 ? (
                <p style={{ padding: '14px 16px', fontSize: '.72rem', color: 'var(--muted2)' }}>まだ記録がありません</p>
              ) : (recentEvents ?? []).map((e: any) => (
                <div key={e.id} style={{ display: 'flex', gap: 11, padding: '12px 16px', borderBottom: '1px solid #F2F2F6', fontSize: '.73rem', alignItems: 'center' }}>
                  <span style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.6rem', color: 'var(--muted)', width: 40 }}>
                    {new Date(e.created_at).toLocaleDateString('ja', { month: 'numeric', day: 'numeric' })}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: 'block', fontSize: '.74rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(e as any).deals?.customer_name}
                    </b>
                    <small style={{ display: 'block', fontSize: '.62rem', color: 'var(--muted2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.body}
                    </small>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick links */}
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px' }}>
              <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 12 }}>クイックアクセス</b>
              {[
                { href: '/console/deals', label: '案件ボード', desc: `${deals.length}件の案件` },
                { href: '/console/partners', label: 'パートナー一覧', desc: `${activePartners}名稼働中` },
                { href: '/console/services', label: 'サービス・報酬ルール', desc: 'マスタデータ管理' },
                { href: '/console/settings', label: '設定', desc: '支払サイクル・通知・管理者' },
              ].map(item => (
                <Link key={item.href} href={item.href} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '11px 0', borderBottom: '1px solid #F2F2F6', textDecoration: 'none',
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Channel chart */}
            <ChannelChart monthlyData={monthlyData} directTotal={directTotal} referralTotal={referralTotal} frontierTotal={frontierTotal} />

            {/* Meetings panel */}
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                <b style={{ fontSize: '.84rem' }}>商談スケジュール</b>
                <Link href="/console/deals" style={{ fontSize: '.62rem', color: 'var(--blue)', fontWeight: 700, textDecoration: 'none' }}>全案件 →</Link>
              </div>
              {upcomingMeetings.length === 0 ? (
                <p style={{ padding: '14px 16px', fontSize: '.72rem', color: 'var(--muted2)', lineHeight: 1.7 }}>
                  予定されている商談はありません
                </p>
              ) : upcomingMeetings.map((d, i) => {
                const dt = new Date(d.meeting_at!)
                const isToday = dt.toDateString() === now.toDateString()
                return (
                  <Link key={d.id} href={`/console/deals`} style={{
                    display: 'flex', gap: 12, padding: '12px 16px',
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
                      <span style={{ fontSize: '.58rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'var(--blue-bg)', color: 'var(--blue)', flexShrink: 0 }}>TODAY</span>
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

function KpiCard({ label, value, suffix, highlight, alert }: {
  label: string; value: string | number; suffix?: string; highlight?: boolean; alert?: boolean
}) {
  return (
    <div className="card-hover" style={{
      background: highlight ? 'var(--blue)' : '#fff',
      border: `1px solid ${highlight ? 'var(--blue)' : 'var(--line)'}`,
      borderRadius: 14, padding: 16,
      color: highlight ? '#fff' : 'var(--txt)',
    }}>
      <div style={{ fontSize: '.62rem', color: highlight ? 'rgba(255,255,255,.75)' : 'var(--muted2)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: 'Inter', fontSize: '1.45rem', fontWeight: 800, marginTop: 6, fontFeatureSettings: '"tnum"', letterSpacing: '-.02em', color: alert ? 'var(--red)' : undefined }}>
        {value}{suffix && <small style={{ fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 400, marginLeft: 3 }}>{suffix}</small>}
      </div>
    </div>
  )
}

