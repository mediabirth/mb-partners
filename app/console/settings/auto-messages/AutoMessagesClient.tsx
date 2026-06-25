'use client'
import { useState, useRef } from 'react'
import Button from '@/components/ui/Button'
import type { Template } from '../../messages/MessagesClient'
import { ChannelBadge, uploadImage } from '../messaging-shared'
import { EXAMPLE, VARDESC, fillExample, SECTIONS, type Section } from '../messaging-sections'

// Phase3-D②：自動メッセージ（イベント別カード）。中身は 3-C/3-D① を踏襲（既定表示/変数/サンプル/プレビュー/画像/既定に戻す/状態）。
// ★resolveTemplate/Media・各通知の発火/フォールバックは byte-unchanged。本ページは設定UIの置き場所のみ。

function SectionCard({ section, existing, signedUrls, onSaved, onReset }: { section: Section; existing: Template | null; signedUrls: Record<string, string>; onSaved: (t: Template) => void; onReset: (category: string) => void }) {
  const initImg = existing?.attachments?.find(a => a.type === 'image')?.path ?? null
  const [body, setBody] = useState(existing?.body ?? '')
  const [imgPath, setImgPath] = useState<string | null>(initImg)
  const [imgUrl, setImgUrl] = useState<string>(initImg ? (signedUrls[initImg] ?? '') : '')
  const [showDefault, setShowDefault] = useState(false)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const isCustom = !!existing

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
    if (busy || (!body.trim() && !imgPath)) return
    setBusy(true); setErr('')
    try {
      const attachments = imgPath ? [{ type: 'image', path: imgPath }] : []
      const payload = { title: section.label, body, category: section.key, channel: section.channel || null, attachments, sort_order: 0 }
      const res = existing
        ? await fetch(`/api/console/messages/templates/${existing.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/console/messages/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.template) { setErr(j?.error || '保存に失敗しました'); return }
      onSaved(j.template as Template)
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }
  async function reset() {
    if (busy || !existing) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/console/messages/templates/${existing.id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j?.error || '操作に失敗しました'); return }
      setBody(''); setImgPath(null); setImgUrl(''); onReset(section.key)
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }

  const preview = fillExample(body || section.sample)
  return (
    <div className="ui-card" style={{ padding: '16px 18px' }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: '.86rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{section.label}
          <span style={{ fontSize: '.5rem', fontWeight: 800, color: isCustom ? 'var(--c-success)' : 'var(--t-tertiary)', background: isCustom ? 'rgba(30,158,106,0.1)' : 'var(--s-2)', borderRadius: 5, padding: '2px 7px' }}>{isCustom ? 'カスタム文面を使用中' : '既定の文面を使用中'}</span>
          <ChannelBadge channel={section.channel} />
        </div>
        <div style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 3 }}>{section.desc}</div>
      </div>

      <button type="button" onClick={() => setShowDefault(v => !v)} style={{ border: 'none', background: 'transparent', color: 'var(--c-blue)', fontSize: '.6rem', fontWeight: 700, cursor: 'pointer', padding: '2px 0', marginBottom: 4 }}>
        {showDefault ? '▾ 現在の文面（既定）を隠す' : '▸ 現在の文面（既定）を見る'}
      </button>
      {showDefault && <div style={{ background: 'var(--s-1)', border: '1px solid var(--c-hairline)', borderRadius: 8, padding: '10px 12px', fontSize: '.66rem', color: 'var(--t-secondary)', whiteSpace: 'pre-wrap', marginBottom: 10 }}>{section.defaultText}</div>}

      {section.vars.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 5 }}>差し込み変数（クリックで本文に挿入）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {section.vars.map(v => (
              <button key={v} type="button" onClick={() => insertVar(v)} title={`${VARDESC[v]}（例：${EXAMPLE[v]}）`} style={{ fontSize: '.58rem', border: '1px solid var(--c-ring-soft)', background: 'var(--c-ghost-bg)', color: 'var(--c-blue)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                {'${' + v + '}'} <span style={{ color: 'var(--t-tertiary)', fontWeight: 600 }}>{VARDESC[v]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea ref={ref} className="ui-field" value={body} onChange={e => setBody(e.target.value)} rows={4} style={{ resize: 'vertical' }} placeholder={`例）${section.sample}`} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        {imgUrl ? (
          <div style={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgUrl} alt="添付画像" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--line)' }} />
            <button type="button" onClick={() => { setImgPath(null); setImgUrl('') }} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, border: 'none', background: 'var(--c-danger)', color: '#fff', fontSize: 11, lineHeight: 1, cursor: 'pointer' }}>×</button>
          </div>
        ) : (
          <label className="ui-btn ui-btn--secondary" style={{ fontSize: '.6rem', padding: '5px 10px', borderRadius: 7, cursor: 'pointer' }}>画像を添付（任意）<input type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} /></label>
        )}
        <span style={{ fontSize: '.56rem', color: 'var(--t-tertiary)' }}>{section.channel === 'email' ? 'メール添付として送られます' : 'LINE画像として本文と一緒に送られます'}</span>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 4 }}>届くイメージ（実例値で置換）{!body && '：未入力のためサンプルを表示'}</div>
        <div style={{ background: 'var(--s-0)', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', fontSize: '.72rem', lineHeight: 1.7, color: 'var(--txt)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{preview}</div>
      </div>

      {err && <p style={{ fontSize: '.66rem', color: 'var(--c-danger)', margin: '8px 0 0' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
        {isCustom && <Button variant="ghost" size="sm" busy={busy} onClick={reset}>既定に戻す</Button>}
        <Button variant="primary" size="sm" busy={busy} disabled={!body.trim() && !imgPath} onClick={save}>{isCustom ? '更新' : '設定する'}</Button>
      </div>
    </div>
  )
}

export default function AutoMessagesClient({ initial, signedUrls = {} }: { initial: Template[]; signedUrls?: Record<string, string> }) {
  const [list, setList] = useState<Template[]>(initial)
  const bySection = (key: string) => list.find(t => t.category === key) ?? null
  function upsertLocal(t: Template) { setList(prev => prev.some(x => x.id === t.id) ? prev.map(x => x.id === t.id ? t : x) : [...prev, t]) }
  function dropByCategory(key: string) { setList(prev => prev.filter(t => t.category !== key)) }

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '28px 28px 60px' }}>
      <div style={{ marginBottom: 18 }}>
        <a href="/console/settings" style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--c-blue)', textDecoration: 'none' }}>← 設定に戻る</a>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: 6 }}>自動メッセージ</h1>
        <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 4 }}>各通知イベントの文面・画像をカスタムに差し替えできます。未設定なら「現在の文面（既定）」がそのまま使われます。</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SECTIONS.map(s => <SectionCard key={s.key} section={s} existing={bySection(s.key)} signedUrls={signedUrls} onSaved={upsertLocal} onReset={dropByCategory} />)}
      </div>
    </div>
  )
}
