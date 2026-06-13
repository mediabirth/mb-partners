'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/console',           id: 'dash',     label: 'ダッシュボード', icon: 'dash' },
  { href: '/console/deals',     id: 'deals',    label: '案件',           icon: 'list' },
  { href: '/console/partners',  id: 'partners', label: 'パートナー',     icon: 'users' },
  { href: '/console/services',  id: 'svcs',     label: 'サービス・報酬', icon: 'svcs' },
  { href: '/console/payouts',     id: 'payouts',     label: '支払管理',       icon: 'payouts' },
  { href: '/console/broadcasts', id: 'broadcasts', label: '配信',           icon: 'broadcasts' },
  { href: '/console/inquiries', id: 'inquiries',  label: '問い合わせ',     icon: 'inquiries' },
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
    default: return null
  }
}

export default function ConsoleNav({ profileName, profileColor }: { profileName: string; profileColor: string }) {
  const path = usePathname()
  const active = (href: string) =>
    href === '/console' ? path === '/console' : path.startsWith(href)

  return (
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
        <Link key={item.href} href={item.href} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px', borderRadius: 9,
          fontSize: '.77rem', fontWeight: active(item.href) ? 700 : 500,
          color: active(item.href) ? 'var(--blue)' : 'var(--muted2)',
          background: active(item.href) ? 'var(--blue-bg2)' : 'transparent',
          textDecoration: 'none', minHeight: 42, transition: 'color .18s, background .18s',
        }}>
          <NavIcon id={item.id} />
          {item.label}
        </Link>
      ))}

      <div style={{ marginTop: 'auto', paddingTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontSize: '.72rem', color: 'var(--muted2)' }}>
          <span style={{ width: 24, height: 24, borderRadius: '50%', background: profileColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.6rem', fontWeight: 700, flexShrink: 0 }}>
            {profileName[0]}
          </span>
          <span>{profileName}</span>
        </div>
      </div>
    </aside>
  )
}
