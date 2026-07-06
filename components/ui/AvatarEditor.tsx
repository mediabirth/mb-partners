'use client'
/**
 * F-4：アバター編集（3サーフェス共通の作法）。クリックで画像アップロード／長押し不要・削除でイニシャル＋色に戻す。
 * endpoint に各サーフェスの /api/<surface>/avatar を渡す（本人のみ・お金系非接触）。表示は共有 Avatar。
 */
import React, { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Avatar from './Avatar'

export default function AvatarEditor({ name, color, src, size = 56, endpoint, onChange }: {
  name?: string | null
  color?: string | null
  src?: string | null
  size?: number
  endpoint: string
  onChange?: (url: string | null) => void   // additive：保存後に呼ばれる（省略時は従来通り）
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [cur, setCur] = useState<string | null>(src ?? null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setMsg(''); setOk('')
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(endpoint, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.avatar_url) {
        setCur(data.avatar_url); setOk('保存しました'); setTimeout(() => setOk(''), 2200)
        onChange?.(data.avatar_url)
        // A6: ヘッダ等のサーバ描画アバターへ即時反映（server components を再取得）
        router.refresh()
      }
      else setMsg(data.error ?? 'アップロードに失敗しました')
    } catch { setMsg('アップロードに失敗しました') } finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }
  async function remove() {
    setBusy(true); setMsg(''); setOk('')
    try {
      const res = await fetch(endpoint, { method: 'DELETE' })
      if (res.ok) { setCur(null); onChange?.(null); router.refresh() } else setMsg('削除に失敗しました')
    } catch { setMsg('削除に失敗しました') } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }} onClick={() => !busy && fileRef.current?.click()}>
        <Avatar name={name} color={color} src={cur} size={size} />
        <span aria-hidden style={{ position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: '50%', background: 'var(--ink)', color: '#fff', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.66rem' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>
        </span>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload} style={{ display: 'none' }} />
      </div>
      {cur && !busy && (
        <button onClick={remove} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 'var(--fs-micro)', color: 'var(--muted2)', fontWeight: 700 }}>画像を削除</button>
      )}
      {msg && <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--red)' }}>{msg}</span>}
      {ok && <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--green)' }}>{ok}</span>}
    </div>
  )
}
