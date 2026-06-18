import { redirect } from 'next/navigation'
import Link from 'next/link'
import ServiceAvatar from '@/components/ServiceAvatar'
import VendorStatusSteps from '@/components/VendorStatusSteps'
import { loadVendorBundle } from '@/lib/vendor-data'

export const runtime = 'edge'

const ST: Record<string, { label: string; c: string; bg: string }> = {
  received: { label: '受付', c: 'var(--amber)', bg: 'var(--amber-bg)' },
  in_progress: { label: '対応中', c: 'var(--blue)', bg: 'var(--blue-bg)' },
  confirmed: { label: '成約', c: 'var(--green)', bg: 'var(--green-bg)' },
  paid: { label: '完了', c: 'var(--muted2)', bg: 'var(--bg2)' },
  lost: { label: '見送り', c: 'var(--red)', bg: 'var(--red-bg)' },
}

export default async function VendorCases() {
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')

  return (
    <div className="page-anim">
      <div style={{ padding: '22px 20px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h2 className="ty-h2">担当案件</h2>
          <span style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>{b.assignments.length}件</span>
        </div>
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        {b.assignments.length === 0 ? (
          <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '20px 0' }}>担当している案件はまだありません。MB が案件を割り当てるとここに表示されます。</p>
        ) : b.assignments.map(a => {
          const st = ST[a.deal?.status ?? ''] ?? { label: a.deal?.status ?? '—', c: 'var(--muted2)', bg: 'var(--bg2)' }
          const svc = a.deal?.services
          return (
            <Link key={a.id} href={`/vendor/cases/${a.id}`} className="card-hover lift" style={{ display: 'block', textDecoration: 'none', color: 'var(--txt)', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 15px 13px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
                  {svc ? <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={30} /> : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="案件" size={30} />}
                  <b style={{ fontSize: '.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{a.deal?.customer_name ?? '案件'}</b>
                  <span style={{ flexShrink: 0, fontSize: '.58rem', fontWeight: 700, color: st.c, background: st.bg, borderRadius: 20, padding: '2px 9px' }}>{st.label}</span>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '.5rem', color: 'var(--muted2)', fontWeight: 700 }}>委託費</div>
                  <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.8rem', fontWeight: 700, color: 'var(--txt)', letterSpacing: '-.012em' }}>¥{a.base_fee.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 6 }}>{svc?.name ?? 'サービス'}</div>
              <VendorStatusSteps status={a.deal?.status ?? 'received'} />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
