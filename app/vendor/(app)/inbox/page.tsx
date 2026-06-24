import { redirect } from 'next/navigation'
import Link from 'next/link'
import { loadVendorBundle, deriveVendorNotifs } from '@/lib/vendor-data'

export const runtime = 'edge'

function fmt(at: string) {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function Icon({ type }: { type: string }) {
  const map: Record<string, { bg: string; c: string; d: React.ReactNode }> = {
    ok: { bg: 'var(--green-bg)', c: 'var(--green)', d: <path d="M20 6L9 17l-5-5" /> },
    pay: { bg: 'var(--green-bg)', c: 'var(--green)', d: <><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 10h20" /></> },
    ng: { bg: 'var(--red-bg)', c: 'var(--red)', d: <><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></> },
    freeze: { bg: 'var(--blue-bg)', c: 'var(--c-blue)', d: <><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 10h20M6 15h4" /></> },
    assign: { bg: 'var(--blue-bg)', c: 'var(--c-blue)', d: <path d="M4 6h16M4 12h16M4 18h10" /> },
  }
  const m = map[type] ?? map.assign
  return <span style={{ width: 34, height: 34, borderRadius: '50%', background: m.bg, color: m.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{m.d}</svg></span>
}

export default async function VendorInbox() {
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')
  const notifs = deriveVendorNotifs(b)

  return (
    <div className="page-anim">
      <div style={{ padding: '22px 20px 10px' }}><h2 className="ty-h2">通知</h2></div>
      {notifs.length === 0 ? (
        <p style={{ padding: '40px 20px', fontSize: '.7rem', color: 'var(--muted2)', textAlign: 'center' }}>通知はありません</p>
      ) : notifs.map(n => (
        <Link key={n.id} href={n.href ?? '/vendor'} className="lift" style={{ display: 'flex', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--line)', textDecoration: 'none', color: 'var(--txt)', alignItems: 'center' }}>
          <Icon type={n.icon} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: '.78rem', display: 'block', marginBottom: 2 }}>{n.title}</b>
            <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.sub}</p>
          </div>
          <span style={{ fontSize: '.56rem', color: 'var(--muted)', flexShrink: 0 }}>{fmt(n.at)}</span>
        </Link>
      ))}
    </div>
  )
}
