'use client'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import type { Template } from '../../messages/MessagesClient'
import { ChannelBadge, useIsNarrow, BlockBuilder, BlocksPreview, templateToBlocks, cleanBlocks, type EditBlock } from '../messaging-shared'

// Phase3-D②c：自由送信テンプレを左右1画面（master-detail）に統一。新規作成も右ペインで完結（別ルート遷移なし）。
// ★既存CRUD API流用。resolve/送信/発火には触れない。
const FREE_VARS = ['name']
const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString('ja', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' }) : ''
type Sel = string | 'new' | null

// ── 右ペイン：編集フォーム（key で選択ごとにリセット）─────────────
function Editor({ existing, signedUrls, onSaved, onDeleted, onBack }: { existing: Template | null; signedUrls: Record<string, string>; onSaved: (t: Template) => void; onDeleted: (id: string) => void; onBack?: () => void }) {
  const isNew = !existing
  const [kind, setKind] = useState<'line' | 'email'>(existing?.channel === 'email' ? 'email' : 'line')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [subject, setSubject] = useState(existing?.subject ?? '')
  const [blocks, setBlocks] = useState<EditBlock[]>(templateToBlocks(existing))
  const [urls, setUrls] = useState<Record<string, string>>(signedUrls)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const previewNarrow = useIsNarrow(1024)
  const channel = isNew ? kind : (existing!.channel ?? kind)

  async function save() {
    const clean = cleanBlocks(blocks)
    if (busy || !title.trim() || clean.length === 0) return
    setBusy(true); setErr('')
    try {
      const payload = { title: title.trim(), channel, category: '自由送信', subject: channel === 'email' ? (subject.trim() || null) : null, blocks: clean }
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
      <div style={{ fontSize: '.62rem', fontWeight: 500, color: 'var(--t-tertiary)', marginBottom: 5 }}>{label}{hint && <span style={{ fontWeight: 500, marginLeft: 6 }}>{hint}</span>}</div>
      {node}
    </div>
  )

  return (
    <div>
      {onBack && <button type="button" onClick={onBack} style={{ border: 'none', background: 'transparent', color: 'var(--c-blue)', fontSize: '.66rem', fontWeight: 500, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← 一覧へ</button>}
      <h2 style={{ fontSize: '1.05rem', fontWeight: 500, marginBottom: 16 }}>{isNew ? 'テンプレートを作成' : 'テンプレートを編集'}</h2>
      {field('テンプレ名', <input className="ui-field" value={title} onChange={e => setTitle(e.target.value)} placeholder="例：お礼メッセージ" />)}
      {field('種類', isNew ? (
        <div style={{ display: 'flex', gap: 8 }}>
          {(['line', 'email'] as const).map(k => <button key={k} type="button" onClick={() => setKind(k)} className={`ui-btn ${kind === k ? 'ui-btn--primary' : 'ui-btn--secondary'}`} style={{ fontSize: '.66rem', padding: '7px 14px', borderRadius: 8 }}>{k === 'line' ? 'LINE用' : 'メール用'}</button>)}
        </div>
      ) : <ChannelBadge channel={existing!.channel} />, isNew ? '' : '（作成後は変更できません）')}
      {channel === 'email' && field('件名（メール用）', <input className="ui-field" value={subject} onChange={e => setSubject(e.target.value)} placeholder="件名（任意）" />)}

      <div style={{ display: 'flex', flexDirection: previewNarrow ? 'column' : 'row', gap: previewNarrow ? 18 : 26, alignItems: 'flex-start', marginTop: 4 }}>
        <div style={{ flex: 1, minWidth: 0, width: previewNarrow ? '100%' : 'auto' }}>
          <div style={{ fontSize: '.66rem', fontWeight: 500, marginBottom: 8 }}>メッセージのブロック</div>
          <BlockBuilder blocks={blocks} setBlocks={setBlocks} urls={urls} setUrls={setUrls} />
        </div>
        <div style={{ width: previewNarrow ? '100%' : 264, flexShrink: 0, ...(previewNarrow ? {} : { position: 'sticky' as const, top: 16 }) }}>
          <BlocksPreview channel={channel} blocks={blocks} urls={urls} />
        </div>
      </div>

      {err && <p style={{ fontSize: '.66rem', color: 'var(--c-danger)', margin: '14px 0 10px' }}>{err}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        {existing ? <Button variant="danger" size="sm" busy={busy} onClick={remove}>削除</Button> : <span />}
        <Button variant="primary" size="md" busy={busy} disabled={!title.trim() || cleanBlocks(blocks).length === 0} onClick={save}>{isNew ? '作成する' : '保存する'}</Button>
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
    <div style={{ width: narrow ? '100%' : 320, flexShrink: 0, borderRight: narrow ? 'none' : '0.5px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 12px' }}>
        <div style={{ fontSize: '.8rem', fontWeight: 500 }}>テンプレート</div>
        <Button variant="primary" size="sm" onClick={() => setSel('new')}>新規</Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.length === 0 && <div style={{ fontSize: '.66rem', color: 'var(--t-tertiary)', padding: '14px 4px' }}>まだありません</div>}
        {list.map(t => {
          const on = t.id === sel
          const hasImg = (t.attachments ?? []).some(a => a.type === 'image')
          return (
            <button key={t.id} type="button" onClick={() => setSel(t.id)} className="ui-row" style={{ width: '100%', textAlign: 'left', border: '0.5px solid', borderColor: on ? 'var(--c-ring-soft)' : 'var(--c-hairline)', background: on ? 'var(--c-ghost-bg)' : 'var(--s-0)', borderRadius: 10, cursor: 'pointer', padding: '10px 12px', display: 'block' }}>
              <div style={{ fontSize: '.76rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'var(--t-tertiary)', fontSize: '.74rem', textAlign: 'center' }} />
      ) : (
        <Editor key={sel} existing={selected} signedUrls={signedUrls} onSaved={onSaved} onDeleted={onDeleted} onBack={narrow ? () => setSel(null) : undefined} />
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 28px 60px' }}>
      <div style={{ marginBottom: 18 }}>
        <a href="/console/settings" style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--c-blue)', textDecoration: 'none' }}>← 設定に戻る</a>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 500, marginTop: 6 }}>自由送信テンプレート</h1>
      </div>
      {narrow ? (showEditor ? EditorPane : ListPane) : (
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>{ListPane}{EditorPane}</div>
      )}
    </div>
  )
}
