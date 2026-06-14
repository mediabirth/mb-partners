'use client'
export const runtime = 'edge'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ConsoleNav from '@/components/ConsoleNav'

type Broadcast = {
  id: string
  kind: 'news' | 'tips'
  title: string
  body: string | null
  hero_path: string | null
  segment: string
  sent_at: string | null
  created_at: string
  read_count: number
  total_partners: number
}

function segmentLabel(segment: string) {
  if (segment === 'individual') return '個人パートナーのみ'
  if (segment === 'corporate') return '法人パートナーのみ'
  return '全員'
}

export default function BroadcastDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetch(`/api/console/broadcasts/${id}`)
      .then(r => r.json())
      .then(d => setBroadcast(d.broadcast))
      .finally(() => setLoading(false))
  }, [id])

  async function handleDelete() {
    if (!confirm('この配信を削除しますか？')) return
    const res = await fetch(`/api/console/broadcasts/${id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/console/broadcasts')
    } else {
      const d = await res.json()
      setToast(d.error ?? 'エラーが発生しました')
      setTimeout(() => setToast(''), 3000)
    }
  }

  const heroUrl = broadcast?.hero_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/broadcasts/${broadcast.hero_path}`
    : null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />

      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* Top bar */}
        <div style={{
          background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--line)', padding: '13px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 30,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/console/broadcasts" style={{ fontSize: '.8rem', color: 'var(--muted2)', textDecoration: 'none' }}>
              ← 一覧へ
            </Link>
            <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>配信詳細</h1>
          </div>
          {broadcast && !broadcast.sent_at && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href={`/console/broadcasts/${id}/preview`} style={{
                padding: '7px 14px', borderRadius: 8, fontSize: '.75rem', fontWeight: 700,
                background: 'var(--blue)', color: '#fff', textDecoration: 'none',
              }}>
                プレビュー・配信
              </Link>
              <button
                onClick={handleDelete}
                style={{
                  padding: '7px 14px', borderRadius: 8, fontSize: '.75rem', fontWeight: 700,
                  background: 'var(--red-bg)', color: 'var(--red)', border: 'none', cursor: 'pointer',
                }}
              >
                削除
              </button>
            </div>
          )}
        </div>

        {loading && <p style={{ padding: '28px', fontSize: '.8rem', color: 'var(--muted2)' }}>読み込み中…</p>}

        {broadcast && (
          <div style={{ padding: '28px', maxWidth: 720 }}>
            {/* Stats card */}
            {broadcast.sent_at && (
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 20px', marginBottom: 18, display: 'flex', gap: 24 }}>
                <div>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 700, marginBottom: 3 }}>配信日時</div>
                  <div style={{ fontSize: '.82rem', fontWeight: 700 }}>
                    {new Date(broadcast.sent_at).toLocaleString('ja')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 700, marginBottom: 3 }}>開封数</div>
                  <div style={{ fontSize: '.82rem', fontWeight: 700, fontFamily: 'Inter' }}>
                    {broadcast.read_count} <span style={{ color: 'var(--muted2)', fontWeight: 400 }}>/ {broadcast.total_partners}名</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 700, marginBottom: 3 }}>配信対象</div>
                  <div style={{ fontSize: '.82rem', fontWeight: 700 }}>{segmentLabel(broadcast.segment)}</div>
                </div>
              </div>
            )}

            {/* Article */}
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
              {heroUrl && (
                <img src={heroUrl} alt="" style={{ width: '100%', maxHeight: 300, objectFit: 'cover' }} />
              )}
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{
                    fontSize: '.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: broadcast.kind === 'news' ? 'var(--blue-bg)' : 'var(--amber-bg)',
                    color: broadcast.kind === 'news' ? 'var(--blue)' : 'var(--amber)',
                  }}>
                    {broadcast.kind === 'news' ? 'NEWS' : 'TIPS'}
                  </span>
                  <span style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>
                    {new Date(broadcast.created_at).toLocaleDateString('ja', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 900, lineHeight: 1.4, marginBottom: 16 }}>
                  {broadcast.title}
                </h2>
                {broadcast.body && (
                  <div style={{ fontSize: '.82rem', lineHeight: 1.85, color: 'var(--txt)', whiteSpace: 'pre-wrap' }}>
                    {broadcast.body}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1A1A2E', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: '.78rem', fontWeight: 600, zIndex: 9999 }}>
          {toast}
        </div>
      )}
    </div>
  )
}
