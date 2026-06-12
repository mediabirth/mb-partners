'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AppNav() {
  const path = usePathname()
  const active = (href: string) =>
    href === '/app' ? path === '/app' : path.startsWith(href)

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430,
      background: 'rgba(255,255,255,.95)', backdropFilter: 'blur(14px)',
      borderTop: '1px solid var(--line)', display: 'flex', zIndex: 60,
    }}>
      <NavItem href="/app" active={active('/app')} label="ホーム">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1z"/>
        </svg>
      </NavItem>
      <NavItem href="/app/cases" active={active('/app/cases')} label="案件">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M4 6h16M4 12h16M4 18h10"/>
        </svg>
      </NavItem>

      {/* FAB */}
      <div style={{ flex: '0 0 74px', position: 'relative', top: -15, display: 'flex', justifyContent: 'center' }}>
        <Link href="/app/refer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', padding: '0 0 10px' }}>
          <span style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'linear-gradient(135deg,#5240F2,#3D2BD0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(71,51,230,.4)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </span>
        </Link>
      </div>

      <NavItem href="/app/rewards" active={active('/app/rewards')} label="報酬">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
        </svg>
      </NavItem>
      <NavItem href="/app/inbox" active={active('/app/inbox')} label="通知">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/>
        </svg>
      </NavItem>
    </nav>
  )
}

function NavItem({ href, active, label, children }: {
  href: string; active: boolean; label: string; children: React.ReactNode
}) {
  return (
    <Link href={href} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: '9px 0 max(10px, env(safe-area-inset-bottom))',
      textDecoration: 'none',
      color: active ? 'var(--blue)' : 'var(--muted)',
      fontFamily: 'inherit', fontSize: '.57rem', fontWeight: active ? 700 : 400,
    }}>
      {children}
      {label}
    </Link>
  )
}
