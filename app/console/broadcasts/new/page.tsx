'use client'
import { useState, useTransition } from 'react'
import PageGuide from '@/components/PageGuide'
import { GUIDE_BROADCAST_NEW } from '@/lib/console-guides'
import { useRouter } from 'next/navigation'
import ConsoleNav from '@/components/ConsoleNav'
import { createClient } from '@/lib/supabase/client'

export default function NewBroadcastPage() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [kind, setKind] = useState<'news' | 'tips'>('news')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [segment, setSegment] = useState<'all' | 'individual' | 'corporate'>('all')
  const [heroFile, setHeroFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('タイトルを入力してください'); return }
    setError('')

    startTransition(async () => {
      let heroPath: string | null = null

      // Upload hero image if selected
      if (heroFile) {
        const supabase = createClient()
        const ext = heroFile.name.split('.').pop()
        const path = `hero/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('broadcasts')
          .upload(path, heroFile, { upsert: true })
        if (uploadErr) {
          setError(`画像のアップロードに失敗しました: ${uploadErr.message}`)
          return
        }
        heroPath = path
      }

      const res = await fetch('/api/console/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title, body, segment, hero_path: heroPath }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '配信を作成できませんでした。時間をおいて再度お試しください')
        return
      }

      router.push(`/console/broadcasts/${data.broadcast.id}/preview`)
    })
  }

  const labelStyle = { fontSize: '.72rem', fontWeight: 500, color: 'var(--muted2)', display: 'block', marginBottom: 5 }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '0.5px solid var(--line)', fontSize: '.82rem',
    fontFamily: 'inherit', outline: 'none',
  }
  const fieldStyle = { marginBottom: 22 }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />

      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* Top bar */}
        <div style={{
          background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)',
          borderBottom: '0.5px solid var(--line)', padding: '13px 28px',
          display: 'flex', alignItems: 'center', gap: 12,
          position: 'sticky', top: 0, zIndex: 30,
        }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.8rem', color: 'var(--muted2)' }}>
            ← 戻る
          </button>
          <div>
            <div className="eyebrow">配信</div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><h1 style={{ fontSize: '1rem', fontWeight: 500 }}>新規配信作成</h1><PageGuide data={GUIDE_BROADCAST_NEW} /></span>
          </div>
        </div>

        <div className="page-anim" style={{ padding: '28px', maxWidth: 640 }}>
          <form onSubmit={handleSubmit} style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 16, padding: '28px' }}>

            {/* Kind */}
            <div style={fieldStyle}>
              <label style={labelStyle}>種別</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['news', 'tips'] as const).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    style={{
                      padding: '7px 20px', borderRadius: 8, fontSize: '.78rem', fontWeight: 500,
                      cursor: 'pointer', border: '2px solid',
                      borderColor: kind === k ? 'var(--c-blue)' : 'var(--line)',
                      background: kind === k ? 'var(--blue-bg)' : '#fff',
                      color: kind === k ? 'var(--c-blue)' : 'var(--muted2)',
                    }}
                  >
                    {k === 'news' ? 'NEWS' : 'TIPS'}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div style={fieldStyle}>
              <label style={labelStyle}>タイトル *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="タイトルを入力"
                style={inputStyle}
                required
              />
            </div>

            {/* Body */}
            <div style={fieldStyle}>
              <label style={labelStyle}>本文</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="本文を入力（任意）"
                rows={8}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7 }}
              />
            </div>

            {/* Segment */}
            <div style={fieldStyle}>
              <label style={labelStyle}>配信対象</label>
              <select
                value={segment}
                onChange={e => setSegment(e.target.value as 'all' | 'individual' | 'corporate')}
                style={inputStyle}
              >
                <option value="all">全員</option>
                <option value="individual">個人パートナーのみ</option>
                <option value="corporate">法人パートナーのみ</option>
              </select>
            </div>

            {/* Hero image */}
            <div style={fieldStyle}>
              <label style={labelStyle}>ヒーロー画像（任意）</label>
              <input
                type="file"
                accept="image/*"
                onChange={e => setHeroFile(e.target.files?.[0] ?? null)}
                style={{ fontSize: '.78rem' }}
              />
              {heroFile && (
                <div style={{ marginTop: 6, fontSize: '.7rem', color: 'var(--muted2)' }}>
                  選択: {heroFile.name}
                </div>
              )}
            </div>

            {error && (
              <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: 'var(--red-bg)', color: 'var(--red)', fontSize: '.75rem' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className={pending ? '' : 'ui-btn ui-btn--primary'}
              style={{
                width: '100%', padding: '13px', borderRadius: 10,
                background: pending ? 'var(--muted)' : 'var(--c-blue)',
                color: '#fff', fontWeight: 500, fontSize: '.85rem',
                border: 'none', cursor: pending ? 'not-allowed' : 'pointer',
              }}
            >
              {pending ? '保存中…' : '保存してプレビューへ'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
