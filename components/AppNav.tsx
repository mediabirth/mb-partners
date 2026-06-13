'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function AppNav() {
  const path = usePathname()
  const active = (href: string) =>
    href === '/app' ? path === '/app' : path.startsWith(href)

  const [hasUnread, setHasUnread] = useState(false)

  useEffect(() => {
    fetch('/api/notifications/unread')
      .then(r => r.json())
      .then(d => setHasUnread((d.count ?? 0) > 0))
      .catch(() => {})
  }, [path])

  return (
    <>
      <style>{`
        @keyframes pulseDot{0%,100%{opacity:1}50%{opacity:.45}}
        @keyframes navPop{0%{transform:scale(.82)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
        .nav-bdg{position:absolute;top:6px;right:calc(50% - 16px);width:8px;height:8px;border-radius:50%;background:var(--blue);border:1.5px solid #fff;animation:pulseDot 2.6s ease-in-out infinite}
        .nav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 0 max(10px,env(safe-area-inset-bottom));text-decoration:none;font-family:inherit;font-size:.57rem;transition:color .16s;position:relative;-webkit-tap-highlight-color:transparent}
        .nav-item:active{transform:scale(.88)}
        .nav-item-icon{transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
        .nav-item.is-active .nav-item-icon{animation:navPop .3s cubic-bezier(.34,1.56,.64,1) both}
        .nav-active-bar{position:absolute;top:0;left:50%;transform:translateX(-50%);width:28px;height:3px;background:var(--blue);border-radius:0 0 3px 3px;animation:navBarIn .22s ease both}
        @keyframes navBarIn{from{opacity:0;width:0}to{opacity:1;width:28px}}
        .fab-btn{transition:box-shadow .22s,transform .2s cubic-bezier(.34,1.56,.64,1)}
        .fab-btn:active{transform:scale(.9)!important}
        .fab-btn:hover{box-shadow:0 12px 28px rgba(71,51,230,.5)!important}
      `}</style>
      <nav style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430,
        background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(16px)',
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
            <span className="fab-btn" style={{
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

        {/* Inbox with unread badge */}
        <Link href="/app/inbox" className={`nav-item${active('/app/inbox') ? ' is-active' : ''}`}
          style={{ color: active('/app/inbox') ? 'var(--blue)' : 'var(--muted)', fontWeight: active('/app/inbox') ? 700 : 400 }}>
          {active('/app/inbox') && <span className="nav-active-bar" />}
          <span className="nav-item-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/>
            </svg>
          </span>
          通知
          {hasUnread && <span className="nav-bdg"/>}
        </Link>
      </nav>
    </>
  )
}

function NavItem({ href, active, label, children }: {
  href: string; active: boolean; label: string; children: React.ReactNode
}) {
  return (
    <Link href={href} className={`nav-item${active ? ' is-active' : ''}`}
      style={{ color: active ? 'var(--blue)' : 'var(--muted)', fontWeight: active ? 700 : 400 }}>
      {active && <span className="nav-active-bar" />}
      <span className="nav-item-icon">{children}</span>
      {label}
    </Link>
  )
}
