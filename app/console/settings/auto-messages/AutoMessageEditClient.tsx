'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import type { Template } from '../../messages/MessagesClient'
import { ChannelBadge, EventIcon, uploadImage } from '../messaging-shared'
import { EXAMPLE, VARDESC, fillExample, type Section } from '../messaging-sections'

// Phase3-D②b：自動メッセージ [category] 編集（list-detail の detail）。3-C/3-D① の編集機能をここに集約。
// ★既存CRUD API流用（API変更なし）。resolveTemplate/Media・発火/フォールバックは byte-unchanged。
export default function AutoMessageEditClient({ section, existing, previewUrl }: { section: Section; existing: Template | null; previewUrl?: string }) {
  const router = useRouter()
  const initImg = existing?.attachments?.find(a => a.type === 'image')?.path ?? null
  const [body, setBody] = useState(existing?.body ?? '')
  const [imgPath, setImgPath] = useState<string | null>(initImg)
  const [imgUrl, setImgUrl] = useState<string>(initImg ? (previewUrl ?? '') : '')
  const [showDefault, setShowDefault] = useState(false)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const isCustom = !!existing
  const isLine = section.channel === 'line'

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
      router.push('/console/settings/auto-messages')
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }
  async function reset() {
    if (busy || !existing) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/console/messages/templates/${existing.id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j?.error || '操作に失敗しました'); return }
      router.push('/console/settings/auto-messages')
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }

  const preview = fillExample(body || section.sample)
  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '28px 28px 60px' }}>
      <a href="/console/settings/auto-messages" style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--c-blue)', textDecoration: 'none' }}>← 自動メッセージ一覧へ</a>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0 18px' }}>
        <EventIcon category={section.key} channel={section.channel} size={44} />
        <div>
          <div style={{ fontSize: '1.2rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>{section.label}<ChannelBadge channel={section.channel} /></div>
          <div style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 2 }}>{section.desc}</div>
        </div>
      </div>

      <div style={{ background: 'var(--s-0)', border: '1px solid var(--line)', borderRadius: 'var(--r-card)', padding: '18px 20px' }}>
        {/* 既定文面の折りたたみ */}
        <button type="button" onClick={() => setShowDefault(v => !v)} style={{ border: 'none', background: 'transparent', color: 'var(--c-blue)', fontSize: '.62rem', fontWeight: 700, cursor: 'pointer', padding: '2px 0', marginBottom: 6 }}>
          {showDefault ? '▾ 今送られている文面（既定）を隠す' : '▸ 今送られている文面（既定）を見る'}
        </button>
        {showDefault && <div style={{ background: 'var(--s-1)', border: '1px solid var(--c-hairline)', borderRadius: 8, padding: '10px 12px', fontSize: '.66rem', color: 'var(--t-secondary)', whiteSpace: 'pre-wrap', marginBottom: 12 }}>{section.defaultText}</div>}

        {/* 状態 */}
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: '.52rem', fontWeight: 800, color: isCustom ? 'var(--c-success)' : 'var(--t-tertiary)', background: isCustom ? 'rgba(30,158,106,0.1)' : 'var(--s-2)', borderRadius: 5, padding: '3px 8px' }}>{isCustom ? 'カスタム文面を使用中' : '既定の文面を使用中'}</span>
        </div>

        {/* 差し込み変数チップ */}
        {section.vars.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 5 }}>差し込み項目（タップで本文に挿入）</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {section.vars.map(v => (
                <button key={v} type="button" onClick={() => insertVar(v)} title={`例：${EXAMPLE[v]}`} style={{ fontSize: '.58rem', border: '1px solid var(--c-ring-soft)', background: 'var(--c-ghost-bg)', color: 'var(--c-blue)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                  {VARDESC[v]}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea ref={ref} className="ui-field" value={body} onChange={e => setBody(e.target.value)} rows={5} style={{ resize: 'vertical' }} placeholder={`例）${section.sample}`} />

        {/* 画像 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          {imgUrl ? (
            <div style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgUrl} alt="添付画像" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
              <button type="button" onClick={() => { setImgPath(null); setImgUrl('') }} style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: 10, border: 'none', background: 'var(--c-danger)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>×</button>
            </div>
          ) : (
            <label className="ui-btn ui-btn--secondary" style={{ fontSize: '.62rem', padding: '6px 12px', borderRadius: 7, cursor: 'pointer' }}>画像を追加（任意）<input type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} /></label>
          )}
          <span style={{ fontSize: '.56rem', color: 'var(--t-tertiary)' }}>{isLine ? 'LINE画像として送られます' : 'メール添付として送られます'}</span>
        </div>

        {/* 届くイメージ：LINE=緑吹き出し / メール=メール体裁 */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 6 }}>実際に届くイメージ{!body && '（未入力のためサンプル）'}</div>
          {isLine ? (
            <div style={{ background: '#7AC9A0', borderRadius: 12, padding: '14px 12px' }}>
              <div style={{ display: 'inline-block', maxWidth: '85%', background: '#fff', borderRadius: 12, padding: '9px 12px', fontSize: '.72rem', lineHeight: 1.7, color: '#0A0A0A', whiteSpace: 'pre-wrap', wordBreak: 'break-word', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>
                {preview}
                {imgUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={imgUrl} alt="" style={{ display: 'block', maxWidth: 150, borderRadius: 8, marginTop: 6 }} />}
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--s-1)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 13px', borderBottom: '1px solid var(--c-hairline)', fontSize: '.6rem', color: 'var(--t-tertiary)' }}>差出人：MB Partners 運営事務局</div>
              <div style={{ padding: '13px', fontSize: '.72rem', lineHeight: 1.75, color: 'var(--txt)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {preview}
                {imgUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={imgUrl} alt="" style={{ display: 'block', maxWidth: 180, borderRadius: 8, marginTop: 8 }} />}
              </div>
            </div>
          )}
        </div>

        {err && <p style={{ fontSize: '.66rem', color: 'var(--c-danger)', margin: '10px 0 0' }}>{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          {isCustom ? <Button variant="ghost" size="sm" busy={busy} onClick={reset}>既定に戻す</Button> : <span />}
          <Button variant="primary" size="md" busy={busy} disabled={!body.trim() && !imgPath} onClick={save}>保存する</Button>
        </div>
      </div>
    </div>
  )
}
