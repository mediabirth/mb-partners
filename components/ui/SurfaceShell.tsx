/**
 * BR-V3：app/vendor 共通のアプリシェル chrome（単一ソース）。
 * 430px センターカラム＋上部バー（ロゴ→ホーム・アバター→プロフィール・歯車→設定）＋下部ナビ。
 * 差分はルート/名前/色/ナビ config のみ＝レイアウト・寸法・配色は1実装（乖離不能）。純プレゼンテーション。
 */
import React from 'react'
import Link from 'next/link'
import BrandMark from '@/components/ui/BrandMark'

// レスポンシブ・プログラム: ≥1024px（PC）でのみ適用（<1024 は従来のスマホシェルと完全一致＝mediaで無影響）。
//   430pxの電話カラムを解いて、左レール(SurfaceNav)＋広い中央コンテンツへ。読み物は最大820px中央。
const SHELL_PC = `
@media (min-width: 1024px){
  .surf-col{ max-width: none !important; box-shadow: none !important; margin-left: 84px; }
  .surf-header{ background: rgba(255,255,255,.72) !important; padding-left: 40px !important; padding-right: 40px !important; }
  .surf-header .surf-brand{ font-size: 1.02rem !important; }
  .surf-main{ padding-bottom: 40px !important; }
  .surf-main > *{ max-width: 900px; margin-left: auto; margin-right: auto; }
}
@media (min-width: 1440px){
  .surf-main > *{ max-width: 1000px; }
}
`

export default function SurfaceShell({ homeHref, mypageHref, settingsHref, name, color, avatarUrl, nav, headerExtra, children }: {
  homeHref: string
  mypageHref: string
  settingsHref: string
  name: string | null
  color: string | null
  avatarUrl?: string | null // A6: 設定済みアバター画像。未指定/未設定は従来の人型シルエット。
  nav: React.ReactNode
  headerExtra?: React.ReactNode // surface固有の追加ヘッダー導線（app=SYNAPSE等）。未指定なら何も出ない（vendor不変）。
  children: React.ReactNode
}) {
  return (
    <div className="surf-bg mb-field-bg" style={{ minHeight: '100dvh', display: 'flex', justifyContent: 'center' }}>
      <style>{SHELL_PC}</style>
      <div className="surf-col mb-field-bg" style={{ width: '100%', maxWidth: 430, minHeight: '100dvh', display: 'flex', flexDirection: 'column', boxShadow: '0 0 48px rgba(14,14,20,.10)', position: 'relative' }}>
        {/* PWA: standalone の上端ノッチ帯を避ける。padding-top を safe-area と現状(12px)の大きい方に。 */}
        <header className="surf-header" style={{ background: 'rgba(255,255,255,.72)', backdropFilter: 'blur(16px) saturate(1.3)', WebkitBackdropFilter: 'blur(16px) saturate(1.3)', padding: 'max(12px, env(safe-area-inset-top)) 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid var(--line)' }}>
          <Link href={homeHref} aria-label="ホーム" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'inherit' }}>
            <BrandMark size={25} />
            <b className="surf-brand" style={{ fontFamily: 'var(--font-sans), Inter', fontWeight: 700, fontSize: '.95rem' }}>MB <span style={{ color: 'var(--c-blue)' }}>Partners</span></b>
          </Link>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {headerExtra}
            <Link href={mypageHref} aria-label={name ?? 'プロフィール'} style={{ textDecoration: 'none' }}>
              {/* A6: 設定済みアバター画像を表示（未設定は従来の人型シルエット・3面共通） */}
              <span style={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', background: 'var(--bg2)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12.4a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Zm0 1.7c-3.55 0-6.9 1.86-6.9 4.55V20a.75.75 0 0 0 .75.75h12.3A.75.75 0 0 0 18.9 20v-1.35c0-2.69-3.35-4.55-6.9-4.55Z" /></svg>
                {avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </span>
            </Link>
            {/* PWA: hit area を 44×44 に拡張（視覚は 40px の円のまま、外周 padding で確保）。 */}
            <Link href={settingsHref} aria-label="設定" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'var(--txt)' }}>
              <span style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
              </span>
            </Link>
          </div>
        </header>
        <main className="surf-main" style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(86px + env(safe-area-inset-bottom))' }}>{children}</main>
        {nav}
      </div>
    </div>
  )
}
