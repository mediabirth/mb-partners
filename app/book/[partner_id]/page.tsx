'use client'
import { use, useEffect, useState } from 'react'

type TimeSlot = { start: string; end: string }
type Step = 'calendar' | 'slot' | 'form' | 'done'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

const toJST = (iso: string) =>
  new Date(iso).toLocaleTimeString('ja', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })

const dateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const fmtDateLong = (s: string) =>
  new Date(s + 'T00:00:00+09:00').toLocaleDateString('ja', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo',
  })

const STEP_LABELS = ['日付', '時間', '情報'] as const
const STEP_KEYS: Step[] = ['calendar', 'slot', 'form']

export default function BookPage({ params }: { params: Promise<{ partner_id: string }> }) {
  const { partner_id } = use(params)

  const [step, setStep]             = useState<Step>('calendar')
  const today                        = new Date()
  const [viewYear, setViewYear]      = useState(today.getFullYear())
  const [viewMonth, setViewMonth]    = useState(today.getMonth())
  const [selectedDate, setSelDate]   = useState('')
  const [slots, setSlots]            = useState<TimeSlot[]>([])
  const [slotsLoading, setSlotsLoad] = useState(false)
  const [selectedSlot, setSelSlot]   = useState<TimeSlot | null>(null)
  const [name, setName]              = useState('')
  const [email, setEmail]            = useState('')
  const [submitting, setSubmitting]  = useState(false)
  const [error, setError]            = useState('')

  useEffect(() => {
    if (!selectedDate || step !== 'slot') return
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner_id,
        start_at: selectedSlot.start,
        end_at: selectedSlot.end,
        client_name: name.trim(),
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

  // Calendar grid
  const todayStr = dateStr(today)
  const maxDate  = new Date(today); maxDate.setDate(today.getDate() + 60)
  const maxStr   = dateStr(maxDate)

  const firstDay = new Date(viewYear, viewMonth, 1)
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const startDow = firstDay.getDay()

  const cells: (string | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(dateStr(new Date(viewYear, viewMonth, d)))
  while (cells.length % 7 !== 0) cells.push(null)

  const canPrev = viewYear > today.getFullYear() || viewMonth > today.getMonth()
  const canNext = new Date(viewYear, viewMonth + 1, 1) < new Date(today.getFullYear(), today.getMonth() + 2, 1)

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const onDateSelect = (d: string) => {
    setSelDate(d)
    setSelSlot(null)
    setStep('slot')
  }

  const stepIdx = STEP_KEYS.indexOf(step)

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FB', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 16px 40px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>ご予約</h1>
          <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>相談日時をお選びください</p>
        </div>

        {/* Step indicator */}
        {step !== 'done' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
            {STEP_LABELS.map((label, i) => {
              const done = stepIdx > i
              const active = stepIdx === i
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700,
                      background: active ? '#2563EB' : done ? '#DBEAFE' : '#F3F4F6',
                      color: active ? '#fff' : done ? '#2563EB' : '#9CA3AF',
                    }}>
                      {done ? '✓' : i + 1}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? '#2563EB' : done ? '#6B7280' : '#9CA3AF' }}>
                      {label}
                    </span>
                  </div>
                  {i < 2 && <span style={{ color: '#D1D5DB', fontSize: 11 }}>›</span>}
                </div>
              )
            })}
          </div>
        )}

        {/* Calendar */}
        {step === 'calendar' && (
          <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E5E7EB', padding: '20px 16px' }}>
            {/* Month nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <button onClick={prevMonth} disabled={!canPrev} style={{
                width: 32, height: 32, borderRadius: '50%', border: 'none',
                background: canPrev ? '#F3F4F6' : 'transparent',
                color: canPrev ? '#374151' : '#D1D5DB', fontSize: 18, cursor: canPrev ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
              }}>‹</button>
              <span style={{ fontWeight: 700, fontSize: 15 }}>
                {viewYear}年{viewMonth + 1}月
              </span>
              <button onClick={nextMonth} disabled={!canNext} style={{
                width: 32, height: 32, borderRadius: '50%', border: 'none',
                background: canNext ? '#F3F4F6' : 'transparent',
                color: canNext ? '#374151' : '#D1D5DB', fontSize: 18, cursor: canNext ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
              }}>›</button>
            </div>

            {/* Weekday headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
              {WEEKDAYS.map((w, i) => (
                <div key={w} style={{
                  textAlign: 'center', fontSize: 11, fontWeight: 600, padding: '3px 0',
                  color: i === 0 ? '#EF4444' : i === 6 ? '#3B82F6' : '#6B7280',
                }}>{w}</div>
              ))}
            </div>

            {/* Day cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {cells.map((d, i) => {
                if (!d) return <div key={i} />
                const isPast = d < todayStr
                const isFuture = d > maxStr
                const isDisabled = isPast || isFuture
                const isSelected = d === selectedDate
                const isToday = d === todayStr
                const dow = new Date(d + 'T00:00:00+09:00').getDay()
                const dayNum = new Date(d + 'T00:00:00+09:00').getDate()
                return (
                  <button
                    key={d}
                    onClick={() => !isDisabled && onDateSelect(d)}
                    disabled={isDisabled}
                    style={{
                      padding: '7px 2px', border: 'none', borderRadius: 8,
                      background: isSelected ? '#2563EB' : isToday ? '#EFF6FF' : 'transparent',
                      color: isSelected ? '#fff'
                        : isDisabled ? '#D1D5DB'
                        : dow === 0 ? '#EF4444'
                        : dow === 6 ? '#3B82F6'
                        : '#111827',
                      fontSize: 13, fontWeight: isToday && !isSelected ? 700 : 400,
                      cursor: isDisabled ? 'default' : 'pointer', textAlign: 'center',
                    }}
                  >
                    {dayNum}
                  </button>
                )
              })}
            </div>

            <p style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
              今日から60日間の空き日程から選択できます
            </p>
          </div>
        )}

        {/* Slot selection */}
        {step === 'slot' && (
          <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E5E7EB', padding: 20 }}>
            <button onClick={() => setStep('calendar')} style={{
              background: 'none', border: 'none', color: '#2563EB', fontSize: 13,
              cursor: 'pointer', marginBottom: 14, padding: 0, display: 'flex', alignItems: 'center', gap: 4,
            }}>
              ← 日付を変更
            </button>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>時間を選択</h2>
            <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>{fmtDateLong(selectedDate)}</p>

            {slotsLoading && (
              <div style={{ textAlign: 'center', padding: '28px 0', color: '#9CA3AF', fontSize: 13 }}>
                空き枠を確認中...
              </div>
            )}
            {!slotsLoading && slots.length === 0 && (
              <div style={{ textAlign: 'center', padding: '28px 0' }}>
                <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 12 }}>この日は空き枠がありません</p>
                <button onClick={() => setStep('calendar')} style={{
                  background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '9px 18px',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151',
                }}>
                  別の日を選ぶ
                </button>
              </div>
            )}
            {!slotsLoading && slots.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {slots.map(slot => (
                  <button
                    key={slot.start}
                    onClick={() => { setSelSlot(slot); setStep('form') }}
                    style={{
                      padding: '13px 6px', border: '1.5px solid #E5E7EB', borderRadius: 10,
                      background: '#fff', color: '#111827', fontSize: 14, fontWeight: 600,
                      cursor: 'pointer', textAlign: 'center',
                    }}
                    onMouseEnter={e => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = '#EFF6FF'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#2563EB'
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = '#fff'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#E5E7EB'
                    }}
                  >
                    {toJST(slot.start)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Form */}
        {step === 'form' && selectedSlot && (
          <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E5E7EB', padding: 20 }}>
            <button onClick={() => setStep('slot')} style={{
              background: 'none', border: 'none', color: '#2563EB', fontSize: 13,
              cursor: 'pointer', marginBottom: 14, padding: 0,
            }}>
              ← 時間を変更
            </button>

            {/* Appointment summary chip */}
            <div style={{ background: '#EFF6FF', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 3 }}>予約日時</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1E3A8A' }}>{fmtDateLong(selectedDate)}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#2563EB', marginTop: 2 }}>
                {toJST(selectedSlot.start)} 〜 {toJST(selectedSlot.end)}
              </div>
            </div>

            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>お客様情報</h2>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                お名前 <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="山田 太郎"
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 13, color: '#374151', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                メールアドレス <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@email.com"
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E5E7EB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            {error && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting || !name.trim() || !email.trim()}
              style={{
                width: '100%', padding: '13px', background: '#2563EB', color: '#fff',
                border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15,
                cursor: submitting || !name.trim() || !email.trim() ? 'default' : 'pointer',
                opacity: submitting || !name.trim() || !email.trim() ? 0.6 : 1,
              }}
            >
              {submitting ? '予約中...' : '予約を確定する'}
            </button>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #E5E7EB', padding: 36, textAlign: 'center' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%', background: '#DCFCE7',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 10 }}>予約が完了しました</h2>
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              {fmtDateLong(selectedDate)}
            </p>
            <p style={{ color: '#2563EB', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
              {selectedSlot ? toJST(selectedSlot.start) : ''} 〜 {selectedSlot ? toJST(selectedSlot.end) : ''}
            </p>
            <p style={{ color: '#9CA3AF', fontSize: 13 }}>
              カレンダー招待をメールでお送りしました
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
