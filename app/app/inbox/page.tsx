'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Notification = {
  id: string
  title: string
  body: string | null
  read_at: string | null
  created_at: string
  ref: { type: string; [k: string]: unknown } | null
}

type Broadcast = {
  id: string
  kind: 'news' | 'tips'
  title: string
  body: string | null
  sent_at: string | null
}

function NotifIcon({ type }: { type?: string }) {
  const isPayout  = type === 'payout' || type === 'payout_paid'
  const isInquiry = type === 'inquiry_reply'
  const isDeal    = type === 'deal'
  const bg    = isPayout ? 'var(--green-bg)' : isInquiry ? 'var(--amber-bg)' : 'var(--blue-bg)'
  const color = isPayout ? 'var(--green)'    : isInquiry ? 'var(--amber)'    : 'var(--blue)'
  return (
    <span style={{ width: 34, height: 34, borderRadius: '50%', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {isPayout ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
        </svg>
      ) : isInquiry ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M20 6H4l8 7 8-7zM4 6v12h16V6"/>
        </svg>
      )}
    </span>
  )
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('ja', { month: 'numeric', day: 'numeric' })

export default function InboxPage() {
  const [notifs,     setNotifs]     = useState<Notification[]>([])
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [tab,        setTab]        = useState<'personal' | 'news'>('personal')
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    const sb = createClient()
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: partner } = await sb.from('partners').select('id').eq('profile_id', user.id).single()
      if (!partner) return
      const [nRes, bRes] = await Promise.all([
        sb.from('notifications')
          .select('id, title, body, read_at, created_at, ref')
          .eq('partner_id', partner.id)
          .order('created_at', { ascending: false })
          .limit(50),
        sb.from('broadcasts')
          .select('id, kind, title, body, sent_at')
          .not('sent_at', 'is', null)
          .order('sent_at', { ascending: false })
          .limit(30),
      ])
      setNotifs(nRes.data ?? [])
      setBroadcasts(bRes.data ?? [])
      setLoading(false)
    })()
  }, [])

  const unreadCount = notifs.filter(n => !n.read_at).length

  const markRead = useCallback(async (id: string) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    await fetch('/api/notifications/read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    })
  }, [])

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString()
    setNotifs(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? now })))
    await fetch('/api/notifications/read', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }, [])

  if (loading) return (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: '.7rem' }}>読み込み中…</div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ padding: '22px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: '.98rem', fontWeight: 700 }}>通知</h2>
          {tab === 'personal' && unreadCount > 0 && (
            <button onClick={markAllRead} style={{ fontSize: '.6rem', color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              すべて既読にする
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
          {(['personal', 'news'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '6px 0 10px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '.72rem', fontWeight: tab === t ? 700 : 400,
              color: tab === t ? 'var(--blue)' : 'var(--muted2)',
              borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
              {t === 'personal' ? 'あなた宛' : 'お知らせ'}
              {t === 'personal' && unreadCount > 0 && (
                <span style={{ background: 'var(--blue)', color: '#fff', borderRadius: 99, fontSize: '.52rem', padding: '1px 5px', fontFamily: 'Inter', fontWeight: 700 }}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* あなた宛 */}
      {tab === 'personal' && (notifs.length === 0 ? (
        <p style={{ padding: '40px 20px', fontSize: '.7rem', color: 'var(--muted2)', textAlign: 'center' }}>通知はありません</p>
      ) : (
        notifs.map(n => (
          <button key={n.id} onClick={() => !n.read_at && markRead(n.id)} style={{
            display: 'flex', gap: 12, padding: '14px 20px', width: '100%', textAlign: 'left',
            background: n.read_at ? 'var(--bg)' : 'var(--blue-bg2)',
            border: 'none', borderBottom: '1px solid var(--line)', cursor: n.read_at ? 'default' : 'pointer',
          }}>
            <NotifIcon type={n.ref?.type} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: '.78rem', display: 'block', marginBottom: 2, fontWeight: n.read_at ? 400 : 700 }}>{n.title}</b>
              {n.body && <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.body}</p>}
            </div>
            <span style={{ fontSize: '.56rem', color: 'var(--muted)', flexShrink: 0 }}>{fmt(n.created_at)}</span>
          </button>
        ))
      ))}

      {/* お知らせ */}
      {tab === 'news' && (broadcasts.length === 0 ? (
        <p style={{ padding: '40px 20px', fontSize: '.7rem', color: 'var(--muted2)', textAlign: 'center' }}>お知らせはありません</p>
      ) : (
        broadcasts.map(b => (
          <div key={b.id} style={{ display: 'flex', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--line)', alignItems: 'flex-start' }}>
            <span style={{
              width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: b.kind === 'news' ? 'var(--bg2)' : 'var(--amber-bg)',
              color:      b.kind === 'news' ? 'var(--muted2)' : 'var(--amber)',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                {b.kind === 'news'
                  ? <><path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16"/><circle cx="5" cy="19" r="1.6"/></>
                  : <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                }
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.5rem', fontFamily: 'Inter', fontWeight: 600, letterSpacing: '.2em', marginBottom: 3, color: b.kind === 'news' ? 'var(--muted2)' : 'var(--amber)' }}>
                {b.kind === 'news' ? 'NEWS' : 'TIPS'}
              </div>
              <b style={{ fontSize: '.78rem', display: 'block', marginBottom: 2 }}>{b.title}</b>
              {b.body && <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.body}</p>}
            </div>
            {b.sent_at && <span style={{ fontSize: '.56rem', color: 'var(--muted)', flexShrink: 0 }}>{fmt(b.sent_at)}</span>}
          </div>
        ))
      ))}

      <div style={{ height: 80 }} />
    </div>
  )
}
