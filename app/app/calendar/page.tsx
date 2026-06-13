'use client'
import { useEffect, useState } from 'react'

type Availability = {
  days:           number[]
  start:          string
  end:            string
  slot_minutes:   number
  buffer_minutes: number
}

type CalendarLink = {
  google_email:  string | null
  active:        boolean
  availability:  Availability | null
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

const DEFAULT_AVAIL: Availability = {
  days:           [1, 2, 3, 4, 5],
  start:          '10:00',
  end:            '18:00',
  slot_minutes:   60,
  buffer_minutes: 15,
}

export default function CalendarPage() {
  const [link,    setLink]    = useState<CalendarLink | null>(null)
  const [avail,   setAvail]   = useState<Availability>(DEFAULT_AVAIL)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    // URL からフラッシュメッセージ取得
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === '1') {
      setSaved(true)
      window.history.replaceState({}, '', '/app/calendar')
    }
    if (params.get('error')) {
      setError(`Google連携エラー: ${params.get('error')}`)
      window.history.replaceState({}, '', '/app/calendar')
    }

    fetch('/api/calendar')
      .then(r => r.json())
      .then(({ link }) => {
        setLink(link)
        if (link?.availability) setAvail(link.availability)
      })
      .finally(() => setLoading(false))
  }, [])

  const toggleDay = (d: number) => {
    setAvail(prev => ({
      ...prev,
      days: prev.days.includes(d)
        ? prev.days.filter(x => x !== d)
        : [...prev.days, d].sort(),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError('')
    const res = await fetch('/api/calendar', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ availability: avail }),
    })
    setSaving(false)
    if (res.ok) setSaved(true)
    else setError('保存に失敗しました')
  }

  if (loading) return <p style={{ padding: 24 }}>読み込み中...</p>

  return (
    <div style={{ padding: 24, maxWidth: 560 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>カレンダー連携</h1>

      {/* Google 連携ステータス */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Google アカウント</h2>
        {link?.google_email ? (
          <div>
            <p style={{ color: 'var(--green)', fontWeight: 600, marginBottom: 4 }}>✓ 連携済み</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{link.google_email}</p>
            <a
              href="/api/auth/google"
              style={{ display: 'inline-block', marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'underline' }}
            >
              別のアカウントで再連携
            </a>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: 14 }}>
              Google カレンダーと連携すると、クライアントが空き枠を確認して予約できるようになります。
            </p>
            <a
              href="/api/auth/google"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                background: '#4285F4',
                color: '#fff',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: 'none',
              }}
            >
              Google と連携する
            </a>
          </div>
        )}
      </section>

      {/* 受付時間帯設定 */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>受付時間帯</h2>

        {/* 曜日 */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>受付曜日</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                onClick={() => toggleDay(i)}
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--border)',
                  background: avail.days.includes(i) ? 'var(--primary)' : 'var(--surface)',
                  color:      avail.days.includes(i) ? '#fff' : 'var(--text)',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 開始・終了時刻 */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>開始時刻</label>
            <input
              type="time"
              value={avail.start}
              onChange={e => setAvail(prev => ({ ...prev, start: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>終了時刻</label>
            <input
              type="time"
              value={avail.end}
              onChange={e => setAvail(prev => ({ ...prev, end: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>
        </div>

        {/* スロット・バッファ */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>スロット（分）</label>
            <select
              value={avail.slot_minutes}
              onChange={e => setAvail(prev => ({ ...prev, slot_minutes: Number(e.target.value) }))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }}
            >
              {[30, 45, 60, 90, 120].map(v => (
                <option key={v} value={v}>{v}分</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>バッファ（分）</label>
            <select
              value={avail.buffer_minutes}
              onChange={e => setAvail(prev => ({ ...prev, buffer_minutes: Number(e.target.value) }))}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }}
            >
              {[0, 10, 15, 30].map(v => (
                <option key={v} value={v}>{v}分</option>
              ))}
            </select>
          </div>
        </div>

        {error  && <p style={{ color: 'var(--red)',   fontSize: 14, marginBottom: 12 }}>{error}</p>}
        {saved  && <p style={{ color: 'var(--green)', fontSize: 14, marginBottom: 12 }}>保存しました</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 24px', background: 'var(--primary)', color: '#fff',
            border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? '保存中...' : '保存する'}
        </button>
      </section>
    </div>
  )
}
