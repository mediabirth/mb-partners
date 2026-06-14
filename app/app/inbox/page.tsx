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
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      )}
    </span>
  )
}

function BroadcastIcon({ kind }: { kind: 'news' | 'tips' }) {
  return (
    <span style={{
      width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      background: kind === 'news' ? 'var(--bg2)' : 'var(--amber-bg)',
      color: kind === 'news' ? 'var(--muted2)' : 'var(--amber)',
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
        {kind === 'news'
          ? <><path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16"/><circle cx="5" cy="19" r="1.6"/></>
          : <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.7.5 1 1.3 1 2.1h5c0-.8.3-1.6 1-2.1A6 6 0 0012 3z"/>
        }
      </svg>
    </span>
  )
}

const HERO_COLORS: Record<string, string> = {
  news: 'linear-gradient(130deg,#4733E6,#8A7BFF)',
  tips: 'linear-gradient(130deg,#C07A12,#EDB45C)',
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('ja', { month: 'numeric', day: 'numeric' })
const fmtFull = (iso: string) => new Date(iso).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function InboxPage() {
  const [notifs,     setNotifs]     = useState<Notification[]>([])
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [tab,        setTab]        = useState<'all' | 'personal' | 'news' | 'tips'>('all')
  const [loading,    setLoading]    = useState(true)
  const [detail,     setDetail]     = useState<Broadcast | null>(null)

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

  // Broadcast detail view
  if (detail) {
    const heroColor = HERO_COLORS[detail.kind] ?? HERO_COLORS.news
    return (
      <div>
        <button onClick={() => setDetail(null)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: '.7rem', color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 500,
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          ← 通知一覧
        </button>
        <div style={{ padding: '8px 22px 24px' }}>
          <div style={{ fontSize: '.5rem', fontFamily: 'Inter', fontWeight: 600, letterSpacing: '.2em', textTransform: 'uppercase', marginBottom: 6, color: detail.kind === 'tips' ? 'var(--amber)' : 'var(--muted2)' }}>
            {detail.kind === 'news' ? 'お知らせ' : 'お役立ち'}
          </div>
          <h1 style={{ fontSize: '1.18rem', fontWeight: 900, marginBottom: 4, lineHeight: 1.5 }}>{detail.title}</h1>
          <span style={{ fontSize: '.62rem', color: 'var(--muted)', marginBottom: 14, display: 'block' }}>
            {detail.sent_at ? fmtFull(detail.sent_at) : ''}
          </span>
          {/* Hero banner */}
          <div style={{
            height: 150, borderRadius: 14, marginBottom: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden',
            background: heroColor,
          }}>
            <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" opacity=".95">
              {detail.kind === 'news'
                ? <><path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16"/><circle cx="5" cy="19" r="1.6"/></>
                : <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.7.5 1 1.3 1 2.1h5c0-.8.3-1.6 1-2.1A6 6 0 0012 3z"/>
              }
            </svg>
            <div style={{ position: 'absolute', right: -30, top: -30, width: 110, height: 110, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,.3)' }}/>
          </div>
          {detail.body && (
            <div style={{ fontSize: '.78rem', lineHeight: 1.95, color: '#2E2E38', marginTop: 16, whiteSpace: 'pre-wrap' }}>
              {detail.body}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ padding: '22px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: '.98rem', fontWeight: 700 }}>通知</h2>
          {(tab === 'all' || tab === 'personal') && unreadCount > 0 && (
            <button onClick={markAllRead} style={{ fontSize: '.6rem', color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              すべて既読にする
            </button>
          )}
        </div>

        {/* Tabs — prototype has: すべて / あなた宛 / お知らせ / お役立ち */}
        <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 10, padding: 4, marginBottom: 14 }}>
          {([
            ['all', 'すべて'],
            ['personal', 'あなた宛'],
            ['news', 'お知らせ'],
            ['tips', 'お役立ち'],
          ] as const).map(([val, lbl]) => (
            <button key={val} onClick={() => setTab(val)} style={{
              flex: 1, border: 'none', padding: '9px 2px', borderRadius: 8,
              fontSize: '.7rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              color: tab === val ? 'var(--txt)' : 'var(--muted2)',
              background: tab === val ? '#fff' : 'transparent',
              boxShadow: tab === val ? '0 2px 8px rgba(14,14,20,.08)' : 'none',
              transition: 'all .25s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              {lbl}
              {val === 'personal' && unreadCount > 0 && (
                <span style={{ background: 'var(--blue)', color: '#fff', borderRadius: 99, fontSize: '.52rem', padding: '1px 5px', fontFamily: 'Inter', fontWeight: 700 }}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* All: mix of personal notifications + broadcasts */}
      {tab === 'all' && (
        <>
          {notifs.length === 0 && broadcasts.length === 0 ? (
            <p style={{ padding: '40px 20px', fontSize: '.7rem', color: 'var(--muted2)', textAlign: 'center' }}>通知はありません</p>
          ) : (
            <>
              {notifs.map(n => (
                <NotifRow key={n.id} n={n} onRead={() => !n.read_at && markRead(n.id)} />
              ))}
              {broadcasts.map(b => (
                <BroadcastRow key={b.id} b={b} onClick={() => setDetail(b)} />
              ))}
            </>
          )}
        </>
      )}

      {/* Personal */}
      {tab === 'personal' && (notifs.length === 0 ? (
        <p style={{ padding: '40px 20px', fontSize: '.7rem', color: 'var(--muted2)', textAlign: 'center' }}>通知はありません</p>
      ) : notifs.map(n => (
        <NotifRow key={n.id} n={n} onRead={() => !n.read_at && markRead(n.id)} />
      )))}

      {/* News */}
      {tab === 'news' && (
        broadcasts.filter(b => b.kind === 'news').length === 0 ? (
          <p style={{ padding: '40px 20px', fontSize: '.7rem', color: 'var(--muted2)', textAlign: 'center' }}>お知らせはありません</p>
        ) : broadcasts.filter(b => b.kind === 'news').map(b => (
          <BroadcastRow key={b.id} b={b} onClick={() => setDetail(b)} />
        ))
      )}

      {/* Tips */}
      {tab === 'tips' && (
        broadcasts.filter(b => b.kind === 'tips').length === 0 ? (
          <p style={{ padding: '40px 20px', fontSize: '.7rem', color: 'var(--muted2)', textAlign: 'center' }}>お役立ち情報はありません</p>
        ) : broadcasts.filter(b => b.kind === 'tips').map(b => (
          <BroadcastRow key={b.id} b={b} onClick={() => setDetail(b)} />
        ))
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}

function NotifRow({ n, onRead }: { n: Notification; onRead: () => void }) {
  return (
    <button onClick={onRead} className="lift" style={{
      display: 'flex', gap: 12, padding: '14px 20px', width: '100%', textAlign: 'left',
      background: n.read_at ? 'var(--bg)' : 'var(--blue-bg2)',
      borderLeft: n.read_at ? '3px solid transparent' : '3px solid var(--blue)',
      borderTop: 'none', borderRight: 'none',
      borderBottom: '1px solid var(--line)',
      cursor: n.read_at ? 'default' : 'pointer',
    }}>
      <NotifIcon type={n.ref?.type} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: '.78rem', display: 'block', marginBottom: 2, fontWeight: n.read_at ? 400 : 700 }}>
          {n.title}
          {!n.read_at && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--blue)', marginLeft: 7, verticalAlign: 1, animation: 'pulseDot 2.6s ease-in-out infinite' }}/>}
        </b>
        {n.body && <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.body}</p>}
      </div>
      <span style={{ fontSize: '.56rem', color: 'var(--muted)', flexShrink: 0 }}>{fmt(n.created_at)}</span>
    </button>
  )
}

function BroadcastRow({ b, onClick }: { b: Broadcast; onClick: () => void }) {
  const hasDetail = !!(b.body)
  return (
    <div onClick={hasDetail ? onClick : undefined} className="lift" style={{
      display: 'flex', gap: 12, padding: '14px 20px',
      borderBottom: '1px solid var(--line)', alignItems: 'flex-start',
      cursor: hasDetail ? 'pointer' : 'default',
    }}>
      <BroadcastIcon kind={b.kind} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className="chip" style={{ marginBottom: 4, background: b.kind === 'news' ? 'var(--bg2)' : 'var(--amber-bg)', color: b.kind === 'news' ? 'var(--muted2)' : 'var(--amber)' }}>
          {b.kind === 'news' ? 'お知らせ' : 'お役立ち'}
        </span>
        <b style={{ fontSize: '.78rem', display: 'block', marginBottom: 2 }}>{b.title}</b>
        {b.body && <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.body}</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {b.sent_at && <span style={{ fontSize: '.56rem', color: 'var(--muted)' }}>{fmt(b.sent_at)}</span>}
        {hasDetail && <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>›</span>}
      </div>
    </div>
  )
}
