import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerWithDeals } from '@/lib/supabase/queries'
import { customerHonorific } from '@/lib/customer'

const STATUS_LABEL: Record<string, string> = {
  received: '受付', in_progress: '対応中', confirmed: '成約・確定', paid: '支払済',
}
// ⑥ 段階ステッパー（4段）
const RAIL_STEPS = ['受付', '対応中', '成約', '支払済']
const STATUS_STEP: Record<string, number> = {
  received: 0, in_progress: 1, confirmed: 2, paid: 3,
}

// 4段ステッパー（旧実装の段階表示に回帰）。完了段は塗り、現在段は強調。
function StatusStepper({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: 12 }}>
      {RAIL_STEPS.map((label, i) => {
        const done = i <= step
        const isCurrent = i === step
        const color = i === 3 && done ? 'var(--green)' : 'var(--blue)'
        return (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {/* connector to previous node */}
            {i > 0 && (
              <span style={{ position: 'absolute', top: 6, right: '50%', width: '100%', height: 2, background: i <= step ? color : 'var(--line)' }} />
            )}
            <span style={{
              position: 'relative', zIndex: 1, width: isCurrent ? 14 : 12, height: isCurrent ? 14 : 12, borderRadius: '50%',
              background: done ? color : '#fff', border: `2px solid ${done ? color : 'var(--line)'}`,
              boxShadow: isCurrent ? `0 0 0 4px ${i === 3 ? 'var(--green-bg)' : 'var(--blue-bg)'}` : 'none',
            }} />
            <span style={{ fontSize: '.56rem', fontWeight: isCurrent ? 800 : 600, color: done ? 'var(--txt)' : 'var(--muted2)', marginTop: 6 }}>{label}</span>
          </div>
        )
      })}
    </div>
  )
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
              const step = STATUS_STEP[d.status] ?? 0
              return (
                <Link
                  key={d.id}
                  href={`/app/cases/${d.id}`}
                  className="card-hover lift"
                  style={{
                    display: 'block', textDecoration: 'none', color: 'var(--txt)',
                    background: '#fff', border: '1px solid var(--line)', borderRadius: 14,
                    padding: '14px 15px 13px', marginBottom: 10,
                  }}
                >
                  {/* Line 1 — 誰を/どの企業を + channel chip (left), 報酬 (right, concise) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: '.9rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {customerHonorific(d)}
                      </b>
                      <span className={`chip ${d.channel === 'cooperation' ? 'chip-cooperation' : d.channel === 'referral' ? 'chip-referral' : 'chip-direct'}`} style={{ flexShrink: 0 }}>
                        {d.channel === 'referral' ? '紹介' : d.channel === 'cooperation' ? '協力' : '直販'}
                      </span>
                    </div>
                    {d.amount > 0 && (
                      <span className="tnum" style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.96rem', fontWeight: 800, color: d.status === 'paid' ? 'var(--green)' : 'var(--txt)', letterSpacing: '-.012em' }}>
                        ¥{d.amount.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* 段階ステッパー */}
                  <StatusStepper step={step} />
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
