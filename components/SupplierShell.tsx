'use client'
/**
 * サプライヤー・コンソール v2 シェル（2026-07-13・完全設計図§1）。
 * PC(≥1024)=左固定サイドバーのみ（トップバー廃止・MBコンソール同文法）。
 *   サイドバー最上部=MB Partnersワードマーク（インディゴ＝ブランドの家）＋直下に会社名（小・グレー）。
 * SP(<1024)=モバイルヘッダ（ハンバーガー）＋ドロワー。ドロワーは<1024専用＝PCでハンバーガー非表示。
 * ナビ: ホーム／紹介者／商品／案件／お金／設定＋最下部マイページ（v3: 会社=設定・個人=マイページの分掌）。
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import BrandMark from '@/components/ui/BrandMark'

const NAV = [
  { href: '/app', label: 'ホーム', exact: true, icon: <path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1z" /> },
  { href: '/app/s/network', label: '紹介者', icon: <><circle cx="5" cy="12" r="2.4" /><circle cx="19" cy="5" r="2.4" /><circle cx="19" cy="19" r="2.4" /><path d="M7.2 11l9.4-5M7.2 13l9.4 5" /></> },
  { href: '/app/s/products', label: '商品', icon: <path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3.3 8.5L12 13l8.7-4.5M12 13v8" /> },
  { href: '/app/s/deals', label: '案件', icon: <path d="M4 6h16M4 12h16M4 18h10" /> },
  { href: '/app/s/money', label: 'お金', icon: <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /> },
  { href: '/app/s/settings', label: '設定', icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.55V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1-1.55 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.55-1H3a2 2 0 110-4h.09a1.7 1.7 0 001.55-1 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34h0a1.7 1.7 0 001-1.55V3a2 2 0 114 0v.09a1.7 1.7 0 001 1.55h0a1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87v0a1.7 1.7 0 001.55 1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.55 1z" /></> },
]

function BrandHead({ onNav }: { onNav?: () => void }) {
  return (
    <Link prefetch href="/app" onClick={onNav} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 14px', textDecoration: 'none' }}>
      <BrandMark size={26} />
      <span>
        <b style={{ display: 'block', fontFamily: 'Inter', fontWeight: 700, fontSize: '.98rem', color: 'var(--txt)', lineHeight: 1.1 }}>
          MB <span style={{ color: 'var(--c-blue)' }}>Partners</span>
        </b>
        <small style={{ display: 'block', fontFamily: 'Inter', fontSize: 11, letterSpacing: '.3em', color: 'var(--muted2)', marginTop: 2, fontWeight: 700, textTransform: 'uppercase' }}>Supplier</small>
      </span>
    </Link>
  )
}

/** サイドバー最下部のアカウントチップ（タップでマイページ・v4） */
function AccountChip({ companyName, code, color, avatarUrl, onNav }: { companyName: string; code: string; color: string; avatarUrl: string | null; onNav?: () => void }) {
  return (
    <Link prefetch href="/app/mypage" onClick={onNav} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 10px 12px', padding: '9px 10px', borderRadius: 10, textDecoration: 'none', color: 'var(--txt)', background: 'var(--bg2)' }}>
      {avatarUrl
        ? <img src={avatarUrl} alt="" width={30} height={30} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        : <span style={{ width: 30, height: 30, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.76rem', fontWeight: 500, flexShrink: 0 }}>{companyName[0] ?? '−'}</span>}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '.72rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{companyName}</span>
        <span className="tnum" style={{ display: 'block', fontSize: '.56rem', color: 'var(--muted2)', fontFamily: 'Inter', letterSpacing: '.06em', marginTop: 1 }}>{code}</span>
      </span>
      <span style={{ color: 'var(--muted)', fontSize: '.8rem', flexShrink: 0 }}>›</span>
    </Link>
  )
}

export default function SupplierShell({ companyName, code, color, avatarUrl, children }: { companyName: string; code: string; color: string; avatarUrl: string | null; children: React.ReactNode }) {
  const pathname = usePathname()
  const [drawer, setDrawer] = useState(false)
  // サクサク: 遷移中のみ表示する細いインディゴのプログレスバー（静音・pathname確定で消灯）
  const [navving, setNavving] = useState(false)
  useEffect(() => { setDrawer(false); setNavving(false) }, [pathname])
  const isActive = (n: { href: string; exact?: boolean }) => n.exact ? (pathname === n.href || pathname === n.href + '/') : (pathname ?? '').startsWith(n.href)

  const startNav = () => setNavving(true)
  const NavList = ({ onNav }: { onNav?: () => void }) => (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 10px' }}>
      {NAV.map(n => {
        const on = isActive(n)
        return (
          <Link prefetch key={n.href} href={n.href} onClick={onNav}
            style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '0 12px', borderRadius: 9, textDecoration: 'none', fontSize: '.8rem', fontWeight: on ? 700 : 500, color: on ? 'var(--c-blue)' : 'var(--txt)', background: on ? 'var(--blue-bg2)' : 'transparent' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{n.icon}</svg>
            {n.label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg2)' }}>
      {navving && <div className="sup-progress" aria-hidden />}
      {/* SP専用ヘッダ（<1024）: ハンバーガー＋ワードマーク。PCはトップバー廃止（サイドバー＋コンテンツのみ） */}
      <header className="sup-mobilehead" style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(255,255,255,.94)', backdropFilter: 'blur(10px)', borderBottom: '0.5px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', height: 52 }}>
        <button aria-label="メニュー" onClick={() => setDrawer(true)}
          style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt)', marginLeft: -10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <Link prefetch href="/app" onClick={startNav} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <BrandMark size={19} />
          <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.82rem', color: 'var(--txt)' }}>MB <span style={{ color: 'var(--c-blue)' }}>Partners</span></span>
        </Link>
        <span style={{ marginLeft: 'auto', fontSize: '.64rem', color: 'var(--muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '46vw' }}>{companyName}</span>
      </header>

      <div style={{ display: 'flex' }}>
        {/* PC: 左固定サイドバー（最上部=ワードマーク＋会社名） */}
        <aside className="sup-side" style={{ width: 230, flexShrink: 0, borderRight: '0.5px solid var(--line)', background: 'linear-gradient(180deg,#fbfaff,#ffffff 26%)', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
          <BrandHead />
          <NavList onNav={startNav} />
          <div style={{ marginTop: 'auto' }}><AccountChip companyName={companyName} code={code} color={color} avatarUrl={avatarUrl} onNav={startNav} /></div>
        </aside>
        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>

      {/* ドロワー（<1024専用） */}
      {drawer && (
        <div className="sup-drawer-wrap">
          <div onClick={() => setDrawer(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.34)', zIndex: 90 }} />
          <div className="drawer-in" style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 264, maxWidth: '82vw', background: '#fff', zIndex: 95, boxShadow: '8px 0 30px rgba(14,14,20,.18)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1 }}><BrandHead /></div>
              <button aria-label="閉じる" onClick={() => setDrawer(false)} style={{ width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted2)', marginRight: 4 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <NavList onNav={() => { setDrawer(false); startNav() }} />
            <AccountChip companyName={companyName} code={code} color={color} avatarUrl={avatarUrl} onNav={() => { setDrawer(false); startNav() }} />
          </div>
        </div>
      )}

      <style>{`
        .sup-side{display:none}
        @media (min-width:1024px){
          .sup-mobilehead{display:none !important}
          .sup-side{display:flex;flex-direction:column}
          .sup-drawer-wrap{display:none}
        }
        .sup-progress{position:fixed;top:0;left:0;right:0;height:2px;z-index:200;background:linear-gradient(90deg,transparent,var(--c-blue) 30%,var(--c-blue) 70%,transparent);animation:supProg 1s ease-in-out infinite;background-size:200% 100%}
        @keyframes supProg{from{background-position:200% 0}to{background-position:-100% 0}}
        @media (prefers-reduced-motion:reduce){.sup-progress{animation:none;background:var(--c-blue)}}
        .drawer-in{animation:supDrawer .18s ease-out}
        @keyframes supDrawer{from{transform:translateX(-24px);opacity:.6}to{transform:none;opacity:1}}
      `}</style>
    </div>
  )
}
