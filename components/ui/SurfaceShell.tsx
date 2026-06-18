/**
 * BR-V3：app/vendor 共通のアプリシェル chrome（単一ソース）。
 * 430px センターカラム＋上部バー（ロゴ→ホーム・アバター→プロフィール・歯車→設定）＋下部ナビ。
 * 差分はルート/名前/色/ナビ config のみ＝レイアウト・寸法・配色は1実装（乖離不能）。純プレゼンテーション。
 */
import React from 'react'
import Link from 'next/link'

export default function SurfaceShell({ homeHref, mypageHref, settingsHref, name, color, nav, children }: {
  homeHref: string
  mypageHref: string
  settingsHref: string
  name: string | null
  color: string | null
  nav: React.ReactNode
  children: React.ReactNode
}) {
  const initial = (name ?? '').trim().charAt(0) || 'M'
  return (
    <div style={{ background: '#E9E9ED', minHeight: '100dvh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 430, background: '#fff', minHeight: '100dvh', display: 'flex', flexDirection: 'column', boxShadow: '0 0 48px rgba(14,14,20,.12)', position: 'relative' }}>
        <header style={{ background: 'rgba(255,255,255,.94)', backdropFilter: 'blur(12px)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid var(--line)' }}>
          <Link href={homeHref} aria-label="ホーム" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'inherit' }}>
            <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
              <rect x="6" y="6" width="14" height="14" rx="3" stroke="#4733E6" strokeWidth="3" />
              <rect x="28" y="6" width="14" height="14" rx="7" stroke="#4733E6" strokeWidth="3" />
              <rect x="6" y="28" width="14" height="14" rx="7" stroke="#0E0E14" strokeWidth="3" />
              <rect x="28" y="28" width="14" height="14" rx="3" fill="#4733E6" />
            </svg>
            <b style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.95rem' }}>MB <span style={{ color: 'var(--blue)' }}>Partners</span></b>
          </Link>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link href={mypageHref} aria-label={name ?? 'プロフィール'} style={{ textDecoration: 'none' }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', background: color ?? 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.86rem', fontWeight: 700, flexShrink: 0 }}>{initial}</span>
            </Link>
            <Link href={settingsHref} aria-label="設定" style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'var(--txt)', background: 'var(--bg)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
            </Link>
          </div>
        </header>
        <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(86px + env(safe-area-inset-bottom))' }}>{children}</main>
        {nav}
      </div>
    </div>
  )
}
