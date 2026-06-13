import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerByUserId, getDealsForPartner } from '@/lib/supabase/queries'
import ServiceIcon from '@/components/ServiceIcon'

const STATUS_LABEL: Record<string, string> = {
  received: '受付', in_progress: '対応中', confirmed: '成約・確定', paid: '支払済',
}
const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  received:    { bg: 'transparent', color: 'var(--muted2)' },
  in_progress: { bg: 'transparent', color: 'var(--blue)' },
  confirmed:   { bg: 'transparent', color: 'var(--blue)' },
  paid:        { bg: 'transparent', color: 'var(--green)' },
}
const RAIL_STEPS = ['受付', '担当連絡', '成約', '支払']
const STATUS_STEP: Record<string, number> = {
  received: 0, in_progress: 1, confirmed: 2, paid: 3,
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>
}) {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()

  const partner = await getPartnerByUserId(supabase, user.id)
  if (!partner) redirect('/login')

  const deals = await getDealsForPartner(supabase, partner.id)
  const { f = 'all' } = await searchParams

  const filtered = deals.filter(d => {
    if (f === 'active') return ['received', 'in_progress'].includes(d.status)
    if (f === 'done')   return ['confirmed', 'paid'].includes(d.status)
    return true
  })

  return (
    <div>
      <div style={{ padding: '22px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: '.98rem', fontWeight: 700 }}>案件</h2>
          <span style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>{filtered.length}件</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 10, padding: 4, margin: '0 20px 14px' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 11, padding: '34px 26px' }}>
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
        ) : filtered.map(d => {
          const step = STATUS_STEP[d.status] ?? 0
          return (
            <Link key={d.id} href={`/app/cases/${d.id}`} className="row-hover" style={{ display: 'block', textDecoration: 'none', padding: '17px 6px', borderBottom: '1px solid var(--line)', borderRadius: 8, margin: '0 -6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 11 }}>
                {d.services && <ServiceIcon icon={d.services.icon} color={d.services.color} size={38} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: '.86rem', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--txt)' }}>
                    {d.customer_name}
                  </b>
                  <small style={{ fontSize: '.62rem', color: 'var(--muted)' }}>
                    {d.services?.name} · {d.channel === 'referral' ? '紹介' : '営業'} · {new Date(d.created_at).toLocaleDateString('ja')}
                  </small>
                </div>
              </div>

              {/* Status rail */}
              <div style={{ display: 'flex', alignItems: 'center', margin: '0 1px 5px' }}>
                {RAIL_STEPS.map((s, i) => (
                  <span key={i} style={{ display: 'contents' }}>
                    <span style={{
                      width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                      background: i <= step ? 'var(--blue)' : 'var(--bg)',
                      border: i <= step ? '2px solid var(--blue)' : '2px solid #DBDBE3',
                      boxShadow: i === step ? '0 0 0 4px var(--blue-bg)' : 'none',
                    }}/>
                    {i < 3 && <span style={{ height: 2, flex: 1, background: i < step ? 'var(--blue)' : '#E7E7ED' }}/>}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.54rem', color: 'var(--muted)' }}>
                {RAIL_STEPS.map((s, i) => (
                  <span key={i} style={{ color: i === step ? 'var(--blue)' : undefined, fontWeight: i === step ? 700 : undefined }}>{s}</span>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 }}>
                <span style={{
                  fontSize: '.6rem', fontWeight: 700,
                  color: STATUS_PILL[d.status]?.color ?? 'var(--muted2)',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_PILL[d.status]?.color ?? 'var(--muted)', flexShrink: 0 }}/>
                  {STATUS_LABEL[d.status]}
                </span>
                {d.amount > 0 && (
                  <span style={{ fontFamily: 'Inter', fontSize: '.95rem', fontWeight: 800, fontFeatureSettings: '"tnum"', color: 'var(--txt)', letterSpacing: '-.012em' }}>
                    ¥{d.amount.toLocaleString()}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
      <div style={{ height: 20 }} />
    </div>
  )
}
