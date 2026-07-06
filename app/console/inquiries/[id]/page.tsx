'use client'
export const runtime = 'edge'
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
const CATEGORY_COLOR: Record<string, { color: string; bg: string }> = {
  reward:  { color: 'var(--green)', bg: 'var(--green-bg)' },
  deal:    { color: 'var(--c-blue)',  bg: 'var(--blue-bg2)' },
  account: { color: 'var(--amber)', bg: 'var(--amber-bg)' },
  other:   { color: 'var(--muted2)', bg: 'var(--bg2)' },
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

  const statusColor = inquiry
    ? (inquiry.status === 'open' ? 'var(--amber)' : inquiry.status === 'replied' ? 'var(--c-blue)' : 'var(--muted2)')
    : 'var(--muted2)'
  const statusBg = inquiry
    ? (inquiry.status === 'open' ? 'var(--amber-bg)' : inquiry.status === 'replied' ? 'var(--blue-bg2)' : 'var(--bg2)')
    : 'var(--bg2)'

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <ConsoleNav profileName={profile?.name ?? '管理者'} profileColor={profile?.color ?? '#4733E6'} />
      <main className="page-anim" style={{ marginLeft: 230, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {loading ? (
          <div style={{ padding: '32px' }}>
            <p style={{ color: 'var(--muted2)', fontSize: '.82rem' }}>読み込み中…</p>
          </div>
        ) : !inquiry ? (
          <div style={{ padding: '32px' }}>
            <Link href="/console/inquiries" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.74rem', color: 'var(--c-blue)', textDecoration: 'none', marginBottom: 20 }}>
              ← 問い合わせ一覧に戻る
            </Link>
            <p style={{ color: 'var(--red)', fontSize: '.82rem' }}>問い合わせが見つかりません。</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <header style={{
              flexShrink: 0, background: '#fff', borderBottom: '0.5px solid var(--line)',
              padding: '14px 28px',
            }}>
              <Link href="/console/inquiries" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.72rem', color: 'var(--c-blue)', textDecoration: 'none', marginBottom: 10 }}>
                ← 問い合わせ一覧に戻る
              </Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {inquiry.partners?.profiles && (
                  <span style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: inquiry.partners.profiles.color, color: '#fff',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.78rem', fontWeight: 500, flexShrink: 0,
                  }}>
                    {inquiry.partners.profiles.name[0]}
                  </span>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '.92rem', fontWeight: 500, color: 'var(--txt)' }}>
                      {inquiry.partners?.profiles?.name ?? '-'}
                    </span>
                    <span style={{ fontSize: '.64rem', color: 'var(--muted2)', opacity: .8 }}>({inquiry.partners?.code})</span>
                    <span style={{
                      fontSize: '.62rem', fontWeight: 500, padding: '2px 9px', borderRadius: 4,
                      color: (CATEGORY_COLOR[inquiry.category] ?? CATEGORY_COLOR.other).color,
                      background: (CATEGORY_COLOR[inquiry.category] ?? CATEGORY_COLOR.other).bg,
                    }}>
                      {CATEGORY_LABEL[inquiry.category] ?? inquiry.category}
                    </span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: '.62rem', fontWeight: 500, padding: '2px 9px', borderRadius: 4,
                      color: statusColor, background: statusBg,
                    }}>
                      <span className="status-dot" style={{ background: statusColor }} />
                      {STATUS_LABEL[inquiry.status] ?? inquiry.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {inquiry.subject}
                  </div>
                </div>
              </div>
            </header>

            {/* Messages (scrollable) */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', background: 'var(--bg2)' }}>
              <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720, margin: '0 auto' }}>
                {/* Opening message: the inquiry subject (partner side) — always shown so the thread is never empty */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.6rem', color: 'var(--muted2)', marginBottom: 4 }}>
                    <span style={{ fontWeight: 500, color: 'var(--muted)' }}>{inquiry.partners?.profiles?.name ?? 'パートナー'}</span>
                    <span style={{ opacity: .8 }}>
                      {new Date(inquiry.created_at).toLocaleString('ja', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ fontSize: '.56rem', fontWeight: 500, padding: '1px 7px', borderRadius: 4, color: (CATEGORY_COLOR[inquiry.category] ?? CATEGORY_COLOR.other).color, background: (CATEGORY_COLOR[inquiry.category] ?? CATEGORY_COLOR.other).bg }}>
                      {CATEGORY_LABEL[inquiry.category] ?? inquiry.category}
                    </span>
                  </div>
                  <div style={{
                    maxWidth: '78%', padding: '10px 14px', borderRadius: '16px 16px 16px 3px',
                    background: '#fff', color: 'var(--txt)', border: '0.5px solid var(--line)',
                    boxShadow: '0 1px 2px rgba(14,14,20,.04)',
                    fontSize: '.8rem', lineHeight: 1.6, wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontWeight: 500,
                  }}>
                    {inquiry.subject}
                  </div>
                </div>
                {inquiry.inquiry_messages.map(msg => {
                  const isOwner = msg.sender_role === 'owner'
                  const senderName = isOwner ? '管理者' : inquiry.partners?.profiles?.name ?? 'パートナー'
                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOwner ? 'flex-end' : 'flex-start', maxWidth: '100%' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: '.6rem', color: 'var(--muted2)', marginBottom: 4,
                        flexDirection: isOwner ? 'row-reverse' : 'row',
                      }}>
                        <span style={{ fontWeight: 500, color: 'var(--muted)' }}>{senderName}</span>
                        <span style={{ opacity: .8 }}>
                          {new Date(msg.created_at).toLocaleString('ja', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div style={{
                        maxWidth: '78%', padding: '10px 14px',
                        borderRadius: isOwner ? '16px 16px 3px 16px' : '16px 16px 16px 3px',
                        background: isOwner ? 'var(--c-blue)' : '#fff',
                        color: isOwner ? '#fff' : 'var(--txt)',
                        border: isOwner ? 'none' : '0.5px solid var(--line)',
                        boxShadow: isOwner ? '0 1px 2px rgba(27,26,23,.16)' : '0 1px 2px rgba(14,14,20,.04)',
                        fontSize: '.8rem', lineHeight: 1.6, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                      }}>
                        {msg.body}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Sticky composer */}
            <div style={{
              flexShrink: 0, background: '#fff', borderTop: '0.5px solid var(--line)',
              padding: '12px 28px 16px',
            }}>
              <div style={{ maxWidth: 720, margin: '0 auto' }}>
                {/* Template chips */}
                {templates.length > 0 && (
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
                    {templates.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        className="chip lift"
                        onClick={() => setReplyBody(t.body)}
                        style={{
                          padding: '4px 11px', borderRadius: 4, border: '0.5px solid var(--line)',
                          background: 'var(--bg2)', fontSize: '.66rem', color: 'var(--muted)',
                          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}

                {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 8 }}>{error}</p>}

                <form onSubmit={handleReply} style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                  <textarea
                    value={replyBody}
                    onChange={e => setReplyBody(e.target.value)}
                    placeholder="返信内容を入力…"
                    rows={2}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 22,
                      border: '0.5px solid var(--line)', fontSize: '.8rem',
                      color: 'var(--txt)', outline: 'none', resize: 'none',
                      fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 140,
                    }}
                  />
                  <button
                    type="submit"
                    className="ui-btn ui-btn--primary ui-btn--lg"
                    disabled={sending || !replyBody.trim()}
                    style={{
                      padding: '10px 22px', borderRadius: 22, border: 'none',
                      background: (sending || !replyBody.trim()) ? 'var(--muted)' : 'var(--c-blue)',
                      color: '#fff', fontSize: '.8rem', fontWeight: 500, flexShrink: 0,
                      cursor: (sending || !replyBody.trim()) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {sending ? '送信中…' : '送信'}
                  </button>
                </form>
              </div>
            </div>
          </>
        )}

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--txt)', color: '#fff', borderRadius: 10,
            padding: '10px 22px', fontSize: '.78rem', fontWeight: 500, zIndex: 100,
            boxShadow: '0 4px 24px rgba(14,14,20,.18)',
          }}>
            {toast}
          </div>
        )}
      </main>
    </div>
  )
}
