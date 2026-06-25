'use client'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import type { Template } from '../../messages/MessagesClient'
import { ChannelBadge, EventIcon, useIsNarrow, BlockBuilder, BlocksPreview, templateToBlocks, cleanBlocks, type EditBlock } from '../messaging-shared'
import { SECTIONS, type Section } from '../messaging-sections'

// Phase3-D②c：自動メッセージを左右1画面（左7イベント list ＋ 右編集）に統一。別ルート遷移なし。
// ★既存CRUD API流用。resolveTemplate/Media・各通知の発火/フォールバックは byte-unchanged。

function Editor({ section, existing, signedUrls, onSaved, onReset, onBack }: { section: Section; existing: Template | null; signedUrls: Record<string, string>; onSaved: (t: Template) => void; onReset: (cat: string) => void; onBack?: () => void }) {
  const [blocks, setBlocks] = useState<EditBlock[]>(templateToBlocks(existing))
  const [urls, setUrls] = useState<Record<string, string>>(signedUrls)
  const [label, setLabel] = useState(existing?.label ?? '')
  const [showDefault, setShowDefault] = useState(false)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  // カスタム＝実際の本文/ブロックがある時のみ（表示名だけの行は「既定の文面」のまま）。
  const isCustom = !!(existing && (existing.blocks?.length || existing.body || existing.attachments?.length || existing.buttons?.length))
  const previewNarrow = useIsNarrow(1024)

  async function save() {
    const clean = cleanBlocks(blocks)
    if (busy || (clean.length === 0 && !label.trim() && !existing)) return
    setBusy(true); setErr('')
    try {
      const payload = { title: section.label, label: label.trim() || null, category: section.key, channel: section.channel || null, blocks: clean, sort_order: 0 }
      const res = existing
        ? await fetch(`/api/console/messages/templates/${existing.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/console/messages/templates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.template) { setErr(j?.error || ' 保存に失敗しました'); return }
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

  return (
    <div>
      {onBack && <button type="button" onClick={onBack} style={{ border: 'none', background: 'transparent', color: 'var(--c-blue)', fontSize: '.66rem', fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← 一覧へ</button>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <EventIcon category={section.key} channel={section.channel} size={42} />
        <div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>{label.trim() || section.label}<ChannelBadge channel={section.channel} /></div>
          <div style={{ fontSize: '.63rem', color: 'var(--muted2)', marginTop: 2 }}>{section.desc}（発火タイミングは固定）</div>
        </div>
      </div>

      {/* 表示名（label）— 表示専用・発火/categoryには非接触 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--t-tertiary)' }}>表示名（一覧での名前・任意）</span>
          {label.trim() && <button type="button" onClick={() => setLabel('')} style={{ fontSize: '.56rem', color: 'var(--c-blue)', background: 'transparent', border: 'none', cursor: 'pointer' }}>既定の表示名に戻す</button>}
        </div>
        <input className="ui-field" value={label} onChange={e => setLabel(e.target.value)} placeholder={`例：${section.label}`} />
      </div>

      <button type="button" onClick={() => setShowDefault(v => !v)} style={{ border: 'none', background: 'transparent', color: 'var(--c-blue)', fontSize: '.62rem', fontWeight: 700, cursor: 'pointer', padding: '2px 0', marginBottom: 6 }}>
        {showDefault ? '▾ 今送られている文面（既定）を隠す' : '▸ 今送られている文面（既定）を見る'}
      </button>
      {showDefault && <div style={{ background: 'var(--s-1)', border: '1px solid var(--c-hairline)', borderRadius: 8, padding: '10px 12px', fontSize: '.66rem', color: 'var(--t-secondary)', whiteSpace: 'pre-wrap', marginBottom: 12 }}>{section.defaultText}</div>}

      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: '.52rem', fontWeight: 800, color: isCustom ? 'var(--c-success)' : 'var(--t-tertiary)', background: isCustom ? 'rgba(30,158,106,0.1)' : 'var(--s-2)', borderRadius: 5, padding: '3px 8px' }}>{isCustom ? 'カスタム文面を使用中' : '既定の文面を使用中'}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: previewNarrow ? 'column' : 'row', gap: previewNarrow ? 18 : 26, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, width: previewNarrow ? '100%' : 'auto' }}>
          <div style={{ fontSize: '.66rem', fontWeight: 800, marginBottom: 8 }}>メッセージのブロック</div>
          <BlockBuilder blocks={blocks} setBlocks={setBlocks} urls={urls} setUrls={setUrls} vars={section.vars} />
        </div>
        <div style={{ width: previewNarrow ? '100%' : 264, flexShrink: 0, ...(previewNarrow ? {} : { position: 'sticky' as const, top: 16 }) }}>
          <div style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--t-tertiary)', marginBottom: 6 }}>実際に届くイメージ</div>
          <BlocksPreview channel={section.channel} blocks={blocks} urls={urls} />
        </div>
      </div>

      {err && <p style={{ fontSize: '.66rem', color: 'var(--c-danger)', margin: '10px 0 0' }}>{err}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        {isCustom ? <Button variant="ghost" size="sm" busy={busy} onClick={reset}>既定に戻す</Button> : <span />}
        <Button variant="primary" size="md" busy={busy} disabled={cleanBlocks(blocks).length === 0 && !label.trim() && !existing} onClick={save}>保存する</Button>
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
          const row = map[s.key]
          const isCustom = !!(row && (row.blocks?.length || row.body || row.attachments?.length || row.buttons?.length))
          return (
            <button key={s.key} type="button" onClick={() => setSel(s.key)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--c-hairline)', background: on ? 'var(--c-ghost-bg)' : 'transparent' }}>
              <EventIcon category={s.key} channel={s.channel} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row?.label || s.label}</span>
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
        <Editor key={section.key} section={section} existing={existing} signedUrls={signedUrls} onSaved={onSaved} onReset={onReset} onBack={narrow ? () => setSel(null) : undefined} />
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
