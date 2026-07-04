'use client'
import { use, useEffect, useState } from 'react'
import SlotPicker, { type Slot, type Day } from '@/components/SlotPicker'

const toJST = (iso: string) =>
  new Date(iso).toLocaleTimeString('ja', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })

const fmtDateLong = (s: string) =>
  new Date(s + 'T00:00:00+09:00').toLocaleDateString('ja', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo',
  })

// 確定ボタン用：MM/DD(曜) HH:MM
const fmtConfirm = (date: string, iso: string) => {
  const d = new Date(date + 'T00:00:00+09:00')
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}(${wd}) ${toJST(iso)}`
}

/**
 * 協力予約リンク（公開・ログイン不要）。partner_id を URL で受ける。
 * 1ページ完結：共通 SlotPicker（範囲取得した days[]・nextDay 初期表示）＋ お客さま情報入力 ＋ 確定。
 * 確定＝POST /api/meetings（新規deal＋meeting＋GCal＋帰属）byte-unchanged。
 * SlotPicker は選んだ slot を親に返すだけ。確定はこのラッパーが従来通り /api/meetings を叩く。
 */
export default function BookPage({ params }: { params: Promise<{ partner_id: string }> }) {
  const { partner_id } = use(params)

  const [days, setDays]             = useState<Day[]>([])
  const [loading, setLoading]       = useState(true)
  const [connected, setConnected]   = useState(true)
  const [busyChecked, setBusyChecked] = useState(false)
  const [selectedDate, setSelDate]  = useState<string | null>(null)
  const [selectedSlot, setSelSlot]  = useState<Slot | null>(null)
  const [customerType, setCustomerType] = useState<'individual' | 'corporate'>('individual')
  const [name, setName]              = useState('')
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail]            = useState('')
  const [note, setNote]              = useState('')   // ② ご相談内容・メモ（任意）
  const [submitting, setSubmitting]  = useState(false)
  const [done, setDone]              = useState(false)
  const [doneSlot, setDoneSlot]      = useState<{ date: string; slot: Slot } | null>(null)
  const [error, setError]            = useState('')

  useEffect(() => {
    fetch(`/api/availability?partner_id=${partner_id}&days=21`)
      .then(r => r.json())
      .then(d => {
        setDays(d.days ?? [])
        setSelDate(d.nextDay ?? null)   // 次の空き日を既定選択
        setConnected(d.connected ?? false)
        setBusyChecked(d.busyChecked ?? false)
      })
      .catch(() => setError('空き枠を取得できませんでした'))
      .finally(() => setLoading(false))
  }, [partner_id])

  const composedName = customerType === 'corporate'
    ? (contactName.trim() ? `${companyName.trim()}（${contactName.trim()}）` : companyName.trim())
    : name.trim()
  const customerValid = customerType === 'corporate' ? !!companyName.trim() : !!name.trim()
  const canSubmit = !!selectedSlot && customerValid && !!email.trim() && !submitting

  const handleSubmit = async () => {
    if (!selectedSlot || !customerValid || !email.trim()) return
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner_id,
        start_at: selectedSlot.start,
        end_at: selectedSlot.end,
        client_name: composedName,
        client_email: email.trim(),
        customer_type: customerType,
        company_name: customerType === 'corporate' ? companyName.trim() : null,
        contact_name: customerType === 'corporate' ? contactName.trim() : null,
        note: note.trim() || null,
      }),
    })
    setSubmitting(false)
    if (res.ok) {
      setDoneSlot(selectedDate ? { date: selectedDate, slot: selectedSlot } : null)
      setDone(true)
    } else {
      const { error } = await res.json()
      setError(error ?? '予約に失敗しました')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FB', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 16px 40px' }}>
      <div className="page-anim" style={{ width: '100%', maxWidth: 440 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-.01em', marginBottom: 4 }}>ご予約</h1>
          <p style={{ color: 'var(--muted2)', fontSize: 13, margin: 0 }}>相談日時をお選びください</p>
        </div>

        {done ? (
          /* 完了（celebrate） */
          <div style={{ background: '#fff', borderRadius: 18, border: '1px solid var(--line)', padding: 36, textAlign: 'center' }}>
            <div className="celebrate-pop" style={{ fontSize: '2.6rem', marginBottom: 12 }} aria-hidden>📅</div>
            <h2 style={{ fontSize: 19, fontWeight: 900, marginBottom: 10 }}>予約が完了しました</h2>
            {doneSlot && (
              <>
                <p style={{ color: 'var(--muted2)', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  {fmtDateLong(doneSlot.date)}
                </p>
                <p style={{ color: 'var(--blue)', fontSize: 16, fontWeight: 800, marginBottom: 16 }}>
                  {toJST(doneSlot.slot.start)} 〜 {toJST(doneSlot.slot.end)}
                </p>
              </>
            )}
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              カレンダー招待をメールでお送りしました
            </p>
          </div>
        ) : loading ? (
          <div style={{ background: '#fff', borderRadius: 18, border: '1px solid var(--line)', padding: 36, textAlign: 'center', color: 'var(--muted2)', fontSize: 13 }}>
            空き枠を読み込み中…
          </div>
        ) : days.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 18, border: '1px solid var(--line)', padding: 36, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--muted2)', lineHeight: 1.8 }}>
              現在ご予約いただける空き枠がありません。時間をおいて再度お試しください。
            </p>
          </div>
        ) : (
          <>
            {/* 日時選択（共通 SlotPicker） */}
            <div style={{ background: '#fff', borderRadius: 18, border: '1px solid var(--line)', padding: 20, marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 3 }}>日時を選択</h2>
              <p style={{ fontSize: '.7rem', color: 'var(--muted2)', margin: '0 0 14px', lineHeight: 1.6 }}>
                空いている日時から選ぶだけ。{connected && busyChecked ? 'Googleカレンダーの予定を避けて表示しています。' : ''}
              </p>
              <SlotPicker
                days={days}
                selectedDate={selectedDate}
                selectedSlot={selectedSlot}
                onSelectDate={d => { setSelDate(d); setSelSlot(null) }}
                onSelectSlot={s => setSelSlot(s)}
                connected={connected}
                busyChecked={busyChecked}
              />
            </div>

            {/* お客さま情報（現状の項目を維持） */}
            <div style={{ background: '#fff', borderRadius: 18, border: '1px solid var(--line)', padding: 20 }}>
              {selectedSlot && selectedDate && (
                <div style={{ background: 'var(--blue-bg2)', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted2)', marginBottom: 3 }}>予約日時</div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--blue-dk)' }}>{fmtDateLong(selectedDate)}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)', marginTop: 2 }}>
                    {toJST(selectedSlot.start)} 〜 {toJST(selectedSlot.end)}
                  </div>
                </div>
              )}

              <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>お客さま情報</h2>

              {/* お客さまの種別 */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, color: 'var(--muted2)', display: 'block', marginBottom: 6, fontWeight: 500 }}>お客さまの種別</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([['individual', '個人'], ['corporate', '法人']] as const).map(([v, l]) => (
                    <button type="button" key={v} onClick={() => setCustomerType(v)}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        border: `1.5px solid ${customerType === v ? 'var(--blue)' : 'var(--line)'}`,
                        background: customerType === v ? 'var(--blue)' : '#fff', color: customerType === v ? '#fff' : 'var(--txt)' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {customerType === 'individual' ? (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, color: 'var(--muted2)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                    お客さまのお名前 <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="山田 太郎"
                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 13, color: 'var(--muted2)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                      会社名 <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="株式会社〇〇"
                      style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 13, color: 'var(--muted2)', display: 'block', marginBottom: 6, fontWeight: 500 }}>ご担当者名（任意）</label>
                    <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="山田 太郎"
                      style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                  </div>
                </>
              )}

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, color: 'var(--muted2)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                  メールアドレス <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com"
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              </div>

              {/* ② ご相談内容・メモ（任意）。予約成立・空き枠・Meet には非接触。 */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, color: 'var(--muted2)', display: 'block', marginBottom: 6, fontWeight: 500 }}>ご相談内容・メモ（任意）</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="ご相談したいことや当日話したい内容があればご記入ください"
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6 }} />
              </div>

              {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

              <button onClick={handleSubmit} disabled={!canSubmit} className="btn btn-p lift"
                style={{ width: '100%', opacity: canSubmit ? 1 : 0.5 }}>
                {submitting ? '予約中…'
                  : selectedSlot && selectedDate ? `${fmtConfirm(selectedDate, selectedSlot.start)} で予約を確定`
                  : '日時を選択してください'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
