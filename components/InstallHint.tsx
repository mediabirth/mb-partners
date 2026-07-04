'use client'
import { useEffect, useState } from 'react'

// ④ 控えめなインストール誘導。Android=beforeinstallprompt、iOS=手順テキスト。
// 既にインストール済(standalone)／一度閉じた場合は出さない。
const DISMISS_KEY = 'mbp-install-hint-dismissed'

export default function InstallHint() {
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [deferred, setDeferred] = useState<any>(null)

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return
    } catch { /* ignore */ }
    // 既にスタンドアロン起動なら出さない
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
    if (standalone) return

    const ua = navigator.userAgent || ''
    const ios = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua) // iOS Safari
    setIsIOS(ios)

    if (ios) {
      // iOS は beforeinstallprompt 非対応 → 少し待って手順を表示
      const t = setTimeout(() => setShow(true), 2500)
      return () => clearTimeout(t)
    }

    // Android/Chrome 等: インストール可能になったら表示
    const onBIP = (e: Event) => { e.preventDefault(); setDeferred(e); setShow(true) }
    window.addEventListener('beforeinstallprompt', onBIP)
    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [])

  function dismiss() {
    setShow(false)
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
  }
  async function install() {
    if (!deferred) return
    deferred.prompt()
    try { await deferred.userChoice } catch { /* ignore */ }
    setDeferred(null)
    dismiss()
  }

  if (!show) return null

  return (
    <div role="dialog" aria-label="ホーム画面に追加" style={{
      position: 'fixed', left: 12, right: 12,
      bottom: `calc(12px + env(safe-area-inset-bottom))`,
      zIndex: 200, maxWidth: 460, margin: '0 auto',
      background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14,
      boxShadow: '0 8px 30px rgba(14,14,20,.14)', padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" width={36} height={36} style={{ borderRadius: 9, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '.76rem', fontWeight: 500 }}>ホーム画面に追加</div>
        <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 1, lineHeight: 1.5 }}>
          {isIOS
            ? '共有ボタン → 「ホーム画面に追加」でアプリのように使えます。'
            : 'アプリのように全画面で使えます。'}
        </div>
      </div>
      {!isIOS && deferred && (
        <button onClick={install} className="ui-btn ui-btn--primary" style={{ fontSize: '.72rem', padding: '8px 14px', flexShrink: 0 }}>追加</button>
      )}
      <button onClick={dismiss} aria-label="閉じる" style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: 8, border: 'none',
        background: 'var(--bg2)', color: 'var(--muted2)', fontSize: '.9rem', cursor: 'pointer',
      }}>✕</button>
    </div>
  )
}
