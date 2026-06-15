import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerWithDeals } from '@/lib/supabase/queries'
import ServiceIcon from '@/components/ServiceIcon'

const STATUS_LABEL: Record<string, string> = {
  received: '受付', in_progress: '対応中', confirmed: '成約・確定', paid: '支払済',
}
// Compact status chip palette: neutral / blue / green / muted-green
const STATUS_CHIP: Record<string, { bg: string; color: string; dot: string }> = {
  received:    { bg: 'var(--bg2)',     color: 'var(--muted2)', dot: 'var(--muted2)' },
  in_progress: { bg: 'var(--blue-bg)', color: 'var(--blue)',   dot: 'var(--blue)' },
  confirmed:   { bg: 'var(--green-bg)', color: 'var(--green)', dot: 'var(--green)' },
  paid:        { bg: 'var(--bg2)',     color: 'var(--green)',  dot: 'var(--green)' },
}
// Thin progress hint (0–1) per status — replaces the old 4-step rail
const STATUS_PROGRESS: Record<string, number> = {
  received: 0.25, in_progress: 0.55, confirmed: 0.85, paid: 1,
}

export const runtime = 'edge'

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>
}) {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const result = await getPartnerWithDeals(supabase, user.id)
  if (!result) redirect('/login')
  const { partner, deals } = result
  const { f = 'all' } = await searchParams

  const filtered = deals.filter(d => {
    if (f === 'active') return ['received', 'in_progress'].includes(d.status)
    if (f === 'done')   return ['confirmed', 'paid'].includes(d.status)
    return true
  })

  return (
    <div className="page-anim">
      <div style={{ padding: '22px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: '.98rem', fontWeight: 700 }}>案件</h2>
          <span style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>{filtered.length}件</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 10, padding: 4, margin: '0 20px 16px' }}>
        {[['all', 'すべて'], ['active', '進行中'], ['done', '完了']].map(([val, lbl]) => (
          <Link key={val} href={`/app/cases?f=${val}`} style={{
            flex: 1, textAlign: 'center', textDecoration: 'none',
            padding: '9px 2px', borderRadius: 8, fontSize: '.7rem', fontWeight: 700,
            color: f === val ? 'var(--txt)' : 'var(--muted2)',
            background: f === val ? '#fff' : 'transparent',
            boxShadow: f === val ? '0 2px 8px rgba(14,14,20,.08)' : 'none',
          }}>
            {lbl}
          </Link>
        ))}
      </div>

      {/* Deal list */}
      <div style={{ padding: '0 20px' }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 11, padding: '46px 26px' }}>
            <div style={{ width: 52, height: 52, borderRadius: 15, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.6">
                <path d="M4 6h16M4 12h16M4 18h10"/>
              </svg>
            </div>
            <b style={{ fontSize: '.84rem' }}>案件がありません</b>
            <p style={{ fontSize: '.71rem', lineHeight: 1.75, color: 'var(--muted2)' }}>
              「紹介する」ボタンから案件を登録しましょう。
            </p>
          </div>
        ) : (
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map(d => {
              const chip = STATUS_CHIP[d.status] ?? STATUS_CHIP.received
              const progress = STATUS_PROGRESS[d.status] ?? 0
              return (
                <Link
                  key={d.id}
                  href={`/app/cases/${d.id}`}
                  className="card-hover lift"
                  style={{
                    display: 'block', textDecoration: 'none', color: 'var(--txt)',
                    background: '#fff', border: '1px solid var(--line)', borderRadius: 14,
                    padding: '14px 15px', marginBottom: 10,
                  }}
                >
                  {/* Line 1 — customer name + status chip (left), amount (right) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: '.88rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.customer_name}
                      </b>
                      <span style={{
                        flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 9px', borderRadius: 999,
                        fontSize: '.6rem', fontWeight: 700,
                        background: chip.bg, color: chip.color,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: chip.dot, flexShrink: 0 }} />
                        {STATUS_LABEL[d.status]}
                      </span>
                    </div>
                    {d.amount > 0 && (
                      <span className="tnum" style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.96rem', fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.012em' }}>
                        ¥{d.amount.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Line 2 — service (icon + name, muted) + channel chip */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                    {d.services && <ServiceIcon icon={d.services.icon} color={d.services.color} size={20} />}
                    <small style={{ flex: 1, minWidth: 0, fontSize: '.68rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {d.services?.name}
                    </small>
                    <span className={`chip ${d.channel === 'cooperation' ? 'chip-cooperation' : d.channel === 'referral' ? 'chip-referral' : 'chip-direct'}`} style={{ flexShrink: 0 }}>
                      {d.channel === 'referral' ? '紹介' : d.channel === 'cooperation' ? '協力' : '直販'}
                    </span>
                  </div>

                  {/* Thin progress hint — replaces the old 4-step rail */}
                  <div style={{ marginTop: 11, height: 3, borderRadius: 2, background: 'var(--bg2)', overflow: 'hidden' }}>
                    <div style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 2, background: chip.color === 'var(--muted2)' ? 'var(--muted2)' : chip.color }} />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
      <div style={{ height: 20 }} />
    </div>
  )
}
