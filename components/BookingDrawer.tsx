'use client'
import { useEffect, useState } from 'react'

type Slot = { start: string; end: string }
type Day = { date: string; label: string; weekday?: string; count?: number; slots: Slot[] }

/**
 * in-app 商談予約ドロワー。
 * 空き枠をデフォルト表示（次の空き日を既定選択→その日の時間枠を即時表示）。
 * 確定で /api/deals/[id]/meeting に保存（meeting_at / calendar_event_id）。
 * 外部遷移・新規タブは使わない。
 */
export default function BookingDrawer({ dealId, createDeal, onClose, onConfirmed }: {
  dealId?: string | null
  // 予約確定の瞬間に deal を作成して dealId を返す（協力の自分で予約用）
  createDeal?: () => Promise<string | null>
  onClose: () => void
  onConfirmed?: (startAt: string) => void
}) {
  const [days, setDays]       = useState<Day[]>([])
  const [selDate, setSelDate] = useState<string | null>(null)
  const [selSlot, setSelSlot] = useState<Slot | null>(null)
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
      // 協力の「自分で予約」: この瞬間に協力deal を作成して dealId を得る
      let id = dealId ?? null
      if (!id && createDeal) {
        id = await createDeal()
        if (!id) { setError('申し込みに失敗しました'); return }
      }
      if (!id) { setError('対象の案件が見つかりません'); return }
      const res = await fetch(`/api/deals/${id}/meeting`, {
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
            {/* 日付チップ（空き枠数を表示・空きのない日はグレーアウト・次の空き日が既定選択） */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 14 }}>
              {days.map(d => {
                const active = d.date === selDate
                const empty = (d.count ?? d.slots.length) === 0
                return (
                  <button key={d.date} onClick={() => { if (!empty) { setSelDate(d.date); setSelSlot(null) } }} disabled={empty}
                    style={{
                      flexShrink: 0, minWidth: 56, padding: '7px 11px', borderRadius: 11,
                      border: `1.5px solid ${active ? 'var(--blue)' : empty ? 'var(--line)' : 'var(--blue-bg)'}`,
                      background: active ? 'var(--blue)' : empty ? 'var(--bg2)' : '#fff',
                      color: active ? '#fff' : empty ? 'var(--muted2)' : 'var(--txt)',
                      opacity: empty ? .55 : 1, cursor: empty ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'center',
                    }}>
                    <div style={{ fontSize: '.72rem', fontWeight: 800 }}>{d.label}{d.weekday ? `(${d.weekday})` : ''}</div>
                    <div style={{ fontSize: '.54rem', fontWeight: 700, marginTop: 2, color: active ? 'rgba(255,255,255,.9)' : empty ? 'var(--muted2)' : 'var(--blue)' }}>
                      {empty ? '満' : `${d.count ?? d.slots.length}枠`}
                    </div>
                  </button>
                )
              })}
            </div>
            {/* 時間枠（即時表示）。ワンタップ＝選択（即予約はしない） */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {(day?.slots ?? []).map(s => {
                const sel = selSlot?.start === s.start
                return (
                  <button key={s.start} onClick={() => setSelSlot(s)} className="lift"
                    style={{ padding: '11px 0', borderRadius: 10, fontSize: '.8rem', fontWeight: 800, fontFamily: 'Inter', cursor: 'pointer',
                      border: `1.5px solid ${sel ? 'var(--blue)' : 'var(--blue-bg)'}`,
                      background: sel ? 'var(--blue)' : 'var(--blue-bg2)', color: sel ? '#fff' : 'var(--blue-dk)' }}>
                    {fmtTime(s.start)}
                  </button>
                )
              })}
            </div>
            {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginTop: 12 }}>{error}</p>}
            {/* 確定 */}
            <button onClick={() => selSlot && confirm(selSlot)} disabled={!selSlot || saving} className="btn btn-p lift"
              style={{ width: '100%', marginTop: 14, opacity: (!selSlot || saving) ? .5 : 1 }}>
              {saving ? '確定中…' : selSlot ? `${fmtTime(selSlot.start)} で予約を確定` : '時間を選択してください'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
