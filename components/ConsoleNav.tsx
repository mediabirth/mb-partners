'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useConsoleSession } from '@/components/ConsoleSession'
import Avatar from '@/components/ui/Avatar'

// G: レスポンシブ。<=900px ではサイドバーをドロワー化＋ハンバーガー。
// コンテンツ余白(inline margin-left:230)は aside[data-cnav]~* を !important で上書き。
const NAV_STYLE = `
  .cnav-link { transition: color .18s cubic-bezier(0.2,0,0,1), background .18s cubic-bezier(0.2,0,0,1); }
  .cnav-link:hover:not(.cnav-active) { background: var(--bg2) !important; color: var(--txt) !important; }
  .cnav-link:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--c-ring); }
  .cnav-active { background: var(--blue-bg2) !important; color: var(--c-blue) !important; font-weight: 700 !important; }
  .cnav-acct { transition: background .18s; }
  .cnav-acct:hover { background: var(--bg2) !important; }
  .cnav-burger { display: none; }
  .cnav-scrim { display: none; }
  @media (max-width: 1024px) {
    aside[data-cnav] { transform: translateX(-100%); transition: transform .26s cubic-bezier(.4,0,.2,1); box-shadow: 8px 0 40px rgba(14,14,20,.16); }
    aside[data-cnav].cnav-open { transform: translateX(0); }
    /* 主コンテンツ：レール分の margin を解除＋flex子が縮めるよう min-width:0＋横溢れは内部スクロールに閉じ込め page は溢れさせない */
    aside[data-cnav] ~ * { margin-left: 0 !important; min-width: 0 !important; max-width: 100vw !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
    .cnav-burger { display: flex !important; }
    .cnav-scrim.cnav-open { display: block; }
    /* 広いコンテンツは横スクロール（カンバン4列・広いテーブル） */
    .ckanban { grid-template-columns: repeat(4, 80vw) !important; overflow-x: auto; gap: 12px !important; padding-bottom: 8px; }
    .ctable-scroll { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
    .ctable-scroll > * { min-width: 680px; }
    /* モバイルで上部バーのタイトルがハンバーガーに被らないよう確保 */
    .console-topbar { padding-left: 60px !important; }
  }
`

const ITEMS = [
  { href: '/console',           id: 'dash',     label: 'ダッシュボード', icon: 'dash' },
  { href: '/console/deals',     id: 'deals',    label: '案件',           icon: 'list' },
  { href: '/console/growth',    id: 'growth',   label: '成長（紹介）',   icon: 'growth' },
  { href: '/console/partners',  id: 'partners', label: 'パートナー',     icon: 'users' },
  { href: '/console/applications', id: 'applications', label: 'パートナー応募', icon: 'apply' },
  { href: '/console/services',  id: 'svcs',     label: 'サービスマスタ', icon: 'svcs' },
  { href: '/console/payouts',     id: 'payouts',     label: '支払管理',       icon: 'payouts' },
  { href: '/console/broadcasts', id: 'broadcasts', label: '配信',           icon: 'broadcasts' },
  { href: '/console/inquiries', id: 'inquiries',  label: '問い合わせ',     icon: 'inquiries' },
  { href: '/console/messages',  id: 'messages',   label: 'メッセージ',     icon: 'inquiries' },
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
    case 'apply':
      return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
    case 'settings':
      return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    case 'growth':
      return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/></svg>
    default: return null
  }
}

