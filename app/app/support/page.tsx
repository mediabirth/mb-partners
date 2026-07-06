'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const CATEGORY_OPTIONS = [
  { value: 'reward', label: '報酬について' },
  { value: 'deal', label: '案件について' },
  { value: 'account', label: 'アカウントについて' },
  { value: 'other', label: 'その他' },
]

const STATUS_LABEL: Record<string, string> = {
  open: '未返信',
  replied: '返信済',
  closed: 'クローズ',
}

const STATUS_COLOR: Record<string, { color: string; bg: string }> = {
  open:    { color: 'var(--amber)', bg: 'var(--amber-bg)' },
  replied: { color: 'var(--c-blue)', bg: 'var(--blue-bg2)' },
  closed:  { color: 'var(--muted2)', bg: 'var(--bg2)' },
}

export default function SupportPage() {
  const [category, setCategory] = useState('other')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [inquiries, setInquiries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/inquiries')
      .then(r => r.json())
      .then(d => setInquiries(d.inquiries ?? []))
      .finally(() => setLoading(false))
  }, [sent])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) {
      setError('件名と本文を入力してください')
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, subject, body }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? '送信に失敗しました')
        return
      }
      setSent(true)
      setCategory('other')
      setSubject('')
      setBody('')
    } catch {
      setError('送信に失敗しました')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ padding: '22px 20px', maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--c-blue)" strokeWidth="1.8">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 500 }}>お問い合わせ</h1>
      </div>

      <div style={{
        background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)',
        borderRadius: 10, padding: '12px 14px', marginBottom: 20,
        fontSize: '.72rem', color: 'var(--c-blue)', lineHeight: 1.7,
      }}>
        通常1営業日以内に返信いたします。お急ぎの場合はご連絡ください。
      </div>

      {sent && (
        <div style={{
          background: 'var(--green-bg)', border: '1px solid var(--green)',
          borderRadius: 10, padding: '12px 14px', marginBottom: 20,
          fontSize: '.74rem', color: 'var(--green)', lineHeight: 1.7,
        }}>
          お問い合わせを送信しました。回答をお待ちください。
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '18px 16px', marginBottom: 24 }}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: '.7rem', fontWeight: 500, marginBottom: 6, color: 'var(--muted2)' }}>
            カテゴリ
          </label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--line)', fontSize: '.8rem',
              color: 'var(--txt)', background: '#fff', outline: 'none',
            }}
          >
            {CATEGORY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: '.7rem', fontWeight: 500, marginBottom: 6, color: 'var(--muted2)' }}>
            件名
          </label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="件名を入力してください"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--line)', fontSize: '.8rem',
              color: 'var(--txt)', outline: 'none',
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: '.7rem', fontWeight: 500, marginBottom: 6, color: 'var(--muted2)' }}>
            本文
          </label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="お問い合わせ内容を入力してください"
            rows={5}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--line)', fontSize: '.8rem',
              color: 'var(--txt)', outline: 'none', resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {error && (
          <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 12 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={sending}
          style={{
            width: '100%', padding: '12px', borderRadius: 9, border: 'none',
            background: sending ? 'var(--muted)' : 'var(--c-blue)',
            color: '#fff', fontSize: '.82rem', fontWeight: 500,
            cursor: sending ? 'not-allowed' : 'pointer',
          }}
        >
          {sending ? '送信中…' : '送信する'}
        </button>
      </form>

      {/* Past inquiries */}
      <h2 style={{ fontSize: '.9rem', fontWeight: 500, marginBottom: 12 }}>過去のお問い合わせ</h2>
      {loading ? (
        <p style={{ fontSize: '.74rem', color: 'var(--muted2)' }}>読み込み中…</p>
      ) : inquiries.length === 0 ? (
        <p style={{ fontSize: '.74rem', color: 'var(--muted2)' }}>過去のお問い合わせはありません。</p>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
          {inquiries.map((inq: any, i: number) => (
            <Link key={inq.id} href={`/app/support/${inq.id}`} style={{
              display: 'flex', gap: 12, padding: '14px 16px',
              borderBottom: i < inquiries.length - 1 ? '1px solid var(--line)' : 'none',
              textDecoration: 'none', alignItems: 'center',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: '.78rem', color: 'var(--txt)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {inq.subject}
                </div>
                <div style={{ fontSize: '.64rem', color: 'var(--muted2)' }}>
                  {CATEGORY_OPTIONS.find(c => c.value === inq.category)?.label} ・ {new Date(inq.updated_at).toLocaleDateString('ja', { timeZone: 'Asia/Tokyo' })}
                </div>
              </div>
              <span style={{
                fontSize: '.6rem', fontWeight: 500, padding: '3px 8px', borderRadius: 4,
                color: STATUS_COLOR[inq.status]?.color ?? 'var(--muted2)',
                background: STATUS_COLOR[inq.status]?.bg ?? 'var(--bg2)',
                flexShrink: 0,
              }}>
                {STATUS_LABEL[inq.status] ?? inq.status}
              </span>
              <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>›</span>
            </Link>
          ))}
        </div>
      )}

      <div style={{ height: 30 }} />
    </div>
  )
}
