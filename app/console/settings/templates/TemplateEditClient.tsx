'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import type { Template } from '../../messages/MessagesClient'
import { ChannelBadge, uploadImage } from '../messaging-shared'

// Phase3-D②：自由送信テンプレ 編集画面（list-detail の detail）。新規/既存兼用。既存CRUD API流用（API変更なし）。
// 項目順（モック準拠）：戻る → テンプレ名 → 種類 → 件名(メール) → 本文(変数チップ) → 画像 → 届くイメージ → 保存/削除。
const FREE_VARS = ['name'] // 自由送信で挿入できる差し込み（手動送信時は入力欄に挿入）。

export default function TemplateEditClient({ existing, previewUrl }: { existing: Template | null; previewUrl?: string }) {
  const router = useRouter()
  const isNew = !existing
  const initImg = existing?.attachments?.find(a => a.type === 'image')?.path ?? null
  const [kind, setKind] = useState<'line' | 'email'>(existing?.channel === 'email' ? 'email' : 'line')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [subject, setSubject] = useState(existing?.subject ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  const [imgPath, setImgPath] = useState<string | null>(initImg)
  const [imgUrl, setImgUrl] = useState<string>(initImg ? (previewUrl ?? '') : '')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  function insertVar(key: string) {
    const token = '${' + key + '}'
    const el = ref.current
    if (!el) { setBody(b => b + token); return }
    const s = el.selectionStart ?? body.length, e = el.selectionEnd ?? body.length
    setBody(body.slice(0, s) + token + body.slice(e))
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + token.length })
  }
  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
    setErr('')
    const up = await uploadImage(file)
    if (!up) { setErr('画像アップロードに失敗しました'); return }
    setImgPath(up.path); setImgUrl(up.previewUrl)
  }
  async function save() {
    if (busy || !title.trim()) return
    setBusy(true); setErr('')
    try {
      const attachments = imgPath ? [{ type: 'image', path: imgPath }] : []
      const channel = isNew ? kind : (existing!.channel ?? kind)
      const payload = {
        title: title.trim(), body, channel, category: '自由送信',
        subject: channel === 'email' ? (subject.trim() || null) : null, attachments,
      }
      const res = existing
        ? await fetch(`/api/console/messages/templates/${existing.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/console/messages/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.template) { setErr(j?.error || '保存に失敗しました'); return }
      router.push('/console/settings/templates')
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }
  async function remove() {
    if (busy || !existing) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/console/messages/templates/${existing.id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j?.error || '削除に失敗しました'); return }
      router.push('/console/settings/templates')
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }

  const channel = isNew ? kind : (existing!.channel ?? kind)
  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 5 }}>{label}{hint && <span style={{ fontWeight: 600, marginLeft: 6 }}>{hint}</span>}</div>
      {node}
    </div>
  )

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 28px 60px' }}>
      <a href="/console/settings/templates" style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--c-blue)', textDecoration: 'none' }}>← 一覧に戻る</a>
      <h1 style={{ fontSize: '1.3rem', fontWeight: 900, margin: '6px 0 20px' }}>{isNew ? 'テンプレートを作成' : 'テンプレートを編集'}</h1>

      <div style={{ background: 'var(--s-0)', border: '1px solid var(--line)', borderRadius: 'var(--r-card)', padding: '18px 20px' }}>
        {field('テンプレ名', <input className="ui-field" value={title} onChange={e => setTitle(e.target.value)} placeholder="例：お礼メッセージ" />)}

        {field('種類', isNew ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {(['line', 'email'] as const).map(k => (
              <button key={k} type="button" onClick={() => setKind(k)} className={`ui-btn ${kind === k ? 'ui-btn--primary' : 'ui-btn--secondary'}`} style={{ fontSize: '.66rem', padding: '7px 14px', borderRadius: 8 }}>{k === 'line' ? 'LINE用' : 'メール用'}</button>
            ))}
          </div>
        ) : <ChannelBadge channel={existing!.channel} />, isNew ? '' : '（作成後は変更できません）')}

        {channel === 'email' && field('件名（メール用）', <input className="ui-field" value={subject} onChange={e => setSubject(e.target.value)} placeholder="件名（任意）" />)}

        {field('本文',
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {FREE_VARS.map(v => (
                <button key={v} type="button" onClick={() => insertVar(v)} style={{ fontSize: '.58rem', border: '1px solid var(--c-ring-soft)', background: 'var(--c-ghost-bg)', color: 'var(--c-blue)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>{'${' + v + '}'} 挿入</button>
              ))}
            </div>
            <textarea ref={ref} className="ui-field" value={body} onChange={e => setBody(e.target.value)} rows={5} style={{ resize: 'vertical' }} placeholder="本文を入力…" />
          </>
        )}

        {field('画像（任意・1枚）',
          imgUrl ? (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgUrl} alt="添付" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
              <button type="button" onClick={() => { setImgPath(null); setImgUrl('') }} style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: 10, border: 'none', background: 'var(--c-danger)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>×</button>
            </div>
          ) : (
            <label className="ui-btn ui-btn--secondary" style={{ fontSize: '.62rem', padding: '6px 12px', borderRadius: 7, cursor: 'pointer' }}>画像をアップロード<input type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} /></label>
          )
        )}

        {field('届くイメージ',
          <div style={{ background: 'var(--s-1)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', fontSize: '.74rem', lineHeight: 1.7, color: 'var(--txt)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: 40 }}>
            {channel === 'email' && subject && <div style={{ fontWeight: 800, marginBottom: 4 }}>{subject}</div>}
            {body || <span style={{ color: 'var(--t-tertiary)' }}>本文がここに表示されます</span>}
            {imgUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={imgUrl} alt="" style={{ display: 'block', maxWidth: 160, borderRadius: 8, marginTop: 8 }} />}
          </div>
        )}

        {err && <p style={{ fontSize: '.66rem', color: 'var(--c-danger)', margin: '0 0 10px' }}>{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          {existing ? <Button variant="danger" size="sm" busy={busy} onClick={remove}>削除</Button> : <span />}
          <Button variant="primary" size="md" busy={busy} disabled={!title.trim()} onClick={save}>{isNew ? '作成する' : '保存する'}</Button>
        </div>
      </div>
    </div>
  )
}
