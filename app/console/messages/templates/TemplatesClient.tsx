'use client'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import type { Template } from '../MessagesClient'

type Draft = { title: string; body: string; category: string; channel: '' | 'line' | 'email' | 'both'; sort_order: number }
const emptyDraft: Draft = { title: '', body: '', category: '', channel: '', sort_order: 0 }
const chLabel = (c: Template['channel']) => c === 'line' ? 'LINE' : c === 'email' ? 'メール' : c === 'both' ? 'LINE/メール' : '汎用'

export default function TemplatesClient({ initial }: { initial: Template[] }) {
  const [list, setList] = useState<Template[]>(initial)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')

  function toDraft(t: Template): Draft { return { title: t.title, body: t.body ?? '', category: t.category ?? '', channel: t.channel ?? '', sort_order: t.sort_order } }
  function payload(d: Draft) { return { title: d.title.trim(), body: d.body, category: d.category.trim() || null, channel: d.channel || null, sort_order: Number(d.sort_order) || 0 } }

  async function create() {
    if (busy || !draft.title.trim()) return
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/console/messages/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(draft)) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.template) { setErr(j?.error || '作成に失敗しました'); return }
      setList(prev => [...prev, j.template as Template]); setDraft(emptyDraft)
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }
  async function saveEdit(id: string) {
    if (busy || !draft.title.trim()) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/console/messages/templates/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(draft)) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.template) { setErr(j?.error || '更新に失敗しました'); return }
      setList(prev => prev.map(t => t.id === id ? (j.template as Template) : t)); setEditing(null); setDraft(emptyDraft)
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }
  async function remove(id: string) {
    if (busy) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/console/messages/templates/${id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j?.error || '削除に失敗しました'); return }
      setList(prev => prev.filter(t => t.id !== id)); if (editing === id) { setEditing(null); setDraft(emptyDraft) }
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }

  const field = (label: string, node: React.ReactNode) => (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: '.6rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 4 }}>{label}</span>
      {node}
    </label>
  )
  const editor = (onSave: () => void, onCancel?: () => void) => (
    <div style={{ background: 'var(--s-0)', border: '1px solid var(--line)', borderRadius: 'var(--r-card)', padding: '16px 18px' }}>
      {field('テンプレ名', <input className="ui-field" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="例：商談前のご案内" />)}
      {field('本文', <textarea className="ui-field" value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} rows={4} style={{ resize: 'vertical' }} placeholder="本文を入力…" />)}
      <div style={{ display: 'flex', gap: 12 }}>
        {field('区分（任意）', <input className="ui-field" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} placeholder="自由送信 / あいさつ 等" />)}
        {field('チャネル', <select className="ui-field" value={draft.channel} onChange={e => setDraft({ ...draft, channel: e.target.value as Draft['channel'] })}><option value="">汎用</option><option value="line">LINE</option><option value="email">メール</option><option value="both">LINE/メール</option></select>)}
        {field('並び順', <input className="ui-field" type="number" value={draft.sort_order} onChange={e => setDraft({ ...draft, sort_order: Number(e.target.value) })} style={{ width: 80 }} />)}
      </div>
      {err && <p style={{ fontSize: '.66rem', color: 'var(--c-danger)', margin: '2px 0 8px' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>キャンセル</Button>}
        <Button variant="primary" size="sm" busy={busy} disabled={!draft.title.trim()} onClick={onSave}>保存</Button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 28px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 2 }}>司令塔</p>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>テンプレート管理</h1>
        </div>
        <a href="/console/messages" style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--c-blue)', textDecoration: 'none' }}>← メッセージへ</a>
      </div>

      {/* 新規作成 */}
      {editing === null && <div style={{ marginBottom: 22 }}>{editor(create)}</div>}

      {/* 一覧 */}
      {list.length === 0 ? (
        <EmptyState title="テンプレートはまだありません" hint="上のフォームから登録できます。" compact />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(t => editing === t.id ? (
            <div key={t.id}>{editor(() => saveEdit(t.id), () => { setEditing(null); setDraft(emptyDraft); setErr('') })}</div>
          ) : (
            <div key={t.id} className="ui-card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '.86rem', fontWeight: 800 }}>{t.title}
                    <span style={{ marginLeft: 8, fontSize: '.52rem', fontWeight: 800, color: 'var(--c-blue)', background: 'var(--c-ghost-bg)', borderRadius: 5, padding: '2px 6px' }}>{chLabel(t.channel)}</span>
                    {t.category && <span style={{ marginLeft: 6, fontSize: '.56rem', color: 'var(--t-tertiary)' }}>{t.category}</span>}
                  </div>
                  {t.body && <div style={{ fontSize: '.7rem', color: 'var(--muted2)', marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.body}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(t.id); setDraft(toDraft(t)); setErr('') }}>編集</Button>
                  <Button variant="danger" size="sm" busy={busy} onClick={() => remove(t.id)}>削除</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
