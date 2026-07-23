import { redirect } from 'next/navigation'
import Link from 'next/link'
import ServiceAvatar from '@/components/ServiceAvatar'
import { loadVendorBundle } from '@/lib/vendor-data'
import { VENDOR_DEAL_ST, VENDOR_OFFER_ST } from '@/lib/vendor-status'
import { customerHonorific } from '@/lib/customer'
import EmptyState from '@/components/ui/EmptyState'

export const runtime = 'edge'

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
          <EmptyState
            title="担当案件はまだありません"
            hint="案件が割り当てられると、ここに表示されます"
            icon={<span style={{ display: 'inline-flex', width: 52, height: 52, borderRadius: 15, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', alignItems: 'center', justifyContent: 'center' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-blue)" strokeWidth="1.6"><path d="M4 6h16M4 12h16M4 18h10" /></svg></span>}
            style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14 }}
          />
        ) : b.assignments.map(a => {
          // 提示中/辞退は割当自身の状態を優先（承諾前は案件状態語を出さない）
          const st = (a.status === 'proposed' || a.status === 'declined' ? VENDOR_OFFER_ST[a.status] : null)
            ?? VENDOR_DEAL_ST[a.deal?.status ?? ''] ?? { label: a.deal?.status ?? '—', c: 'var(--muted2)', bg: 'var(--bg2)' }
          const svc = a.deal?.services
          return (
            <Link key={a.id} href={`/vendor/cases/${a.id}`} className="card-hover lift ui-card" style={{ display: 'block', textDecoration: 'none', color: 'var(--txt)', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '14px 15px 13px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
                  {svc ? <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={30} /> : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="案件" size={30} />}
                  <b style={{ fontSize: '.82rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{(a.deal && customerHonorific(a.deal)) || '案件'}</b>
                  {/* 状態＝ベンダー語・6pxドット+テキスト（塗りピル廃止） */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.c, display: 'inline-block' }} />
                    <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>{st.label}</span>
                  </span>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '.5rem', color: 'var(--muted2)', fontWeight: 500 }}>委託費</div>
                  <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.8rem', fontWeight: 500, color: 'var(--txt)', letterSpacing: '-.012em' }}>¥{a.base_fee.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 6 }}>{svc?.name ?? 'サービス'}</div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
