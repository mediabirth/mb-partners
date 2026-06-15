'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useConsoleSession } from '@/components/ConsoleSession'

const NAV_STYLE = `
  .cnav-link { transition: color .18s, background .18s; }
  .cnav-link:hover:not(.cnav-active) { background: var(--bg2) !important; color: var(--txt) !important; }
  .cnav-active { background: var(--blue-bg2) !important; color: var(--blue) !important; font-weight: 700 !important; }
  .cnav-acct { transition: background .18s; }
  .cnav-acct:hover { background: var(--bg2) !important; }
`

const ITEMS = [
  { href: '/console',           id: 'dash',     label: 'ダッシュボード', icon: 'dash' },
  { href: '/console/deals',     id: 'deals',    label: '案件',           icon: 'list' },
  { href: '/console/partners',  id: 'partners', label: 'パートナー',     icon: 'users' },
  { href: '/console/services',  id: 'svcs',     label: 'サービス', icon: 'svcs' },
  { href: '/console/payouts',     id: 'payouts',     label: '支払管理',       icon: 'payouts' },
  { href: '/console/broadcasts', id: 'broadcasts', label: '配信',           icon: 'broadcasts' },
  { href: '/console/inquiries', id: 'inquiries',  label: '問い合わせ',     icon: 'inquiries' },
  { href: '/console/settings',  id: 'settings',   label: '設定',           icon: 'settings' },
]

function NavIcon({ id }: { id: string }) {
  switch (id) {
    case 'dash':
      return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
    case 'list':
      return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
    case 'users':
      return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
    case 'svcs':
      return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/></svg>
    case 'payouts':
      return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M6 14h4"/></svg>
    case 'broadcasts':
      return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
    case 'inquiries':
      return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    case 'settings':
      return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    default: return null
  }
}

export default function ConsoleNav(_props?: { profileName?: string; profileColor?: string }) {
  const path = usePathname()
  const active = (href: string) =>
    href === '/console' ? path === '/console' : path.startsWith(href)

  // Identity + badges come from the persistent console layout provider, resolved
  // once per session — no per-page re-fetch, so no account flash on navigation.
  const { identity, badges, ready } = useConsoleSession()
  const acctName  = identity?.name  ?? ''
  const acctColor = identity?.color ?? '#4733E6'
  const acctEmail = identity?.email ?? ''

  return (
    <>
    <style>{NAV_STYLE}</style>
    <aside style={{
      width: 230, background: '#fff', borderRight: '1px solid var(--line)',
      padding: '22px 14px', position: 'fixed', top: 0, bottom: 0,
      display: 'flex', flexDirection: 'column', gap: 2, zIndex: 40, overflowY: 'auto',
    }}>
      <Link href="/console" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px 18px', textDecoration: 'none' }}>
        <svg width="26" height="26" viewBox="0 0 48 48" fill="none">
          <rect x="6"  y="6"  width="14" height="14" rx="3"  stroke="#4733E6" strokeWidth="3"/>
          <rect x="28" y="6"  width="14" height="14" rx="7"  stroke="#4733E6" strokeWidth="3"/>
          <rect x="6"  y="28" width="14" height="14" rx="7"  stroke="#0E0E14" strokeWidth="3"/>
          <rect x="28" y="28" width="14" height="14" rx="3"  fill="#4733E6"/>
        </svg>
        <div>
          <b style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.98rem', color: 'var(--txt)' }}>
            MB <span style={{ color: 'var(--blue)' }}>Partners</span>
          </b>
          <small style={{ display: 'block', fontFamily: 'Inter', fontSize: '.46rem', letterSpacing: '.3em', color: 'var(--blue)', marginTop: 2, fontWeight: 700, textTransform: 'uppercase' }}>Console</small>
        </div>
      </Link>

      {ITEMS.map(item => (
        <Link key={item.href} href={item.href}
          className={`cnav-link${active(item.href) ? ' cnav-active' : ''}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 9,
            fontSize: '.77rem', fontWeight: active(item.href) ? 700 : 500,
            color: active(item.href) ? 'var(--blue)' : 'var(--muted2)',
            background: active(item.href) ? 'var(--blue-bg2)' : 'transparent',
            textDecoration: 'none', minHeight: 42,
          }}>
          <NavIcon id={item.icon} />
          {item.label}
          {item.id === 'partners' && badges.pendingPartners > 0 && (
            <span style={{
              marginLeft: 'auto', minWidth: 18, height: 18, borderRadius: 9,
              background: 'var(--blue)', color: '#fff', fontSize: '.56rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
              animation: 'pulseDot 2.8s ease-in-out infinite',
            }}>
              {badges.pendingPartners}
            </span>
          )}
          {item.id === 'inquiries' && badges.openInquiries > 0 && (
            <span style={{
              marginLeft: 'auto', minWidth: 18, height: 18, borderRadius: 9,
              background: 'var(--amber)', color: '#fff', fontSize: '.56rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
              animation: 'pulseDot 2.8s ease-in-out infinite',
            }}>
              {badges.openInquiries}
            </span>
          )}
        </Link>
      ))}

      <Link href="/console/settings" className="cnav-acct" style={{ marginTop: 'auto', textDecoration: 'none', borderRadius: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', fontSize: '.72rem', color: 'var(--muted2)', borderRadius: 9 }}>
          {!ready ? (
            <>
              <span className="skeleton" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="skeleton" style={{ display: 'block', width: '60%', height: 9, marginBottom: 5 }} />
                <span className="skeleton" style={{ display: 'block', width: '85%', height: 7 }} />
              </span>
            </>
          ) : (
            <>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: acctColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.66rem', fontWeight: 700, flexShrink: 0 }}>
                {acctName ? acctName[0] : ''}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: '.74rem', fontWeight: 700, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acctName || '—'}</span>
                {acctEmail && (
                  <span style={{ display: 'block', fontSize: '.6rem', color: 'var(--muted2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acctEmail}</span>
                )}
              </span>
            </>
          )}
        </div>
      </Link>
    </aside>
    </>
  )
}
