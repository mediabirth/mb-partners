'use client'
import { useState, useRef } from 'react'
import Button from '@/components/ui/Button'
import type { Template } from '../../messages/MessagesClient'
import { ChannelBadge, uploadImage, useIsNarrow, ButtonsField, PreviewButtons, type EditButton } from '../messaging-shared'

// Phase3-D②c：自由送信テンプレを左右1画面（master-detail）に統一。新規作成も右ペインで完結（別ルート遷移なし）。
// ★既存CRUD API流用。resolve/送信/発火には触れない。
const FREE_VARS = ['name']
const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString('ja', { year: 'numeric', month: 'numeric', day: 'numeric' }) : ''
type Sel = string | 'new' | null

// ── 右ペイン：編集フォーム（key で選択ごとにリセット）─────────────
function Editor({ existing, previewUrl, onSaved, onDeleted, onBack }: { existing: Template | null; previewUrl?: string; onSaved: (t: Template) => void; onDeleted: (id: string) => void; onBack?: () => void }) {
  const isNew = !existing
  const initImg = existing?.attachments?.find(a => a.type === 'image')?.path ?? null
  const [kind, setKind] = useState<'line' | 'email'>(existing?.channel === 'email' ? 'email' : 'line')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [subject, setSubject] = useState(existing?.subject ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  const [imgPath, setImgPath] = useState<string | null>(initImg)
  const [imgUrl, setImgUrl] = useState<string>(initImg ? (previewUrl ?? '') : '')
  const [buttons, setButtons] = useState<EditButton[]>(existing?.buttons ?? [])
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const channel = isNew ? kind : (existing!.channel ?? kind)

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
    if (busy || !title.trim()) return
    setBusy(true); setErr('')
    try {
      const attachments = imgPath ? [{ type: 'image', path: imgPath }] : []
      const cleanButtons = buttons.filter(b => b.label.trim() && /^https?:\/\//i.test(b.url.trim()))
      const payload = { title: title.trim(), body, channel, category: '自由送信', subject: channel === 'email' ? (subject.trim() || null) : null, attachments, buttons: cleanButtons }
      const res = existing
        ? await fetch(`/api/console/messages/templates/${existing.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/console/messages/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.template) { setErr(j?.error || '保存に失敗しました'); return }
      onSaved(j.template as Template)
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }
  async function remove() {
    if (busy || !existing) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/console/messages/templates/${existing.id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j?.error || '削除に失敗しました'); return }
      onDeleted(existing.id)
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }
  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 5 }}>{label}{hint && <span style={{ fontWeight: 600, marginLeft: 6 }}>{hint}</span>}</div>
      {node}
    </div>
  )

  return (
    <div>
      {onBack && <button type="button" onClick={onBack} style={{ border: 'none', background: 'transparent', color: 'var(--c-blue)', fontSize: '.66rem', fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← 一覧へ</button>}
      <h2 style={{ fontSize: '1.05rem', fontWeight: 900, marginBottom: 16 }}>{isNew ? 'テンプレートを作成' : 'テンプレートを編集'}</h2>
      {field('テンプレ名', <input className="ui-field" value={title} onChange={e => setTitle(e.target.value)} placeholder="例：お礼メッセージ" />)}
      {field('種類', isNew ? (
        <div style={{ display: 'flex', gap: 8 }}>
          {(['line', 'email'] as const).map(k => <button key={k} type="button" onClick={() => setKind(k)} className={`ui-btn ${kind === k ? 'ui-btn--primary' : 'ui-btn--secondary'}`} style={{ fontSize: '.66rem', padding: '7px 14px', borderRadius: 8 }}>{k === 'line' ? 'LINE用' : 'メール用'}</button>)}
        </div>
      ) : <ChannelBadge channel={existing!.channel} />, isNew ? '' : '（作成後は変更できません）')}
      {channel === 'email' && field('件名（メール用）', <input className="ui-field" value={subject} onChange={e => setSubject(e.target.value)} placeholder="件名（任意）" />)}
      {field('本文',
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {FREE_VARS.map(v => <button key={v} type="button" onClick={() => insertVar(v)} style={{ fontSize: '.58rem', border: '1px solid var(--c-ring-soft)', background: 'var(--c-ghost-bg)', color: 'var(--c-blue)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>{'${' + v + '}'} 挿入</button>)}
          </div>
          <textarea ref={ref} className="ui-field" value={body} onChange={e => setBody(e.target.value)} rows={5} style={{ resize: 'vertical' }} placeholder="本文を入力…" />
        </>
      )}
      {field('画像（任意・1枚）', imgUrl ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgUrl} alt="添付" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
          <button type="button" onClick={() => { setImgPath(null); setImgUrl('') }} style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: 10, border: 'none', background: 'var(--c-danger)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>×</button>
        </div>
      ) : (
        <label className="ui-btn ui-btn--secondary" style={{ fontSize: '.62rem', padding: '6px 12px', borderRadius: 7, cursor: 'pointer' }}>画像をアップロード<input type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} /></label>
      ))}
      {field('ボタン', <ButtonsField buttons={buttons} setButtons={setButtons} />)}
      {field('届くイメージ',
        channel === 'line' ? (
          <div style={{ background: '#7AC9A0', borderRadius: 12, padding: '14px 12px' }}>
            <div style={{ maxWidth: '88%', background: '#fff', borderRadius: 12, padding: '10px 12px', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>
              {imgUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={imgUrl} alt="" style={{ display: 'block', width: '100%', borderRadius: 8, marginBottom: body ? 8 : 0 }} />}
              {body && <div style={{ fontSize: '.72rem', lineHeight: 1.7, color: '#0A0A0A', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{body}</div>}
              {!body && !imgUrl && <span style={{ fontSize: '.72rem', color: 'var(--t-tertiary)' }}>本文がここに表示されます</span>}
              <PreviewButtons buttons={buttons} />
            </div>
          </div>
        ) : (
          <div style={{ background: 'var(--s-1)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', fontSize: '.74rem', lineHeight: 1.7, color: 'var(--txt)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: 40 }}>
            {subject && <div style={{ fontWeight: 800, marginBottom: 4 }}>{subject}</div>}
            {body || <span style={{ color: 'var(--t-tertiary)' }}>本文がここに表示されます</span>}
            {imgUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={imgUrl} alt="" style={{ display: 'block', maxWidth: 160, borderRadius: 8, marginTop: 8 }} />}
            <PreviewButtons buttons={buttons} />
          </div>
        )
      )}
      {err && <p style={{ fontSize: '.66rem', color: 'var(--c-danger)', margin: '0 0 10px' }}>{err}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        {existing ? <Button variant="danger" size="sm" busy={busy} onClick={remove}>削除</Button> : <span />}
        <Button variant="primary" size="md" busy={busy} disabled={!title.trim()} onClick={save}>{isNew ? '作成する' : '保存する'}</Button>
      </div>
    </div>
  )
}

type Row = Template & { updated_at?: string }
export default function TemplatesScreen({ initial, signedUrls = {}, initialSel = null }: { initial: Row[]; signedUrls?: Record<string, string>; initialSel?: Sel }) {
  const [list, setList] = useState<Row[]>(initial)
  const [sel, setSel] = useState<Sel>(initialSel)
  const narrow = useIsNarrow()

  const selected = sel && sel !== 'new' ? list.find(t => t.id === sel) ?? null : null
  const editorPreview = selected?.attachments?.find(a => a.type === 'image')?.path
  const showEditor = sel !== null
  function onSaved(t: Template) { setList(prev => { const ex = prev.some(x => x.id === t.id); return ex ? prev.map(x => x.id === t.id ? { ...x, ...t } : x) : [{ ...t }, ...prev] }); setSel(t.id) }
  function onDeleted(id: string) { setList(prev => prev.filter(t => t.id !== id)); setSel(null) }

  const ListPane = (
    <div style={{ width: narrow ? '100%' : 320, flexShrink: 0, borderRight: narrow ? 'none' : '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 12px' }}>
        <div style={{ fontSize: '.8rem', fontWeight: 800 }}>テンプレート</div>
        <Button variant="primary" size="sm" onClick={() => setSel('new')}>新規</Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.length === 0 && <div style={{ fontSize: '.66rem', color: 'var(--t-tertiary)', padding: '14px 4px' }}>まだありません。「新規」から作成できます。</div>}
        {list.map(t => {
          const on = t.id === sel
          const hasImg = (t.attachments ?? []).some(a => a.type === 'image')
          return (
            <button key={t.id} type="button" onClick={() => setSel(t.id)} className="ui-row" style={{ width: '100%', textAlign: 'left', border: '1px solid', borderColor: on ? 'var(--c-ring-soft)' : 'var(--c-hairline)', background: on ? 'var(--c-ghost-bg)' : 'var(--s-0)', borderRadius: 10, cursor: 'pointer', padding: '10px 12px', display: 'block' }}>
              <div style={{ fontSize: '.76rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 7 }}>
                <ChannelBadge channel={t.channel} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                {hasImg && <span title="画像あり" style={{ flexShrink: 0, fontSize: '.66rem' }}>🖼</span>}
              </div>
              {t.body && <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.body}</div>}
              {t.updated_at && <div style={{ fontSize: '.54rem', color: 'var(--t-tertiary)', marginTop: 3 }}>{fmtDate(t.updated_at)}</div>}
            </button>
          )
        })}
      </div>
    </div>
  )
  const EditorPane = (
    <div style={{ flex: 1, minWidth: 0, padding: narrow ? '0' : '0 4px 0 26px' }}>
      {sel === null ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'var(--t-tertiary)', fontSize: '.74rem', textAlign: 'center' }}>左から選択するか、「新規」で作成してください</div>
      ) : (
        <Editor key={sel} existing={selected} previewUrl={editorPreview ? signedUrls[editorPreview] : undefined} onSaved={onSaved} onDeleted={onDeleted} onBack={narrow ? () => setSel(null) : undefined} />
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 28px 60px' }}>
      <div style={{ marginBottom: 18 }}>
        <a href="/console/settings" style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--c-blue)', textDecoration: 'none' }}>← 設定に戻る</a>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: 6 }}>自由送信テンプレート</h1>
        <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 4 }}>メッセージ画面で手動送信するときに挿入できる定型文です。</p>
      </div>
      {narrow ? (showEditor ? EditorPane : ListPane) : (
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>{ListPane}{EditorPane}</div>
      )}
    </div>
  )
}
