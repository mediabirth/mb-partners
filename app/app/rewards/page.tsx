import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerWithDeals } from '@/lib/supabase/queries'
import ServiceIcon from '@/components/ServiceIcon'
import BankChangeSection from './BankChangeSection'

export default async function RewardsPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const result = await getPartnerWithDeals(supabase, user.id)
  if (!result) redirect('/login')
  const { partner, deals } = result

  // Group by month
  const byMonth: Record<string, typeof deals> = {}
  for (const d of deals) {
    if (d.status === 'confirmed' || d.status === 'paid') {
      const key = d.fixed_month?.substring(0, 7) ?? d.created_at.substring(0, 7)
      ;(byMonth[key] ??= []).push(d)
    }
  }
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a))

  const totalGross = Object.values(byMonth).flat().reduce((s, d) => s + d.amount, 0)
  const paidGross  = deals.filter(d => d.status === 'paid').reduce((s, d) => s + d.amount, 0)
  const confirmedGross = deals.filter(d => d.status === 'confirmed').reduce((s, d) => s + d.amount, 0)
  const totalDeals = Object.values(byMonth).flat().length

  function withholding(gross: number) {
    return partner?.tax_type === 'individual' ? Math.round(gross * 0.1021) : 0
  }

  return (
    <div>
      {/* Summary card (dark) */}
      <div style={{
        margin: '18px 20px 0',
        background: 'linear-gradient(135deg,#5240F2 0%,#4733E6 52%,#3A28CE 100%)',
        borderRadius: 18, padding: '24px 22px 18px', color: '#fff',
      }}>
        <div style={{ fontSize: '.54rem', fontFamily: 'Inter', letterSpacing: '.26em', opacity: .85, marginBottom: 7, textTransform: 'uppercase' }}>
          {new Date().getFullYear()} Total
        </div>
        <div style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '2.5rem', fontFeatureSettings: '"tnum"', letterSpacing: '-.022em', lineHeight: 1.05 }}>
          <span style={{ fontSize: '1.04rem', fontWeight: 600, opacity: .78, marginRight: 4 }}>¥</span>
          {totalGross.toLocaleString()}
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 15, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.28)' }}>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>
            支払済<b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 700, marginTop: 2 }}>¥{paidGross.toLocaleString()}</b>
          </div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>
            未払(確定)<b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 700, marginTop: 2 }}>¥{confirmedGross.toLocaleString()}</b>
          </div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>
            成約数<b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 700, marginTop: 2 }}>{totalDeals}件</b>
          </div>
        </div>
      </div>

      {/* Statement buttons */}
      <div style={{ display: 'flex', gap: 8, margin: '14px 20px 0' }}>
        <Link href="/app/rewards/statement" className="btn btn-g" style={{ flex: 1, padding: 11, marginTop: 0, textDecoration: 'none', textAlign: 'center', fontSize: '.7rem' }}>
          支払明細
        </Link>
        <Link href="/app/rewards/statement" className="btn btn-g" style={{ flex: 1, padding: 11, marginTop: 0, textDecoration: 'none', textAlign: 'center', fontSize: '.7rem' }}>
          年間集計
        </Link>
      </div>

      {/* Monthly accordion */}
      <div style={{ padding: '22px 20px 6px' }}>
        <h2 style={{ fontSize: '.98rem', fontWeight: 700, marginBottom: 14 }}>月次明細</h2>
      </div>

      {months.length === 0 ? (
        <p style={{ padding: '0 20px', fontSize: '.7rem', color: 'var(--muted2)' }}>
          まだ確定・支払済みの報酬がありません。
        </p>
      ) : months.map(ym => {
        const monthDeals = byMonth[ym]
        const gross = monthDeals.reduce((s, d) => s + d.amount, 0)
        const wh    = withholding(gross)
        const net   = gross - wh
        const [y, m] = ym.split('-')
        const paid  = monthDeals.every(d => d.status === 'paid')

        return (
          <MonthAccordion
            key={ym}
            title={`${y}年${m}月`}
            subtitle={paid ? `支払済 · ${monthDeals.length}件` : `振込予定 · ${monthDeals.length}件`}
            net={net}
          >
            {monthDeals.map(d => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 6px', borderBottom: '1px solid var(--line)', fontSize: '.73rem', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {d.services && <ServiceIcon icon={d.services.icon} color={d.services.color} size={26} />}
                  <div>
                    <div style={{ fontWeight: 600 }}>{d.customer_name}</div>
                    <div style={{ fontSize: '.59rem', color: 'var(--muted)', marginTop: 1 }}>
                      {d.services?.name} · {d.channel === 'referral' ? '紹介' : '営業'}
                    </div>
                  </div>
                </div>
                <span style={{ fontFamily: 'Inter', fontFeatureSettings: '"tnum"', fontWeight: 700, letterSpacing: '-.01em' }}>
                  ¥{d.amount.toLocaleString()}
                </span>
              </div>
            ))}
            {wh > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 6px', fontSize: '.73rem' }}>
                <span style={{ color: 'var(--muted2)' }}>源泉所得税(10.21%)</span>
                <span style={{ fontFamily: 'Inter', fontWeight: 700, color: 'var(--red)' }}>−¥{wh.toLocaleString()}</span>
              </div>
            )}
          </MonthAccordion>
        )
      })}

      <BankChangeSection currentBank={(partner as { bank?: unknown }).bank as import('@/lib/supabase/queries').BankInfo | null ?? null} />

      <div style={{ height: 32 }} />
    </div>
  )
}

function MonthAccordion({ title, subtitle, net, children }: {
  title: string; subtitle: string; net: number; children: React.ReactNode
}) {
  // Server-rendered as open for first month — using details/summary for native accordion
  return (
    <details style={{ margin: '0 20px 10px', borderBottom: '1px solid var(--line)' }} open>
      <summary style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 6px', cursor: 'pointer', listStyle: 'none',
      }}>
        <div>
          <b style={{ fontSize: '.78rem', display: 'block' }}>{title}</b>
          <small style={{ fontSize: '.6rem', color: 'var(--muted)' }}>{subtitle}</small>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '1rem', fontFeatureSettings: '"tnum"', letterSpacing: '-.016em' }}>
            ¥{net.toLocaleString()}
          </span>
          <span style={{ color: 'var(--muted)', fontSize: '.85rem' }}>›</span>
        </div>
      </summary>
      <div style={{ borderTop: '1px solid var(--line)', paddingBottom: 6 }}>
        {children}
      </div>
    </details>
  )
}
