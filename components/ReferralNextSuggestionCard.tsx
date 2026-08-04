'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'

export default function ReferralNextSuggestionCard({
  contextKey,
  suggestion,
}: {
  contextKey: string
  suggestion: { id: string; title: string; reason: string; href: string; actionLabel: string }
}) {
  const storageKey = `connections_after_referral_${contextKey}_${suggestion.id}`
  const [dismissedNow, setDismissedNow] = useState(false)
  const hiddenOnDevice = useSyncExternalStore(
    listener => { window.addEventListener('storage', listener); return () => window.removeEventListener('storage', listener) },
    () => { try { return localStorage.getItem(storageKey) === '1' } catch { return false } },
    () => true,
  )

  function dismiss() {
    setDismissedNow(true)
    try { localStorage.setItem(storageKey, '1') } catch { /* 端末保存不可でも画面上は閉じる */ }
  }

  if (hiddenOnDevice || dismissedNow) return null

  return (
    <section aria-label="次の紹介候補" style={{ margin: '0 20px 16px', border: '1px solid var(--blue-bg)', borderRadius: 14, background: 'var(--blue-bg2)', padding: '13px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.62rem', fontWeight: 500, color: 'var(--c-blue)', marginBottom: 5 }}>次はこの方はいかがですか？</div>
          <div style={{ fontSize: '.78rem', fontWeight: 500, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{suggestion.title}</div>
          <p style={{ fontSize: '.62rem', color: 'var(--muted2)', lineHeight: 1.6, margin: '3px 0 8px' }}>{suggestion.reason}</p>
          <Link href={suggestion.href} prefetch={false} style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--c-blue)', textDecoration: 'none' }}>{suggestion.actionLabel} →</Link>
        </div>
        <button type="button" onClick={dismiss} aria-label="提案を閉じる" style={{ flexShrink: 0, width: 28, height: 28, border: 0, borderRadius: 8, background: 'transparent', color: 'var(--muted2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 16 }}>×</button>
      </div>
    </section>
  )
}
