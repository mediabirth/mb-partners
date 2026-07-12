'use client'
/**
 * サプライヤー・コンソールのシェル（2026-07-13）。MBコンソールと同じ成功文法：
 * PC(≥1024)=左固定サイドバー230px＋トップバー（会社名・MB Partnersワードマーク）／
 * SP=ハンバーガードロワー（44pxターゲット・375px溢れゼロ）。凝った演出より「迷わない」。
 * リファラル獲得が最優先事業＝「網（リファラル）」はナビ上位に固定。
 */
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/app', label: 'ホーム', exact: true, icon: <path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1z" /> },
  { href: '/app/s/network', label: '網（リファラル）', icon: <><circle cx="5" cy="12" r="2.4" /><circle cx="19" cy="5" r="2.4" /><circle cx="19" cy="19" r="2.4" /><path d="M7.2 11l9.4-5M7.2 13l9.4 5" /></> },
  { href: '/app/s/products', label: '商品', icon: <path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3.3 8.5L12 13l8.7-4.5M12 13v8" /> },
  { href: '/app/s/deals', label: '案件', icon: <path d="M4 6h16M4 12h16M4 18h10" /> },
  { href: '/app/s/money', label: 'お金', icon: <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /> },
  { href: '/app/s/settings', label: '設定', icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.55V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1-1.55 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.55-1H3a2 2 0 110-4h.09a1.7 1.7 0 001.55-1 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34h0a1.7 1.7 0 001-1.55V3a2 2 0 114 0v.09a1.7 1.7 0 001 1.55h0a1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87v0a1.7 1.7 0 001.55 1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.55 1z" /></> },
]

export default function SupplierShell({ companyName, children }: { companyName: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const [drawer, setDrawer] = useState(false)
  useEffect(() => { setDrawer(false) }, [pathname])
  const isActive = (n: { href: string; exact?: boolean }) => n.exact ? (pathname === n.href || pathname === n.href + '/') : (pathname ?? '').startsWith(n.href)

  const NavList = ({ onNav }: { onNav?: () => void }) => (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 10px' }}>
      {NAV.map(n => {
        const on = isActive(n)
        return (
          <a key={n.href} href={n.href} onClick={onNav}
            style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '0 12px', borderRadius: 9, textDecoration: 'none', fontSize: '.8rem', fontWeight: on ? 700 : 500, color: on ? 'var(--c-blue)' : 'var(--txt)', background: on ? 'var(--blue-bg2)' : 'transparent' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{n.icon}</svg>
            {n.label}
          </a>
        )
      })}
      <a href="/app/mypage" onClick={onNav} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '0 12px', borderRadius: 9, textDecoration: 'none', fontSize: '.76rem', color: 'var(--muted2)', marginTop: 10, borderTop: '0.5px solid var(--line)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></svg>
        マイページ
      </a>
    </nav>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg2)' }}>
      {/* トップバー: 会社名＋ワードマーク（両デバイス共通・SPはハンバーガー） */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(255,255,255,.94)', backdropFilter: 'blur(10px)', borderBottom: '0.5px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 52 }}>
        <button aria-label="メニュー" onClick={() => setDrawer(true)} className="sup-burger"
          style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt)', marginLeft: -10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <b style={{ fontSize: '.86rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{companyName}</b>
        <span style={{ marginLeft: 'auto', fontSize: '.62rem', fontWeight: 700, letterSpacing: '.14em', color: 'var(--muted2)' }}>MB Partners</span>
      </header>

      <div style={{ display: 'flex' }}>
        {/* PC: 左固定サイドバー230px（MBコンソール同文法） */}
        <aside className="sup-side" style={{ width: 230, flexShrink: 0, borderRight: '0.5px solid var(--line)', background: '#fff', position: 'sticky', top: 52, height: 'calc(100vh - 52px)', overflowY: 'auto' }}>
          <NavList />
        </aside>
        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>

      {/* SP: ドロワー */}
      {drawer && (
        <>
          <div onClick={() => setDrawer(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.34)', zIndex: 90 }} />
          <div className="drawer-in" style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 264, maxWidth: '82vw', background: '#fff', zIndex: 95, boxShadow: '8px 0 30px rgba(14,14,20,.18)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '0.5px solid var(--line)' }}>
              <b style={{ fontSize: '.84rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{companyName}</b>
              <button aria-label="閉じる" onClick={() => setDrawer(false)} style={{ width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted2)', marginRight: -12 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <NavList onNav={() => setDrawer(false)} />
          </div>
        </>
      )}

      <style>{`
        .sup-burger{display:flex}
        .sup-side{display:none}
        @media (min-width:1024px){ .sup-burger{display:none} .sup-side{display:block} }
        .drawer-in{animation:supDrawer .18s ease-out}
        @keyframes supDrawer{from{transform:translateX(-24px);opacity:.6}to{transform:none;opacity:1}}
      `}</style>
    </div>
  )
}
