'use client'
import { useEffect, useState } from 'react'

type Slot = { start: string; end: string }
type Day = { date: string; label: string; slots: Slot[] }

/**
 * in-app 商談予約ドロワー。
 * 空き枠をデフォルト表示（次の空き日を既定選択→その日の時間枠を即時表示）。
 * 確定で /api/deals/[id]/meeting に保存（meeting_at / calendar_event_id）。
 * 外部遷移・新規タブは使わない。
 */
export default function BookingDrawer({ dealId, onClose, onConfirmed }: {
  dealId: string; onClose: () => void; onConfirmed?: (startAt: string) => void
}) {
  const [days, setDays]       = useState<Day[]>([])
  const [selDate, setSelDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [doneAt, setDoneAt]   = useState<string | null>(null)
  const [error, setError]     = useState('')

  useEffect(() => {
    fetch('/api/calendar/slots')
      .then(r => r.json())
      .then(d => {
        setDays(d.days ?? [])
        setSelDate(d.nextDay ?? null)   // 次の空き日を既定選択
        setConnected(d.connected ?? false)
      })
      .catch(() => setError('空き枠を取得できませんでした'))
      .finally(() => setLoading(false))
  }, [])

  const day = days.find(d => d.date === selDate) ?? null

  async function confirm(slot: Slot) {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/deals/${dealId}/meeting`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_at: slot.start, end_at: slot.end }),
      })
      if (!res.ok) { setError('保存に失敗しました'); return }
      setDoneAt(slot.start)
      onConfirmed?.(slot.start)
    } catch { setError('保存に失敗しました') } finally { setSaving(false) }
  }

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('ja', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', backdropFilter: 'blur(3px)', zIndex: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div className="page-anim" style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 440, maxHeight: '86vh', overflowY: 'auto', padding: '20px 20px 28px', boxShadow: '0 -8px 40px rgba(14,14,20,.18)' }}>
        <div style={{ width: 38, height: 4, borderRadius: 4, background: 'var(--line)', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 900, letterSpacing: '-.01em' }}>商談日時を設定</h2>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--bg2)', color: 'var(--muted2)', fontSize: '1rem', cursor: 'pointer' }}>✕</button>
        </div>

        {doneAt ? (
          <div style={{ textAlign: 'center', padding: '28px 10px' }}>
            <div className="celebrate-pop" style={{ fontSize: '2.4rem', marginBottom: 10 }} aria-hidden>📅</div>
            <h3 style={{ fontSize: '1rem', fontWeight: 900, marginBottom: 6 }}>商談を設定しました</h3>
            <p style={{ fontSize: '.76rem', color: 'var(--muted2)', marginBottom: 18 }}>
              {new Date(doneAt).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })}
            </p>
            <button onClick={onClose} className="btn btn-p lift" style={{ width: '100%' }}>閉じる</button>
          </div>
        ) : loading ? (
          <p style={{ padding: '28px 0', textAlign: 'center', color: 'var(--muted2)', fontSize: '.78rem' }}>空き枠を読み込み中…</p>
        ) : days.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <p style={{ fontSize: '.78rem', color: 'var(--muted2)', lineHeight: 1.8, marginBottom: 14 }}>
              空き枠が見つかりませんでした。{connected ? '受付時間帯をご確認ください。' : 'カレンダー連携・受付時間帯を設定してください。'}
            </p>
            <a href="/app/calendar" className="btn btn-g" style={{ display: 'inline-block', textDecoration: 'none' }}>カレンダー設定を開く</a>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: '6px 0 12px', lineHeight: 1.6 }}>
              空いている日時から選ぶだけ。{connected ? 'Googleカレンダーの予定を避けて表示しています。' : ''}
            </p>
            {/* 日付チップ（次の空き日が既定選択） */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 14 }}>
              {days.map(d => {
                const active = d.date === selDate
                return (
                  <button key={d.date} onClick={() => setSelDate(d.date)}
                    style={{ flexShrink: 0, padding: '8px 13px', borderRadius: 11, border: `1.5px solid ${active ? 'var(--blue)' : 'var(--line)'}`, background: active ? 'var(--blue)' : '#fff', color: active ? '#fff' : 'var(--txt)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {d.label}
                  </button>
                )
              })}
            </div>
            {/* 時間枠（即時表示） */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {(day?.slots ?? []).map(s => (
                <button key={s.start} disabled={saving} onClick={() => confirm(s)} className="lift"
                  style={{ padding: '11px 0', borderRadius: 10, border: '1.5px solid var(--blue-bg)', background: 'var(--blue-bg2)', color: 'var(--blue-dk)', fontSize: '.8rem', fontWeight: 800, fontFamily: 'Inter', cursor: saving ? 'wait' : 'pointer' }}>
                  {fmtTime(s.start)}
                </button>
              ))}
            </div>
            {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginTop: 12 }}>{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
