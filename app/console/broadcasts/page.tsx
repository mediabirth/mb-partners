'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import ConsoleNav from '@/components/ConsoleNav'

type Broadcast = {
  id: string
  kind: 'news' | 'tips'
  title: string
  segment: string
  sent_at: string | null
  created_at: string
  read_count: number
}

function kindBadge(kind: string) {
  const isNews = kind === 'news'
  return (
    <span style={{
      fontSize: '.58rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20,
      background: isNews ? 'var(--blue-bg)' : 'var(--amber-bg)',
      color: isNews ? 'var(--blue)' : 'var(--amber)',
    }}>
      {isNews ? 'NEWS' : 'TIPS'}
    </span>
  )
}

function segmentLabel(segment: string) {
  if (segment === 'individual') return '個人のみ'
  if (segment === 'corporate') return '法人のみ'
  return '全員'
}

export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [profile, setProfile] = useState<{ name: string; color: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/console/broadcasts')
      .then(r => r.json())
      .then(d => setBroadcasts(d.broadcasts ?? []))
      .finally(() => setLoading(false))

    fetch('/api/console/deals')
      .then(r => r.json())
      .then(d => setProfile(d.profile))
  }, [])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName={profile?.name ?? '管理者'} profileColor={profile?.color ?? '#0E0E14'} />

      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* Top bar */}
        <div style={{
          background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--line)', padding: '13px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 30,
        }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>配信</h1>
          <Link href="/console/broadcasts/new" style={{
            fontSize: '.75rem', fontWeight: 700, padding: '7px 14px', borderRadius: 8,
            background: 'var(--blue)', color: '#fff', textDecoration: 'none',
          }}>
            + 新規作成
          </Link>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 860 }}>
          {loading && <p style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>読み込み中…</p>}
          {!loading && broadcasts.length === 0 && (
            <p style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>まだ配信がありません。</p>
          )}

          {broadcasts.map(b => (
            <Link key={b.id} href={`/console/broadcasts/${b.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: '#fff', border: '1px solid var(--line)', borderRadius: 12,
                padding: '14px 18px', marginBottom: 10, display: 'flex',
                alignItems: 'center', gap: 14, cursor: 'pointer',
                transition: 'border-color .15s',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {kindBadge(b.kind)}
                    <span style={{ fontSize: '.6rem', color: 'var(--muted2)', background: 'var(--bg2)', padding: '1px 6px', borderRadius: 10 }}>
                      {segmentLabel(b.segment)}
                    </span>
                  </div>
                  <div style={{ fontSize: '.85rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {b.title}
                  </div>
                  <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 3 }}>
                    作成: {new Date(b.created_at).toLocaleDateString('ja', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {b.sent_at ? (
                    <>
                      <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', padding: '2px 8px', borderRadius: 20, marginBottom: 4, display: 'inline-block' }}>
                        配信済
                      </div>
                      <div style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>
                        {new Date(b.sent_at).toLocaleDateString('ja', { month: 'short', day: 'numeric' })}
                      </div>
                      <div style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>
                        開封 {b.read_count}件
                      </div>
                    </>
                  ) : (
                    <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted2)', background: 'var(--bg2)', padding: '2px 8px', borderRadius: 20 }}>
                      未配信
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
