'use client'
import { useEffect, useState } from 'react'

export default function EmailNotificationToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/app/notification-prefs', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setEnabled(data.email_enabled !== false))
      .catch(() => setError('確認できませんでした'))
  }, [])

  async function toggle() {
    if (enabled === null || pending) return
    setPending(true)
    setError('')
    const next = !enabled
    try {
      const response = await fetch('/api/app/notification-prefs', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email_enabled: next }),
      })
      if (!response.ok) throw new Error('save failed')
      setEnabled(next)
    } catch {
      setError('保存できませんでした')
    } finally {
      setPending(false)
    }
  }

  if (enabled === null) return <span aria-live="polite" style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>{error || '確認中…'}</span>
  return (
    <div style={{ textAlign: 'right' }}>
      <button
        type="button" role="switch" aria-checked={enabled} aria-label="メール通知"
        onClick={toggle} disabled={pending}
        style={{ width: 48, height: 28, padding: 3, border: 0, borderRadius: 20, cursor: pending ? 'wait' : 'pointer', background: enabled ? 'var(--c-blue)' : 'var(--line)', opacity: pending ? .65 : 1 }}
      >
        <span style={{ display: 'block', width: 22, height: 22, borderRadius: '50%', background: '#fff', transform: `translateX(${enabled ? 20 : 0}px)`, transition: 'transform .16s ease' }} />
      </button>
      {error && <div aria-live="polite" style={{ fontSize: '.56rem', color: 'var(--red)', marginTop: 3 }}>{error}</div>}
    </div>
  )
}
