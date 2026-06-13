'use client'
import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import ConsoleNav from '@/components/ConsoleNav'

type Message = {
  id: string
  body: string
  sender_role: 'partner' | 'owner'
  created_at: string
}

type Inquiry = {
  id: string
  category: string
  subject: string
  status: string
  created_at: string
  updated_at: string
  partner_id: string
  partners: { id: string; code: string; profiles: { name: string; color: string } | null } | null
  inquiry_messages: Message[]
}

type Template = { id: string; label: string; body: string }

const CATEGORY_LABEL: Record<string, string> = {
  reward: '報酬', deal: '案件', account: 'アカウント', other: 'その他',
}
const STATUS_LABEL: Record<string, string> = {
  open: '未返信', replied: '返信済', closed: 'クローズ',
}

export default function ConsoleInquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [inquiry, setInquiry] = useState<Inquiry | null>(null)
  const [loading, setLoading] = useState(true)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [profile, setProfile] = useState<{ name: string; color: string } | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  async function fetchInquiry() {
    const res = await fetch(`/api/console/inquiries/${id}`)
    if (res.ok) {
      const data = await res.json()
      setInquiry(data.inquiry)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchInquiry()
    fetch('/api/console/inquiries/templates')
      .then(r => r.json())
      .then(d => setTemplates(d.templates ?? []))
    fetch('/api/console/deals')
      .then(r => r.json())
      .then(d => { if (d.profile) setProfile(d.profile) })
  }, [id])

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyBody.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/console/inquiries/${id}`, {
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
      showToast('返信を送信しました')
      await fetchInquiry()
    } catch {
      setError('送信に失敗しました')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <ConsoleNav profileName={profile?.name ?? '管理者'} profileColor={profile?.color ?? '#4733E6'} />
      <main style={{ marginLeft: 230, flex: 1, padding: '32px 32px', minWidth: 0, maxWidth: 860 }}>
        <Link href="/console/inquiries" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.74rem', color: 'var(--blue)', textDecoration: 'none', marginBottom: 20 }}>
          ← 問い合わせ一覧に戻る
        </Link>

        {loading ? (
          <p style={{ color: 'var(--muted2)', fontSize: '.82rem' }}>読み込み中...</p>
        ) : !inquiry ? (
          <p style={{ color: 'var(--red)', fontSize: '.82rem' }}>問い合わせが見つかりません。</p>
        ) : (
          <>
            {/* Header */}
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '18px 20px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <h1 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 6 }}>{inquiry.subject}</h1>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>
                      カテゴリ: {CATEGORY_LABEL[inquiry.category] ?? inquiry.category}
                    </span>
                    <span style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>
                      パートナー: {inquiry.partners?.profiles?.name ?? '-'} ({inquiry.partners?.code})
                    </span>
                    <span style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>
                      受付: {new Date(inquiry.created_at).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <span style={{
                  fontSize: '.66rem', fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                  color: inquiry.status === 'open' ? 'var(--amber)' : inquiry.status === 'replied' ? 'var(--blue)' : 'var(--muted2)',
                  background: inquiry.status === 'open' ? 'var(--amber-bg)' : inquiry.status === 'replied' ? 'var(--blue-bg2)' : 'var(--bg2)',
                  flexShrink: 0,
                }}>
                  {STATUS_LABEL[inquiry.status] ?? inquiry.status}
                </span>
              </div>
            </div>

            {/* Messages */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
              {inquiry.inquiry_messages.map(msg => {
                const isOwner = msg.sender_role === 'owner'
                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOwner ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '75%', padding: '12px 16px',
                      borderRadius: isOwner ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                      background: isOwner ? 'var(--blue)' : '#fff',
                      color: isOwner ? '#fff' : 'var(--txt)',
                      border: isOwner ? 'none' : '1px solid var(--line)',
                      fontSize: '.8rem', lineHeight: 1.65, wordBreak: 'break-word',
                    }}>
                      {msg.body}
                    </div>
                    <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 5 }}>
                      {isOwner ? '管理者' : inquiry.partners?.profiles?.name ?? 'パートナー'} · {new Date(msg.created_at).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Reply form */}
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '18px 20px' }}>
              <h3 style={{ fontSize: '.82rem', fontWeight: 700, marginBottom: 12, color: 'var(--txt)' }}>返信する</h3>

              {/* Template buttons */}
              {templates.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: '.66rem', color: 'var(--muted2)', marginBottom: 8 }}>定型文:</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {templates.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setReplyBody(t.body)}
                        style={{
                          padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)',
                          background: 'var(--bg2)', fontSize: '.68rem', color: 'var(--muted2)',
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleReply}>
                <textarea
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  placeholder="返信内容を入力..."
                  rows={4}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--line)', fontSize: '.8rem',
                    color: 'var(--txt)', outline: 'none', resize: 'vertical',
                    fontFamily: 'inherit', marginBottom: 12,
                  }}
                />
                {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 10 }}>{error}</p>}
                <button
                  type="submit"
                  disabled={sending || !replyBody.trim()}
                  style={{
                    padding: '10px 24px', borderRadius: 8, border: 'none',
                    background: (sending || !replyBody.trim()) ? 'var(--muted)' : 'var(--blue)',
                    color: '#fff', fontSize: '.8rem', fontWeight: 700,
                    cursor: (sending || !replyBody.trim()) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sending ? '送信中...' : '返信を送信する'}
                </button>
              </form>
            </div>
          </>
        )}

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--txt)', color: '#fff', borderRadius: 10,
            padding: '10px 22px', fontSize: '.78rem', fontWeight: 600, zIndex: 100,
            boxShadow: '0 4px 24px rgba(14,14,20,.18)',
          }}>
            {toast}
          </div>
        )}
      </main>
    </div>
  )
}
