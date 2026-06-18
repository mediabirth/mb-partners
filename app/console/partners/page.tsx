import type React from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPartnersWithProfiles, getAllDeals } from '@/lib/supabase/queries'
import ConsoleNav from '@/components/ConsoleNav'
import ApprovalPanel from './ApprovalPanel'
import DeliveryRow from './DeliveryRow'
import CountUp from '@/components/CountUp'
import StatusPill from '@/components/ui/StatusPill'
import Avatar from '@/components/ui/Avatar'
import { partnerStatus, partnerKind } from '@/lib/status'
import type { Tone } from '@/components/ui/StatusPill'

export const runtime = 'edge'

const INTERNAL_CODES = new Set(['ZZ8463', 'ZZ8354'])
type Kind = 'all' | 'referral' | 'frontier' | 'delivery'

// BR-C2：種別を横断した統一行（該当しない列は ー）。役職は StatusPill で識別。
type URow = {
  kind: 'referral' | 'frontier' | 'delivery'
  id: string; href?: string
  name: string; email: string; color: string | null; avatar_url: string | null
  code: string; tax: string; deals: number | null; activeDeals: number; reward: number | null; kyc: boolean
  statusPill: { tone: Tone; children: string }
}

export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')
  const { tab: tabParam } = await searchParams
  const filter: Kind = (['referral', 'frontier', 'delivery'] as const).includes(tabParam as Kind) ? tabParam as Kind : 'all'

  const [profileRes, partners, deals, deliveriesRes] = await Promise.all([
    supabase.from('profiles').select('name, role, color').eq('id', user.id).single(),
    getPartnersWithProfiles(supabase),
    getAllDeals(supabase),
    supabase.from('deliveries').select('id, name, kind, contact_email, active, auth_user_id'),
  ])
  const profile = profileRes.data
  if (profile?.role === 'partner' || !profile) redirect('/console')
  const deliveries = (deliveriesRes.data ?? []) as Array<{ id: string; name: string; kind: string | null; contact_email: string | null; active: boolean; auth_user_id: string | null }>
  const deliveryById = Object.fromEntries(deliveries.map(d => [d.id, d]))

  const dealCount = (pid: string) => deals.filter(d => d.partners?.id === pid).length
  const activeDealCount = (pid: string) => deals.filter(d => d.partners?.id === pid && ['received', 'in_progress'].includes(d.status)).length
  const partnerReward = (pid: string) => deals.filter(d => d.partners?.id === pid && ['paid', 'confirmed'].includes(d.status)).reduce((s, d) => s + (d.amount || 0), 0)

  type P = typeof partners[number] & { is_frontier?: boolean }
  const isRealPartner = (p: P) => !INTERNAL_CODES.has(p.code) && (p.profiles?.role ?? 'partner') === 'partner'
  const realPartners = partners.filter(isRealPartner) as P[]
  const pendingPartners = realPartners.filter(p => p.status === 'pending')
  const externalPartners = realPartners.filter(p => p.status !== 'pending').sort((a, b) => partnerReward(b.id) - partnerReward(a.id))
  const referralPartners = externalPartners.filter(p => !p.is_frontier)
  const frontierPartners = externalPartners.filter(p => p.is_frontier)

  const activeExternal = externalPartners.filter(p => p.status === 'active')
  const summaryReward = externalPartners.reduce((s, p) => s + partnerReward(p.id), 0)
  const summaryDeals = externalPartners.reduce((s, p) => s + dealCount(p.id), 0)

  // 統一行を構築（リファラル/フロンティア=partners・デリバリー=deliveries）。
  const partnerRow = (p: P): URow => ({
    kind: p.is_frontier ? 'frontier' : 'referral', id: p.id, href: `/console/partners/${p.id}`,
    name: p.profiles?.name ?? '—', email: p.profiles?.email ?? '', color: p.profiles?.color ?? null,
    avatar_url: (p.profiles as { avatar_url?: string | null } | null)?.avatar_url ?? null,
    code: p.code, tax: p.tax_type === 'individual' ? '個人' : '法人',
    deals: dealCount(p.id), activeDeals: activeDealCount(p.id), reward: partnerReward(p.id), kyc: !!p.kyc_verified_at,
    statusPill: partnerStatus(p.status),
  })
  const deliveryRow = (d: typeof deliveries[number]): URow => ({
    kind: 'delivery', id: d.id, href: undefined,
    name: d.name, email: d.contact_email ?? '', color: null, avatar_url: null,
    code: '—', tax: d.kind ?? '—', deals: null, activeDeals: 0, reward: null, kyc: false,
    statusPill: { tone: d.active ? 'success' : 'neutral', children: d.active ? '有効' : '無効' },
  })
  const allRows: URow[] = [...externalPartners.map(partnerRow), ...deliveries.map(deliveryRow)]
  const rows = filter === 'all' ? allRows : allRows.filter(r => r.kind === filter)

  const FILTERS: { id: Kind; label: string; count: number }[] = [
    { id: 'all', label: 'すべて', count: allRows.length },
    { id: 'referral', label: 'リファラル', count: referralPartners.length },
    { id: 'frontier', label: 'フロンティア', count: frontierPartners.length },
    { id: 'delivery', label: 'デリバリー', count: deliveries.length },
  ]

  const Table = ({ rows }: { rows: URow[] }) => rows.length === 0 ? (
    <p style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>該当するパートナーがいません。</p>
  ) : (
    <div className="ctable-scroll" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2.2fr .9fr .7fr .65fr .6fr 1fr .8fr', padding: '9px 20px', borderBottom: '1px solid var(--line)', background: 'var(--bg2)' }}>
        {['パートナー', '役職', 'コード', '税区分', '累計成約', '累計報酬(税込)', '状態'].map(h => <span key={h} style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</span>)}
      </div>
      {rows.map((r, i) => {
        if (r.kind === 'delivery') {
          const dd = deliveryById[r.id]
          return <DeliveryRow key={r.id} id={r.id} name={r.name} email={r.email} kind={r.tax} active={dd?.active ?? true} authed={!!dd?.auth_user_id} first={i === 0} />
        }
        const inner = (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <Avatar name={r.name || r.code} color={r.color} src={r.avatar_url} size={34} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.email || '—'}{r.kyc && <span style={{ marginLeft: 6, color: 'var(--green)', fontWeight: 600 }}>✓ KYC</span>}
                </div>
              </div>
            </div>
            <span><StatusPill size="sm" {...partnerKind(r.kind)} /></span>
            <span style={{ fontFamily: 'Inter', fontSize: '.7rem', color: 'var(--muted2)' }}>{r.code}</span>
            <span style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>{r.tax}</span>
            <div>
              {r.deals == null ? <span style={{ color: 'var(--muted)' }}>—</span> : <>
                <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.8rem' }}>{r.deals}</span>
                <span style={{ fontSize: '.6rem', color: 'var(--muted2)', marginLeft: 3 }}>件</span>
                {r.activeDeals > 0 && <span style={{ marginLeft: 5, fontSize: '.58rem', fontWeight: 700, color: 'var(--blue)' }}>/{r.activeDeals}進行</span>}
              </>}
            </div>
            <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '.86rem', fontFeatureSettings: '"tnum"', color: (r.reward ?? 0) > 0 ? 'var(--txt)' : 'var(--muted2)' }}>{r.reward == null ? '—' : `¥${r.reward.toLocaleString()}`}</span>
            <StatusPill {...r.statusPill} />
          </>
        )
        const css: React.CSSProperties = { display: 'grid', gridTemplateColumns: '2.2fr .9fr .7fr .65fr .6fr 1fr .8fr', padding: '14px 20px', borderTop: i > 0 ? '1px solid #F2F2F6' : undefined, alignItems: 'center', textDecoration: 'none', color: 'inherit' }
        return r.href
          ? <Link key={r.id} href={r.href} className="row-hover lift" style={css}>{inner}</Link>
          : <div key={r.id} style={css}>{inner}</div>
      })}
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName={profile?.name ?? '管理者'} profileColor={profile?.color ?? '#0E0E14'} />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>パートナー</h1>
            <Link href={`/console/partners/invite?kind=${filter === 'frontier' ? 'frontier' : filter === 'delivery' ? 'delivery' : 'partner'}`} className="btn btn-p" style={{ fontSize: '.72rem', padding: '7px 14px' }}>招待する</Link>
          </div>
          {/* BR-C2：種別タブ→統一リストのフィルタ（既定=すべて）。役職は行内 StatusPill で識別。 */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg2)', borderRadius: 9, padding: 3, width: 'fit-content' }}>
            {FILTERS.map(t => (
              <Link key={t.id} href={t.id === 'all' ? '/console/partners' : `/console/partners?tab=${t.id}`} style={{
                textDecoration: 'none', fontSize: '.74rem', fontWeight: 700, padding: '7px 15px', borderRadius: 7,
                color: filter === t.id ? 'var(--txt)' : 'var(--muted2)', background: filter === t.id ? '#fff' : 'transparent',
                boxShadow: filter === t.id ? '0 1px 4px rgba(14,14,20,.1)' : 'none',
              }}>{t.label}<span style={{ marginLeft: 5, color: 'var(--muted2)', fontWeight: 600 }}>{t.count}</span></Link>
            ))}
          </div>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 980 }}>
          {/* 承認待ち（種別問わず）は常時上部に */}
          {pendingPartners.length > 0 && <ApprovalPanel partners={pendingPartners} />}

          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: '稼働中パートナー', value: activeExternal.length, unit: '名', yen: false },
              { label: '累計成約件数', value: summaryDeals, unit: '件', yen: false },
              { label: '累計報酬総額', value: summaryReward, unit: '', yen: true },
            ].map(s => (
              <div key={s.label} className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</div>
                <div className="tnum" style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '1.2rem' }}>
                  <CountUp value={s.value} format={s.yen ? 'yen' : 'number'} /><span style={{ fontSize: '.72rem', fontWeight: 500, color: 'var(--muted2)', marginLeft: 2 }}>{s.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* BR-C3: デリバリーも統一行（DeliveryRow）。行を開くと固有操作（招待/有効化/削除）。操作ロジックは従来API不変。 */}
          <Table rows={rows} />
        </div>
      </div>
    </div>
  )
}
