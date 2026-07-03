'use client'
import { useState, useEffect, use } from 'react'

const CATEGORY_OPTIONS: Record<string, string> = {
  reward: '報酬について',
  deal: '案件について',
  account: 'アカウントについて',
  other: 'その他',
}

const STATUS_LABEL: Record<string, string> = {
  open: '未返信',
  replied: '返信済',
  closed: 'クローズ',
}

export default function SupportThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [inquiry, setInquiry] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function fetchInquiry() {
    const res = await fetch(`/api/inquiries/${id}`)
    if (res.ok) {
      const data = await res.json()
      setInquiry(data.inquiry)
    }
    setLoading(false)
  }

  useEffect(() => { fetchInquiry() }, [id])

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyBody.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/inquiries/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyBody }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? '送信に失敗しました')
        return
      }
      setReplyBody('')
      await fetchInquiry()
    } catch {
      setError('送信に失敗しました')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '40px 20px', fontSize: '.8rem', color: 'var(--muted2)' }}>読み込み中...</div>
  }

  if (!inquiry) {
    return <div style={{ padding: '40px 20px', fontSize: '.8rem', color: 'var(--red)' }}>お問い合わせが見つかりません。</div>
  }

  return (
    <div style={{ padding: '22px 20px', maxWidth: 600 }}>
      <a href="/app/support" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.72rem', color: 'var(--c-blue)', textDecoration: 'none', marginBottom: 16 }}>
        ← お問い合わせ一覧に戻る
      </a>

      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: '.96rem', fontWeight: 500, marginBottom: 4 }}>{inquiry.subject}</h2>
            <p style={{ fontSize: '.65rem', color: 'var(--muted2)' }}>
              {CATEGORY_OPTIONS[inquiry.category] ?? inquiry.category} · {new Date(inquiry.created_at).toLocaleDateString('ja', { timeZone: 'Asia/Tokyo' })}
            </p>
          </div>
          <span style={{
            fontSize: '.62rem', fontWeight: 500, padding: '3px 10px', borderRadius: 20,
            color: inquiry.status === 'replied' ? 'var(--c-blue)' : inquiry.status === 'open' ? 'var(--amber)' : 'var(--muted2)',
            background: inquiry.status === 'replied' ? 'var(--blue-bg2)' : inquiry.status === 'open' ? 'var(--amber-bg)' : 'var(--bg2)',
            flexShrink: 0,
          }}>
            {STATUS_LABEL[inquiry.status] ?? inquiry.status}
          </span>
        </div>
      </div>

      <div style={{
        background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)',
        borderRadius: 10, padding: '10px 13px', marginBottom: 20,
        fontSize: '.68rem', color: 'var(--c-blue)',
      }}>
        通常1営業日以内に返信いたします。
      </div>

      {/* Messages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {(inquiry.inquiry_messages ?? []).map((msg: any) => {
          const isPartner = msg.sender_role === 'partner'
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isPartner ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%', padding: '11px 14px', borderRadius: isPartner ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                background: isPartner ? 'var(--c-blue)' : '#fff',
                color: isPartner ? '#fff' : 'var(--txt)',
                border: isPartner ? 'none' : '1px solid var(--line)',
                fontSize: '.78rem', lineHeight: 1.65,
                wordBreak: 'break-word',
              }}>
                {msg.body}
              </div>
              <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 4, paddingLeft: isPartner ? 0 : 4, paddingRight: isPartner ? 4 : 0 }}>
                {isPartner ? 'あなた' : '管理者'} · {new Date(msg.created_at).toLocaleString('ja', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Reply form */}
      {inquiry.status !== 'closed' && (
        <form onSubmit={handleReply} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '14px 16px' }}>
          <label style={{ display: 'block', fontSize: '.7rem', fontWeight: 500, marginBottom: 8, color: 'var(--muted2)' }}>
            追記する
          </label>
          <textarea
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            placeholder="追加のメッセージを入力..."
            rows={3}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--line)', fontSize: '.78rem',
              color: 'var(--txt)', outline: 'none', resize: 'vertical',
              fontFamily: 'inherit', marginBottom: 10,
            }}
          />
          {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 8 }}>{error}</p>}
          <button
            type="submit"
            disabled={sending || !replyBody.trim()}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: (sending || !replyBody.trim()) ? 'var(--muted)' : 'var(--c-blue)',
              color: '#fff', fontSize: '.78rem', fontWeight: 500,
              cursor: (sending || !replyBody.trim()) ? 'not-allowed' : 'pointer',
            }}
          >
            {sending ? '送信中...' : '送信する'}
          </button>
        </form>
      )}

      <div style={{ height: 30 }} />
    </div>
  )
}
