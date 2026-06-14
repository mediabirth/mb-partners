import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPartnersWithProfiles, getAllDeals } from '@/lib/supabase/queries'
import ConsoleNav from '@/components/ConsoleNav'
import ApprovalPanel from './ApprovalPanel'
import CountUp from '@/components/CountUp'

export const runtime = 'edge'

const INTERNAL_CODES = new Set(['ZZ8463', 'ZZ8354'])

function statusLabel(s: string) {
  const map: Record<string, string> = { active: '稼働中', pending: '招待済・未稼働', suspended: '停止' }
  return map[s] ?? s
}
function statusColor(s: string) {
  const map: Record<string, string> = { active: '#15917E', pending: '#D98914', suspended: '#C2479E' }
  return map[s] ?? 'var(--muted2)'
}
function statusBg(s: string) {
  const map: Record<string, string> = { active: '#E5F3F1', pending: '#FBF1DF', suspended: '#F9EAF4' }
  return map[s] ?? '#F4F4F7'
}

export default async function PartnersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const [profileRes, partners, deals] = await Promise.all([
    supabase.from('profiles').select('name, role, color').eq('id', user.id).single(),
    getPartnersWithProfiles(supabase),
    getAllDeals(supabase),
  ])
  const profile = profileRes.data
  if (profile?.role === 'partner' || !profile) redirect('/console')

  const dealCount    = (pid: string) => deals.filter(d => d.partners?.id === pid).length
  const activeDealCount = (pid: string) =>
    deals.filter(d => d.partners?.id === pid && ['received', 'in_progress'].includes(d.status)).length
  const partnerReward = (pid: string) =>
    deals
      .filter(d => d.partners?.id === pid && ['paid', 'confirmed'].includes(d.status))
      .reduce((s, d) => s + (d.amount || 0), 0)

  const pendingPartners  = partners.filter(p => p.status === 'pending')
  const nonPending       = partners.filter(p => p.status !== 'pending')
  const externalPartners = nonPending
    .filter(p => !INTERNAL_CODES.has(p.code))
    .sort((a, b) => partnerReward(b.id) - partnerReward(a.id))
  const internalPartners = nonPending.filter(p => INTERNAL_CODES.has(p.code))

  // KPI summary (external non-pending only)
  const activeExternal = externalPartners.filter(p => p.status === 'active')
  const summaryReward  = externalPartners.reduce((s, p) => s + partnerReward(p.id), 0)
  const summaryDeals   = externalPartners.reduce((s, p) => s + dealCount(p.id), 0)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName={profile?.name ?? '管理者'} profileColor={profile?.color ?? '#0E0E14'} />

      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* Top bar */}
        <div style={{
          background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--line)', padding: '13px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 30,
        }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>パートナー</h1>
          <Link href="/console/partners/invite" className="btn btn-p" style={{ fontSize: '.72rem', padding: '7px 14px' }}>
            + 招待を発行
          </Link>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 960 }}>

          {/* Approval panel */}
          {pendingPartners.length > 0 && <ApprovalPanel partners={pendingPartners} />}

          {/* Summary strip */}
          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: '稼働中パートナー', value: activeExternal.length, unit: '名', yen: false },
              { label: '累計成約件数',     value: summaryDeals,           unit: '件', yen: false },
              { label: '累計報酬総額',     value: summaryReward,          unit: '',   yen: true },
            ].map(s => (
              <div key={s.label} className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</div>
                <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.2rem' }}>
                  <CountUp value={s.value} format={s.yen ? 'yen' : 'number'} /><span style={{ fontSize: '.72rem', fontWeight: 500, color: 'var(--muted2)', marginLeft: 2 }}>{s.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Partners table */}
          {(externalPartners.length > 0 || internalPartners.length > 0) ? (
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
              {/* Table header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '2.2fr .8fr .7fr .65fr 1.1fr .85fr',
                padding: '9px 20px', borderBottom: '1px solid var(--line)', background: 'var(--bg2)',
              }}>
                {['パートナー', 'コード', '税区分', '累計成約', '累計報酬(税込)', '状態'].map(h => (
                  <span key={h} style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</span>
                ))}
              </div>

              {/* External partners */}
              {externalPartners.map((p, i) => {
                const reward = partnerReward(p.id)
                return (
                  <Link
                    key={p.id}
                    href={`/console/partners/${p.id}`}
                    className="row-hover lift"
                    style={{
                      display: 'grid', gridTemplateColumns: '2.2fr .8fr .7fr .65fr 1.1fr .85fr',
                      padding: '14px 20px', borderTop: i > 0 ? '1px solid #F2F2F6' : undefined,
                      alignItems: 'center', textDecoration: 'none', color: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                        background: p.profiles?.color ?? '#B9BAC4',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '.68rem', fontWeight: 700,
                      }}>
                        {(p.profiles?.name ?? p.code)[0]}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.profiles?.name ?? '—'}
                        </div>
                        <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.profiles?.email}
                          {p.kyc_verified_at && <span style={{ marginLeft: 6, color: '#15917E', fontWeight: 600 }}>✓ KYC</span>}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontFamily: 'Inter', fontSize: '.7rem', color: 'var(--muted2)' }}>{p.code}</span>
                    <span>
                      <span className="chip chip-direct">{p.tax_type === 'individual' ? '個人' : '法人'}</span>
                    </span>
                    <div>
                      <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.8rem' }}>{dealCount(p.id)}</span>
                      <span style={{ fontSize: '.6rem', color: 'var(--muted2)', marginLeft: 3 }}>件</span>
                      {activeDealCount(p.id) > 0 && (
                        <span style={{ marginLeft: 5, fontSize: '.58rem', fontWeight: 700, color: 'var(--blue)' }}>
                          /{activeDealCount(p.id)}進行
                        </span>
                      )}
                    </div>
                    <span style={{
                      fontFamily: 'Inter', fontWeight: 800, fontSize: '.86rem',
                      fontFeatureSettings: '"tnum"', color: reward > 0 ? 'var(--txt)' : 'var(--muted2)',
                    }}>
                      ¥{reward.toLocaleString()}
                    </span>
                    <span style={{
                      display: 'inline-block', fontSize: '.6rem', fontWeight: 700,
                      padding: '3px 8px', borderRadius: 20,
                      background: statusBg(p.status), color: statusColor(p.status),
                    }}>
                      {statusLabel(p.status)}
                    </span>
                  </Link>
                )
              })}

              {/* Internal partners */}
              {internalPartners.length > 0 && (
                <>
                  <div style={{ padding: '6px 20px', background: '#F8F8FC', borderTop: '1px solid var(--line)' }}>
                    <span style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--muted2)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
                      内部アカウント（KPI除外）
                    </span>
                  </div>
                  {internalPartners.map(p => (
                    <Link
                      key={p.id}
                      href={`/console/partners/${p.id}`}
                      className="row-hover lift"
                      style={{
                        display: 'grid', gridTemplateColumns: '2.2fr .8fr .7fr .65fr 1.1fr .85fr',
                        padding: '12px 20px', borderTop: '1px solid #F2F2F6',
                        alignItems: 'center', textDecoration: 'none', color: 'inherit', opacity: 0.65,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                          background: p.profiles?.color ?? '#B9BAC4',
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '.65rem', fontWeight: 700,
                        }}>
                          {(p.profiles?.name ?? p.code)[0]}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontWeight: 700, fontSize: '.78rem' }}>{p.profiles?.name ?? '—'}</span>
                            <span style={{ fontSize: '.54rem', fontWeight: 700, padding: '1px 5px', borderRadius: 8, background: '#EBEBF0', color: 'var(--muted2)' }}>内部</span>
                          </div>
                          <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1 }}>{p.profiles?.email}</div>
                        </div>
                      </div>
                      <span style={{ fontFamily: 'Inter', fontSize: '.7rem', color: 'var(--muted2)' }}>{p.code}</span>
                      <span>
                        <span className="chip chip-direct">{p.tax_type === 'individual' ? '個人' : '法人'}</span>
                      </span>
                      <div>
                        <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.8rem' }}>{dealCount(p.id)}</span>
                        <span style={{ fontSize: '.6rem', color: 'var(--muted2)', marginLeft: 3 }}>件</span>
                      </div>
                      <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '.86rem', fontFeatureSettings: '"tnum"' }}>
                        ¥{partnerReward(p.id).toLocaleString()}
                      </span>
                      <span style={{ fontSize: '.6rem', fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#EBEBF0', color: 'var(--muted2)' }}>
                        内部
                      </span>
                    </Link>
                  ))}
                </>
              )}
            </div>
          ) : pendingPartners.length === 0 && (
            <p style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>パートナーがいません</p>
          )}

        </div>
      </div>
    </div>
  )
}
