'use client'
/**
 * BR-V3：3サーフェス共通のボトムナビ chrome（単一ソース）。
 * app/vendor は同一の SurfaceNav を描画し、差分はルート・項目・FAB・未読バッジの config 注入のみ。
 * レイアウト・アニメ・寸法・配色は完全に1実装＝片方を変えると必ず両方変わる（乖離不能）。
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode, type CSSProperties } from 'react'

// href があれば Link 遷移、onClick のみならモーダル等を開くタブ（ルートを持たない導線）。
// app は全項目 href のみ＝この拡張の影響を受けない（後方互換・乖離不能性を維持）。
export type NavItem = { href?: string; label: string; icon: ReactNode; rootExact?: boolean; onClick?: () => void }

/** 中央 FAB（app=リンク／vendor=アクション）。円・グラデ・寸法は単一ソース。
 *  iconOnly＝ラベルテキストを出さずアイコンのみ（名称は aria-label で保持・タップ領域不変）。 */
export function NavFab({ href, onClick, label, children, iconOnly }: { href?: string; onClick?: () => void; label?: string; children: ReactNode; iconOnly?: boolean }) {
  const circle = <span className="snav-fab" style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#5240F2,#3D2BD0)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(71,51,230,.4)' }}>{children}</span>
  const inner = <>{circle}{label && !iconOnly && <span style={{ fontSize: '.52rem', color: 'var(--c-blue)', fontWeight: 700 }}>{label}</span>}</>
  const css: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', padding: '0 0 10px', background: 'none', border: 'none', cursor: 'pointer' }
  return href ? <Link href={href} style={css} aria-label={label}>{inner}</Link> : <button onClick={onClick} style={css} aria-label={label}>{inner}</button>
}

export default function SurfaceNav({ left, right, fab, unreadHref, iconOnly }: {
  left: NavItem[]
  right: NavItem[]
  fab: ReactNode
  unreadHref?: string   // セット時のみ /api/notifications/unread を取得しその項目にバッジ
  iconOnly?: boolean    // 純化(E): ラベルテキストを出さずアイコンのみ（aria-labelで名称保持・タップ領域不変）
}) {
  const path = usePathname()
  const [hasUnread, setHasUnread] = useState(false)
  useEffect(() => {
    if (!unreadHref) return
    fetch('/api/notifications/unread').then(r => r.json()).then(d => setHasUnread((d.count ?? 0) > 0)).catch(() => {})
  }, [path, unreadHref])
  // href の無い（onClick）項目はルートを持たないため非アクティブ扱い。
  const active = (it: NavItem) => it.href ? (it.rootExact ? path === it.href : path.startsWith(it.href)) : false

  const Item = (it: NavItem) => {
    const on = active(it)
    const inner = (
      <>
        {on && <span className="snav-active-bar" />}
        <span className="snav-item-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">{it.icon}</svg></span>
        {!iconOnly && it.label}
        {unreadHref === it.href && hasUnread && <span className="snav-bdg" />}
      </>
    )
    const cls = `snav-item${on ? ' is-active' : ''}`
    // 憲法§9：選択=--c-blue／非選択=--t-tertiary（見た目のみ。active判定/href は不変）。
    const css: CSSProperties = { color: on ? 'var(--c-blue)' : 'var(--t-tertiary)', fontWeight: on ? 700 : 400 }
    // href→Link 遷移 / onClick→button（モーダル等の既存導線）。寸法・タップ領域・safe-area は同一(.snav-item)。名称は aria-label で保持。
    return it.href
      ? <Link key={it.href} href={it.href} className={cls} style={css} aria-label={it.label}>{inner}</Link>
      : <button key={it.label} type="button" onClick={it.onClick} aria-label={it.label} className={cls} style={{ ...css, fontFamily: 'inherit', background: 'none', border: 'none', cursor: 'pointer' }}>{inner}</button>
  }

  return (
    <>
      <style>{`
        @keyframes pulseDot{0%,100%{opacity:1}50%{opacity:.45}}
        @keyframes navPop{0%{transform:scale(.82)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
        @keyframes navBarIn{from{opacity:0;width:0}to{opacity:1;width:28px}}
        .snav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 0 max(10px,env(safe-area-inset-bottom));text-decoration:none;font-family:inherit;font-size:.57rem;transition:color .16s cubic-bezier(0.2,0,0,1);position:relative;-webkit-tap-highlight-color:transparent}
        .snav-item:focus{outline:none}
        .snav-item:focus-visible{outline:none;box-shadow:inset 0 0 0 2px var(--c-ring);border-radius:10px}
        .snav-item:active{transform:scale(.88)}
        .snav-item-icon{transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
        .snav-item.is-active .snav-item-icon{animation:navPop .3s cubic-bezier(.34,1.56,.64,1) both}
        .snav-active-bar{position:absolute;top:0;left:50%;transform:translateX(-50%);width:28px;height:3px;background:var(--c-blue);border-radius:0 0 3px 3px;animation:navBarIn .22s ease both}
        .snav-bdg{position:absolute;top:6px;right:calc(50% - 16px);width:8px;height:8px;border-radius:50%;background:var(--c-blue);border:1.5px solid #fff;animation:pulseDot 2.6s ease-in-out infinite}
        .snav-fab{transition:box-shadow .22s,transform .2s cubic-bezier(.34,1.56,.64,1)}
        .snav-fab:active{transform:scale(.9)!important}
        .snav-fab:hover{box-shadow:0 12px 28px rgba(71,51,230,.5)!important}
      `}</style>
      <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(16px)', borderTop: '1px solid var(--line)', display: 'flex', zIndex: 60 }}>
        {left.map(Item)}
        <div style={{ flex: '0 0 74px', position: 'relative', top: -15, display: 'flex', justifyContent: 'center' }}>{fab}</div>
        {right.map(Item)}
      </nav>
    </>
  )
}