export default function ConsoleNav(_props?: { profileName?: string; profileColor?: string }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  // 画面遷移でドロワーを閉じる
  useEffect(() => { setOpen(false) }, [path])
  const active = (href: string) =>
    href === '/console' ? path === '/console' : path.startsWith(href)

  // Identity + badges come from the persistent console layout provider, resolved
  // once per session — no per-page re-fetch, so no account flash on navigation.
  const { identity, badges, ready } = useConsoleSession()
  const acctName  = identity?.name  ?? ''
  const acctColor = identity?.color ?? '#4733E6'
  const acctAvatar = identity?.avatar_url ?? null
  const ROLE_JP: Record<string, string> = { owner: 'オーナー', manager: 'マネージャー', admin: '管理者', viewer: '閲覧者' }
  const acctRole  = identity?.role ? (ROLE_JP[identity.role] ?? identity.role) : ''

  return (
    <>
    <style>{NAV_STYLE}</style>
    {/* ハンバーガー（モバイルのみ） */}
    <button onClick={() => setOpen(true)} aria-label="メニュー" className="cnav-burger"
      style={{ position: 'fixed', top: 12, left: 12, zIndex: 60, width: 40, height: 40, borderRadius: 10, border: '1px solid var(--line)', background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(8px)', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--txt)' }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
    {/* スクリム */}
    <div onClick={() => setOpen(false)} className={`cnav-scrim${open ? ' cnav-open' : ''}`}
      style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', backdropFilter: 'blur(2px)', zIndex: 45 }} />
    <aside data-cnav className={open ? 'cnav-open' : ''} style={{
      width: 230, background: '#fff', borderRight: '1px solid var(--line)',
      padding: '22px 14px', position: 'fixed', top: 0, bottom: 0,
      display: 'flex', flexDirection: 'column', gap: 2, zIndex: 50, overflowY: 'auto',
    }}>
      <Link href="/console" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px 18px', textDecoration: 'none' }}>
        <svg width="26" height="26" viewBox="0 0 48 48" fill="none">
          <rect x="6"  y="6"  width="14" height="14" rx="3"  stroke="#4733E6" strokeWidth="3"/>
          <rect x="28" y="6"  width="14" height="14" rx="7"  stroke="#4733E6" strokeWidth="3"/>
          <rect x="6"  y="28" width="14" height="14" rx="7"  stroke="#0E0E14" strokeWidth="3"/>
          <rect x="28" y="28" width="14" height="14" rx="3"  fill="#4733E6"/>
        </svg>
        <div>
          <b className="cq-brand" style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.98rem', color: 'var(--txt)' }}>
            MB <span style={{ color: 'var(--c-blue)' }}>Partners</span>
          </b>
          <small className="cq-brand" style={{ display: 'block', fontFamily: 'Inter', fontSize: '.46rem', letterSpacing: '.3em', color: 'var(--c-blue)', marginTop: 2, fontWeight: 700, textTransform: 'uppercase' }}>Console</small>
        </div>
      </Link>

      {ITEMS.map(item => (
        <Link key={item.href} href={item.href}
          className={`cnav-link${active(item.href) ? ' cnav-active' : ''}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 9,
            fontSize: '.77rem', fontWeight: active(item.href) ? 700 : 500,
            color: active(item.href) ? 'var(--c-blue)' : 'var(--t-tertiary)',
            background: active(item.href) ? 'var(--blue-bg2)' : 'transparent',
            textDecoration: 'none', minHeight: 42,
          }}>
          <NavIcon id={item.icon} />
          {item.label}
          {item.id === 'partners' && badges.pendingPartners > 0 && (
            <span style={{
              marginLeft: 'auto', minWidth: 18, height: 18, borderRadius: 9,
              background: 'var(--c-blue)', color: '#fff', fontSize: '.56rem', fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
              animation: 'pulseDot 2.8s ease-in-out infinite',
            }}>
              {badges.pendingPartners}
            </span>
          )}
          {item.id === 'inquiries' && badges.openInquiries > 0 && (
            <span style={{
              marginLeft: 'auto', minWidth: 18, height: 18, borderRadius: 9,
              background: 'var(--amber)', color: '#fff', fontSize: '.56rem', fontWeight: 500,
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
              <span className="ui-skeleton" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="ui-skeleton" style={{ display: 'block', width: '60%', height: 9, marginBottom: 5 }} />
                <span className="ui-skeleton" style={{ display: 'block', width: '85%', height: 7 }} />
              </span>
            </>
          ) : (
            <>
              <Avatar name={acctName || '—'} color={acctColor} src={acctAvatar} size={30} />
              <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.25 }}>
                <span style={{ fontSize: '.74rem', fontWeight: 500, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acctName || '—'}</span>
                <span style={{ fontSize: '.6rem', color: 'var(--muted2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acctRole || 'メンバー'}</span>
              </span>
            </>
          )}
        </div>
      </Link>
    </aside>
    </>
  )
}
