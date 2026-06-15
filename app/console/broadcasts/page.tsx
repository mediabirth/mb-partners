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
          <div>
            <div className="eyebrow">CONSOLE</div>
            <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>配信</h1>
          </div>
          <Link href="/console/broadcasts/new" className="btn btn-p" style={{
            fontSize: '.75rem', fontWeight: 700, padding: '8px 16px', borderRadius: 9,
            background: 'var(--blue)', color: '#fff', textDecoration: 'none',
          }}>
            + 新規作成
          </Link>
        </div>

        <div className="page-anim" style={{ padding: '28px', maxWidth: 860 }}>
          {loading && (
            <div className="stagger">
              {[0, 1, 2].map(i => (
                <div key={i} className="skeleton" style={{ height: 72, borderRadius: 14, marginBottom: 12 }} />
              ))}
            </div>
          )}
          {!loading && broadcasts.length === 0 && (
            <div style={{
              background: '#fff', border: '1px solid var(--line)', borderRadius: 16,
              padding: '48px 28px', textAlign: 'center',
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, margin: '0 auto 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--blue-bg)', color: 'var(--blue)',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 11v3a1 1 0 0 0 1 1h2.5L11 19V5L6.5 9H4a1 1 0 0 0-1 1Z" />
                  <path d="M15.5 8.5a4 4 0 0 1 0 7" />
                  <path d="M18.5 6a7 7 0 0 1 0 12" />
                </svg>
              </div>
              <div style={{ fontSize: '.95rem', fontWeight: 800, marginBottom: 6 }}>
                まだ配信がありません
              </div>
              <div style={{ fontSize: '.76rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 20 }}>
                NEWSやTIPSをパートナーへ届けましょう。<br />
                最初の配信を作成して、つながりを深めませんか？
              </div>
              <Link href="/console/broadcasts/new" className="btn btn-p" style={{
                fontSize: '.78rem', fontWeight: 700, padding: '10px 22px', borderRadius: 10,
                background: 'var(--blue)', color: '#fff', textDecoration: 'none', display: 'inline-block',
              }}>
                + 新規作成
              </Link>
            </div>
          )}

          {!loading && broadcasts.length > 0 && (
          <div className="stagger">
          {broadcasts.map(b => (
            <Link key={b.id} href={`/console/broadcasts/${b.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card-hover lift" style={{
                background: '#fff', border: '1px solid var(--line)', borderRadius: 14,
                padding: '16px 20px', marginBottom: 12, display: 'flex',
                alignItems: 'center', gap: 14, cursor: 'pointer',
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
                      <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', padding: '3px 10px', borderRadius: 20, marginBottom: 5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)' }} />
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
                    <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--amber)', background: 'var(--amber-bg)', padding: '3px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--amber)' }} />
                      下書き
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
          </div>
          )}
        </div>
      </div>
    </div>
  )
}
