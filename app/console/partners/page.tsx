import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPartnersWithProfiles, getAllDeals } from '@/lib/supabase/queries'
import ConsoleNav from '@/components/ConsoleNav'

function statusLabel(s: string) {
  const map: Record<string, string> = { active: '稼働中', pending: '審査中', suspended: '停止' }
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, color')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/console')

  const [partners, deals] = await Promise.all([
    getPartnersWithProfiles(supabase),
    getAllDeals(supabase),
  ])

  // Compute per-partner deal counts
  const dealCount = (partnerId: string) => deals.filter(d => d.partners?.id === partnerId).length
  const activeDealCount = (partnerId: string) =>
    deals.filter(d => d.partners?.id === partnerId && ['received', 'in_progress'].includes(d.status)).length

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName={profile?.name ?? '管理者'} profileColor={profile?.color ?? '#0E0E14'} />

      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* Top bar */}
        <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>パートナー一覧</h1>
          <span style={{ fontSize: '.72rem', color: 'var(--muted2)' }}>{partners.length}名</span>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 860 }}>
          {partners.length === 0 && (
            <p style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>パートナーがいません</p>
          )}

          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
            {partners.map((p, i) => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14, padding: '14px 20px', borderTop: i > 0 ? '1px solid #F2F2F6' : undefined, alignItems: 'center' }}>
                {/* Avatar */}
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: p.profiles?.color ?? '#B9BAC4', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 700, flexShrink: 0 }}>
                  {(p.profiles?.name ?? p.code)[0]}
                </div>

                {/* Info */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: '.82rem' }}>{p.profiles?.name ?? '—'}</b>
                    <span style={{ fontFamily: 'Inter', fontSize: '.62rem', color: 'var(--muted2)' }}>{p.code}</span>
                    <span style={{ fontSize: '.6rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: statusBg(p.status), color: statusColor(p.status) }}>
                      {statusLabel(p.status)}
                    </span>
                  </div>
                  <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 3 }}>
                    {p.profiles?.email}
                    {p.kyc_verified_at && (
                      <span style={{ marginLeft: 8, color: '#15917E', fontWeight: 600 }}>✓ KYC</span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 800, fontFamily: 'Inter' }}>{dealCount(p.id)}</div>
                  <div style={{ fontSize: '.58rem', color: 'var(--muted2)' }}>
                    累計 · 進行中 <b style={{ color: activeDealCount(p.id) > 0 ? 'var(--blue)' : undefined }}>{activeDealCount(p.id)}</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
