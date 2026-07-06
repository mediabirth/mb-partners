'use client'
/**
 * L-B：partnerアプリの「LINEと連携」カード（app専用・additive）。
 * 連携状態の表示＋連携(/api/line/start へ遷移)＋解除。?line=linked/error のトースト。
 * これは通知用の LINE userId 取得のためのもの＝ログイン手段ではない。お金・既存認証には非接触。
 */
import { useEffect, useState } from 'react'

export default function LineLinkCard() {
  const [linked, setLinked] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetch('/api/line/status').then(r => r.json()).then(d => setLinked(!!d.linked)).catch(() => setLinked(false))
    try {
      const p = new URLSearchParams(window.location.search).get('line')
      if (p === 'success' || p === 'linked') setToast('LINEと連携しました')
      else if (p === 'error') setToast('連携に失敗しました。時間をおいて再度お試しください')
      if (p) window.history.replaceState({}, '', window.location.pathname)
    } catch { /* noop */ }
  }, [])

  async function unlink() {
    setBusy(true)
    try {
      const r = await fetch('/api/line/unlink', { method: 'POST' })
      if (r.ok) { setLinked(false); setToast('連携を解除しました') }
    } catch { /* noop */ } finally { setBusy(false) }
  }

  return (
    <div style={{ margin: '0 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '15px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: '#06C755', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.8rem', flexShrink: 0 }}>L</span>
        <b style={{ fontSize: '.84rem' }}>LINEと連携</b>
        {linked && <span style={{ marginLeft: 'auto', fontSize: '.6rem', fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', borderRadius: 4, padding: '3px 10px' }}>連携済み</span>}
      </div>
      <p style={{ fontSize: '.64rem', color: 'var(--muted2)', lineHeight: 1.6, margin: '0 0 12px' }}>
        連携すると、成約などの大事なお知らせを LINE でも受け取れます（通知用途のみ・ログインには使いません）。
      </p>
      {linked === null ? (
        <p style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>確認中…</p>
      ) : linked ? (
        <button onClick={unlink} disabled={busy} className="btn btn-g lift" style={{ width: '100%', minHeight: 44 }}>{busy ? '解除中…' : '連携を解除'}</button>
      ) : (
        <a href="/api/line/start" className="lift" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 44, background: '#06C755', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: '.85rem', textDecoration: 'none' }}>LINEと連携する</a>
      )}
      {toast && <p style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 10 }}>{toast}</p>}
    </div>
  )
}
