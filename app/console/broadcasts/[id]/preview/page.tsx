'use client'
export const runtime = 'edge'
import { useEffect, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
}

function segmentLabel(segment: string) {
  if (segment === 'individual') return '個人パートナーのみ'
  if (segment === 'corporate') return '法人パートナーのみ'
  return '全員'
}

export default function BroadcastPreviewPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetch(`/api/console/broadcasts/${id}`)
      .then(r => r.json())
      .then(d => setBroadcast(d.broadcast))
      .finally(() => setLoading(false))
  }, [id])

  function handleSend() {
    if (!confirm('この記事を配信しますか？配信後は取り消せません。')) return
    startTransition(async () => {
      const res = await fetch(`/api/console/broadcasts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      })
      const data = await res.json()
      if (res.ok) {
        setToast(`配信しました（${data.sent_to}名）`)
        setTimeout(() => router.push(`/console/broadcasts/${id}`), 1500)
      } else {
        setToast(data.error ?? 'エラーが発生しました')
      }
    })
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
            <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.8rem', color: 'var(--muted2)' }}>
              ← 戻る
            </button>
            <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>プレビュー</h1>
          </div>

          {broadcast && !broadcast.sent_at && (
            <button
              onClick={handleSend}
              disabled={pending}
              style={{
                padding: '8px 20px', borderRadius: 8, fontSize: '.78rem', fontWeight: 700,
                background: pending ? 'var(--muted)' : 'var(--blue)',
                color: '#fff', border: 'none', cursor: pending ? 'not-allowed' : 'pointer',
              }}
            >
              {pending ? '配信中…' : '配信する'}
            </button>
          )}
          {broadcast?.sent_at && (
            <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', padding: '5px 12px', borderRadius: 20 }}>
              配信済み
            </span>
          )}
        </div>

        {loading && <p style={{ padding: '28px', fontSize: '.8rem', color: 'var(--muted2)' }}>読み込み中…</p>}

        {broadcast && (
          <div style={{ padding: '28px', maxWidth: 720 }}>
            {/* Meta info */}
            <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: '.7rem', color: 'var(--amber)' }}>
              プレビュー — 配信対象: {segmentLabel(broadcast.segment)}
            </div>

            {/* Article card (partner view) */}
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
