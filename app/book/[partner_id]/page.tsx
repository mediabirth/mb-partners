'use client'
import { use, useEffect, useState } from 'react'

type TimeSlot = { start: string; end: string }

const toJST = (iso: string) =>
  new Date(iso).toLocaleTimeString('ja', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })

const dateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const fmtDate = (s: string) => {
  const d = new Date(s + 'T00:00:00+09:00')
  return d.toLocaleDateString('ja', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' })
}

function CalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}

export default function BookPage({ params }: { params: Promise<{ partner_id: string }> }) {
  const { partner_id } = use(params)

  const [step,       setStep]       = useState<'date' | 'slot' | 'form' | 'done'>('date')
  const [selectedDate, setSelDate]  = useState(dateStr(new Date()))
  const [slots,      setSlots]      = useState<TimeSlot[]>([])
  const [slotsLoading, setSlotsLoad] = useState(false)
  const [selectedSlot, setSelSlot]  = useState<TimeSlot | null>(null)
  const [name,       setName]       = useState('')
  const [email,      setEmail]      = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  // 日付変更時にスロット取得
  useEffect(() => {
    if (step !== 'slot') return
    setSlotsLoad(true)
    setSlots([])
    fetch(`/api/availability?partner_id=${partner_id}&date=${selectedDate}`)
      .then(r => r.json())
      .then(({ slots }) => setSlots(slots ?? []))
      .finally(() => setSlotsLoad(false))
  }, [selectedDate, step, partner_id])

  const handleSubmit = async () => {
    if (!selectedSlot || !name.trim() || !email.trim()) return
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/meetings', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        partner_id,
        start_at:     selectedSlot.start,
        end_at:       selectedSlot.end,
        client_name:  name.trim(),
        client_email: email.trim(),
      }),
    })
    setSubmitting(false)
    if (res.ok) {
      setStep('done')
    } else {
      const { error } = await res.json()
      setError(error ?? '予約に失敗しました')
    }
  }

  // 今日から60日分の日付リスト
  const today = new Date()
  const dateCandidates = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return dateStr(d)
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #f8f9fb)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* ヘッダー */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>ご予約</h1>
          <p style={{ color: '#6b7280', fontSize: 14 }}>相談日時をお選びください</p>
        </div>

        {/* Step: 日付選択 */}
        {step === 'date' && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalIcon /> 日付を選択
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {dateCandidates.map(d => (
                <button
                  key={d}
                  onClick={() => { setSelDate(d); setStep('slot') }}
                  style={{
                    padding: '10px 4px', border: '1px solid #e5e7eb', borderRadius: 8,
                    background: d === selectedDate ? '#2563eb' : '#fff',
                    color:      d === selectedDate ? '#fff' : '#111',
                    fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  {(() => {
                    const dt = new Date(d + 'T00:00:00+09:00')
                    const m  = dt.getMonth() + 1
                    const day = dt.getDate()
                    const w  = ['日','月','火','水','木','金','土'][dt.getDay()]
                    return `${m}/${day}(${w})`
                  })()}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: スロット選択 */}
        {step === 'slot' && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 24 }}>
            <button onClick={() => setStep('date')} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', marginBottom: 12 }}>
              ← 日付を変更
            </button>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>時間を選択</h2>
            <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>{fmtDate(selectedDate)}</p>
            {slotsLoading && <p style={{ color: '#6b7280' }}>空き枠を確認中...</p>}
            {!slotsLoading && slots.length === 0 && (
              <p style={{ color: '#6b7280' }}>この日は空き枠がありません</p>
            )}
            {!slotsLoading && slots.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {slots.map(slot => (
                  <button
                    key={slot.start}
                    onClick={() => { setSelSlot(slot); setStep('form') }}
                    style={{
                      padding: '12px 8px', border: '1px solid #e5e7eb', borderRadius: 8,
                      background: '#fff', color: '#111', fontSize: 14, fontWeight: 500,
                      cursor: 'pointer', textAlign: 'center',
                    }}
                  >
                    {toJST(slot.start)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step: 予約者情報 */}
        {step === 'form' && selectedSlot && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 24 }}>
            <button onClick={() => setStep('slot')} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', marginBottom: 12 }}>
              ← 時間を変更
            </button>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>お客様情報</h2>
            <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>
              {fmtDate(selectedDate)} {toJST(selectedSlot.start)} 〜 {toJST(selectedSlot.end)}
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 6 }}>お名前 <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="山田 太郎"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 6 }}>メールアドレス <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@email.com"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            {error && <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 12 }}>{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting || !name.trim() || !email.trim()}
              style={{
                width: '100%', padding: '12px', background: '#2563eb', color: '#fff',
                border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 15,
                cursor: (submitting || !name.trim() || !email.trim()) ? 'default' : 'pointer',
                opacity: (submitting || !name.trim() || !email.trim()) ? 0.6 : 1,
              }}
            >
              {submitting ? '予約中...' : '予約を確定する'}
            </button>
          </div>
        )}

        {/* Step: 完了 */}
        {step === 'done' && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', padding: 32, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>予約が完了しました</h2>
            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 4 }}>
              {fmtDate(selectedDate)} {selectedSlot ? toJST(selectedSlot.start) : ''} 〜 {selectedSlot ? toJST(selectedSlot.end) : ''}
            </p>
            <p style={{ color: '#6b7280', fontSize: 13 }}>
              カレンダー招待をメールでお送りしました
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
