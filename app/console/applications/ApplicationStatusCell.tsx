'use client'
import { useState } from 'react'

/**
 * パートナー応募のステータス制ワークフロー（console owner/manager）。
 * applied(応募受付/面談予約待ち) → interview_booked(面談予約済み) → approved(承認＝招待発行) / rejected(見送り)。
 * 承認 = /approve（招待発行＝リファラルへ迎え入れ）／見送り = /reject。★money非接触。
 */
type Status = 'applied' | 'interview_booked' | 'approved' | 'rejected'

const BADGE: Record<Status, { label: string; bg: string; fg: string }> = {
  applied:          { label: '面談予約待ち', bg: 'rgba(242,151,27,.12)', fg: '#b26a09' },
  interview_booked: { label: '面談予約済み', bg: 'rgba(86,70,230,.10)',  fg: '#4733e6' },
  approved:         { label: '承認済み・招待送信', bg: 'rgba(21,145,126,.12)', fg: '#0f9d76' },
  rejected:         { label: '見送り', bg: 'var(--bg2)', fg: 'var(--muted2)' },
}

const fmtJst = (iso: string) => {
  try { return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) }
  catch { return iso }
}

export default function ApplicationStatusCell({ id, status: initial, interviewAt, interviewMeetUrl, hasReferrer }: {
  id: string
  status: string
  interviewAt: string | null
  interviewMeetUrl: string | null
  hasReferrer: boolean
}) {
  const [status, setStatus] = useState<Status>((['applied', 'interview_booked', 'approved', 'rejected'].includes(initial) ? initial : 'applied') as Status)
  const [busy, setBusy] = useState<'' | 'approve' | 'reject'>('')
  const [err, setErr] = useState('')

  async function act(kind: 'approve' | 'reject') {
    if (busy) return
    if (kind === 'reject' && !confirm('この応募を見送りにしますか？')) return
    setBusy(kind); setErr('')
    try {
      const res = await fetch(`/api/console/applications/${id}/${kind}`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j?.error || '失敗しました'); return }
      setStatus(kind === 'approve' ? 'approved' : 'rejected')
    } catch { setErr('通信に失敗しました') } finally { setBusy('') }
  }

  const b = BADGE[status]
  const terminal = status === 'approved' || status === 'rejected'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, alignItems: 'flex-start', minWidth: 160 }}>
      <span style={{ fontSize: '.58rem', fontWeight: 700, color: b.fg, background: b.bg, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{b.label}</span>

      {status === 'interview_booked' && interviewAt && (
        <span style={{ fontSize: '.58rem', color: 'var(--muted2)', whiteSpace: 'nowrap' }}>
          🗓 {fmtJst(interviewAt)}{interviewMeetUrl && <> · <a href={interviewMeetUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--c-blue)' }}>Meet</a></>}
        </span>
      )}
      {status === 'approved' && hasReferrer && (
        <span style={{ fontSize: '.54rem', color: 'var(--muted2)' }}>紹介元へ賞賛通知</span>
      )}

      {!terminal && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => act('approve')} disabled={!!busy}
            style={{ fontSize: '.6rem', fontWeight: 700, color: '#fff', background: busy === 'approve' ? 'var(--muted2)' : 'var(--blue)', border: 'none', borderRadius: 7, padding: '5px 10px', cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
            {busy === 'approve' ? '発行中…' : '承認（招待）'}
          </button>
          <button onClick={() => act('reject')} disabled={!!busy}
            style={{ fontSize: '.6rem', fontWeight: 600, color: 'var(--muted2)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 7, padding: '5px 10px', cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
            {busy === 'reject' ? '…' : '見送り'}
          </button>
        </div>
      )}
      {err && <span style={{ fontSize: '.54rem', color: 'var(--red)' }}>{err}</span>}
    </div>
  )
}
