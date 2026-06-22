'use client'
import { useState } from 'react'

// Feature E（E-3）：応募を「承認＝仲間化」する最小・隔離アクション（console owner用）。
// POST /api/console/applications/[id]/activate → activated_at マーク＋(紹介元があれば)賞賛通知を1件。
// ★お金/deals/status/frontier には一切触れない。冪等（サーバ側で一度だけ）。
export default function ActivateApplicationButton({ id, activated, hasReferrer }: { id: string; activated: boolean; hasReferrer: boolean }) {
  const [done, setDone] = useState(activated)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function activate() {
    if (busy || done) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/console/applications/${id}/activate`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j?.error || '失敗しました'); return }
      setDone(true)
    } catch {
      setErr('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>✓ 仲間化済{hasReferrer ? '（賞賛通知）' : ''}</span>
  }
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      <button onClick={activate} disabled={busy} style={{ fontSize: '.62rem', fontWeight: 800, color: '#fff', background: busy ? 'var(--muted2)' : 'var(--blue)', border: 'none', borderRadius: 7, padding: '5px 11px', cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
        {busy ? '処理中…' : '承認して仲間化'}
      </button>
      {err && <span style={{ fontSize: '.54rem', color: 'var(--red)' }}>{err}</span>}
    </span>
  )
}
