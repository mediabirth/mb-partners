'use client'
import { useState, useRef } from 'react'
import Button from '@/components/ui/Button'
import type { Template } from '../../messages/MessagesClient'
import { ChannelBadge, EventIcon, uploadImage, useIsNarrow } from '../messaging-shared'
import { EXAMPLE, VARDESC, fillExample, SECTIONS, type Section } from '../messaging-sections'

// Phase3-D②c：自動メッセージを左右1画面（左7イベント list ＋ 右編集）に統一。別ルート遷移なし。
// ★既存CRUD API流用。resolveTemplate/Media・各通知の発火/フォールバックは byte-unchanged。

function Editor({ section, existing, previewUrl, onSaved, onReset, onBack }: { section: Section; existing: Template | null; previewUrl?: string; onSaved: (t: Template) => void; onReset: (cat: string) => void; onBack?: () => void }) {
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
    const token = '${' + key + '}'; const el = ref.current
    if (!el) { setBody(b => b + token); return }
    const s = el.selectionStart ?? body.length, e = el.selectionEnd ?? body.length
    setBody(body.slice(0, s) + token + body.slice(e))
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + token.length })
  }
  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
    setErr(''); const up = await uploadImage(file)
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
      onReset(section.key)
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }

  const preview = fillExample(body || section.sample)
  return (
    <div>
      {onBack && <button type="button" onClick={onBack} style={{ border: 'none', background: 'transparent', color: 'var(--c-blue)', fontSize: '.66rem', fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← 一覧へ</button>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <EventIcon category={section.key} channel={section.channel} size={42} />
        <div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>{section.label}<ChannelBadge channel={section.channel} /></div>
          <div style={{ fontSize: '.63rem', color: 'var(--muted2)', marginTop: 2 }}>{section.desc}</div>
        </div>
      </div>

      <button type="button" onClick={() => setShowDefault(v => !v)} style={{ border: 'none', background: 'transparent', color: 'var(--c-blue)', fontSize: '.62rem', fontWeight: 700, cursor: 'pointer', padding: '2px 0', marginBottom: 6 }}>
        {showDefault ? '▾ 今送られている文面（既定）を隠す' : '▸ 今送られている文面（既定）を見る'}
      </button>
      {showDefault && <div style={{ background: 'var(--s-1)', border: '1px solid var(--c-hairline)', borderRadius: 8, padding: '10px 12px', fontSize: '.66rem', color: 'var(--t-secondary)', whiteSpace: 'pre-wrap', marginBottom: 12 }}>{section.defaultText}</div>}

      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: '.52rem', fontWeight: 800, color: isCustom ? 'var(--c-success)' : 'var(--t-tertiary)', background: isCustom ? 'rgba(30,158,106,0.1)' : 'var(--s-2)', borderRadius: 5, padding: '3px 8px' }}>{isCustom ? 'カスタム文面を使用中' : '既定の文面を使用中'}</span>
      </div>

      {section.vars.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 5 }}>差し込み項目（タップで本文に挿入）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {section.vars.map(v => <button key={v} type="button" onClick={() => insertVar(v)} title={`例：${EXAMPLE[v]}`} style={{ fontSize: '.58rem', border: '1px solid var(--c-ring-soft)', background: 'var(--c-ghost-bg)', color: 'var(--c-blue)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>{VARDESC[v]}</button>)}
          </div>
        </div>
      )}

      <textarea ref={ref} className="ui-field" value={body} onChange={e => setBody(e.target.value)} rows={5} style={{ resize: 'vertical' }} placeholder={`例）${section.sample}`} />

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
  )
}

export default function AutoMessagesScreen({ byCategory, signedUrls = {}, initialSel = null }: { byCategory: Record<string, Template>; signedUrls?: Record<string, string>; initialSel?: string | null }) {
  const [map, setMap] = useState<Record<string, Template>>(byCategory)
  const [sel, setSel] = useState<string | null>(initialSel && SECTIONS.some(s => s.key === initialSel) ? initialSel : null)
  const narrow = useIsNarrow()

  function onSaved(t: Template) { if (t.category) setMap(prev => ({ ...prev, [t.category as string]: t })) }
  function onReset(cat: string) { setMap(prev => { const n = { ...prev }; delete n[cat]; return n }) }

  const section = sel ? SECTIONS.find(s => s.key === sel) ?? null : null
  const existing = sel ? map[sel] ?? null : null
  const editorPreview = existing?.attachments?.find(a => a.type === 'image')?.path

  const ListPane = (
    <div style={{ width: narrow ? '100%' : 340, flexShrink: 0, borderRight: narrow ? 'none' : '1px solid var(--line)', paddingRight: narrow ? 0 : 16 }}>
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
        {SECTIONS.map((s, i) => {
          const on = s.key === sel
          const isCustom = !!map[s.key]
          return (
            <button key={s.key} type="button" onClick={() => setSel(s.key)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--c-hairline)', background: on ? 'var(--c-ghost-bg)' : 'transparent' }}>
              <EventIcon category={s.key} channel={s.channel} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                  <ChannelBadge channel={s.channel} />
                </div>
                <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.desc}</div>
              </div>
              <span style={{ flexShrink: 0, fontSize: '.5rem', fontWeight: 800, color: isCustom ? 'var(--c-blue)' : 'var(--t-tertiary)', background: isCustom ? 'var(--c-ghost-bg)' : 'var(--s-2)', borderRadius: 5, padding: '2px 7px' }}>{isCustom ? 'カスタム' : '既定のまま'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
  const EditorPane = (
    <div style={{ flex: 1, minWidth: 0, padding: narrow ? 0 : '0 4px 0 26px' }}>
      {!section ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 220, color: 'var(--t-tertiary)', fontSize: '.74rem', textAlign: 'center' }}>左のイベントを選ぶと、ここで編集できます</div>
      ) : (
        <Editor key={section.key} section={section} existing={existing} previewUrl={editorPreview ? signedUrls[editorPreview] : undefined} onSaved={onSaved} onReset={onReset} onBack={narrow ? () => setSel(null) : undefined} />
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 28px 60px' }}>
      <div style={{ marginBottom: 18 }}>
        <a href="/console/settings" style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--c-blue)', textDecoration: 'none' }}>← 設定に戻る</a>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: 6 }}>自動メッセージ</h1>
        <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 4 }}>各イベントで自動送信される文面・画像。左のイベントを選んで右で編集します。未設定なら既定の文面が使われます。</p>
      </div>
      {narrow ? (section ? EditorPane : ListPane) : (
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>{ListPane}{EditorPane}</div>
      )}
    </div>
  )
}
