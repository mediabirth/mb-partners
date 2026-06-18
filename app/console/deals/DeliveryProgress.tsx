'use client'
// V-1: 案件詳細の「デリバリー進行」セクション（MBが構造を設計＋vendorシグナルを見る器）。お金ロジック非接触。
import { useState } from 'react'

type Task = { id: string; title: string; type: string; needs_deliverable: boolean; due_date: string | null; sort: number; status: string; done_at: string | null }
type Update = { id: string; kind: string; body: string; status: string | null; created_at: string }
type Deliverable = { id: string; file_name: string | null; note: string | null; created_at: string }
type Assign = { id: string; delivery_id?: string | null; deliveries?: { name: string; kind: string | null } | null; _tasks?: Task[]; _updates?: Update[]; _deliverables?: Deliverable[] }
type Deal = { id: string; _delivery_brief?: string | null; _deliveries?: Assign[] }

export default function DeliveryProgress({ deal, onRefresh }: { deal: Deal; onRefresh: () => void | Promise<void> }) {
  const assigns = (deal._deliveries ?? []).filter(a => a.delivery_id)
  const [brief, setBrief] = useState(deal._delivery_brief ?? '')
  const [briefBusy, setBriefBusy] = useState(false)
  const [savedAt, setSavedAt] = useState(false)
  const [busy, setBusy] = useState(false)

  async function saveBrief() {
    setBriefBusy(true)
    try {
      const r = await fetch(`/api/console/deals/${deal.id}/brief`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_brief: brief }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && !d.needsMigration) { setSavedAt(true); setTimeout(() => setSavedAt(false), 1800); await onRefresh() }
      else if (d.needsMigration) alert('デリバリーPMのDB適用が必要です（batchV1 DDL）')
    } finally { setBriefBusy(false) }
  }
  async function addTask(assignmentId: string, body: Record<string, unknown>) {
    setBusy(true)
    try {
      const r = await fetch('/api/console/delivery-tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_assignment_id: assignmentId, ...body }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.task) await onRefresh()
      else alert(d.needsMigration ? 'デリバリーPMのDB適用が必要です（batchV1 DDL）' : (d.error ?? '追加に失敗しました'))
    } finally { setBusy(false) }
  }
  async function patchTask(id: string, body: Record<string, unknown>) {
    setBusy(true)
    try { const r = await fetch(`/api/console/delivery-tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (r.ok) await onRefresh() } finally { setBusy(false) }
  }
  async function delTask(id: string) {
    if (!confirm('このタスク/マイルストーンを削除しますか？')) return
    setBusy(true)
    try { const r = await fetch(`/api/console/delivery-tasks/${id}`, { method: 'DELETE' }); if (r.ok) await onRefresh() } finally { setBusy(false) }
  }
  async function resolveFlag(id: string, resolved: boolean) {
    setBusy(true)
    try { const r = await fetch(`/api/console/delivery-updates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: resolved ? 'resolved' : 'open' }) }); if (r.ok) await onRefresh() } finally { setBusy(false) }
  }

  return (
    <div style={{ marginTop: 18 }}>
      <p style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 700, marginBottom: 8 }}>デリバリー進行（プロジェクト管理）</p>

      {/* a. プロジェクト概要/スコープ */}
      <div style={{ background: 'var(--bg2)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
        <div style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 700, marginBottom: 6 }}>プロジェクト概要 / スコープ（vendorへ共有・お金情報は含めない）</div>
        <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={3} placeholder="目的・対応範囲・前提・成果物の方向性など" disabled={briefBusy}
          style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.74rem', resize: 'vertical', background: '#fff' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 6 }}>
          {savedAt && <span style={{ fontSize: '.6rem', color: 'var(--green)', fontWeight: 700 }}>保存しました ✓</span>}
          <button onClick={saveBrief} disabled={briefBusy} className="btn btn-g" style={{ fontSize: '.7rem', padding: '6px 12px' }}>概要を保存</button>
        </div>
      </div>

      {assigns.length === 0 ? (
        <p style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>デリバリー割当がありません。明細にデリバリーを割り当てると、タスク/マイルストーンを設計できます。</p>
      ) : assigns.map(a => {
        const tasks = [...(a._tasks ?? [])].sort((x, y) => x.sort - y.sort)
        const updates = a._updates ?? []
        const deliverables = a._deliverables ?? []
        const openFlags = updates.filter(u => u.kind === 'flag' && u.status === 'open')
        return (
          <div key={a.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', marginBottom: 12, background: '#fff' }}>
            <div style={{ fontSize: '.74rem', fontWeight: 800, marginBottom: 8 }}>{a.deliveries?.name ?? '委託先'} <span style={{ fontSize: '.56rem', color: 'var(--muted2)', fontWeight: 400 }}>· {a.deliveries?.kind ?? ''}</span></div>

            {/* b. 公式タスク/マイルストーン */}
            {tasks.length === 0 ? <p style={{ fontSize: '.62rem', color: 'var(--muted2)', marginBottom: 8 }}>タスク/マイルストーン未設定。</p> : (
              <div style={{ marginBottom: 8 }}>
                {tasks.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 0', borderBottom: '1px solid #F2F2F6' }}>
                    <span style={{ fontSize: '.5rem', fontWeight: 700, borderRadius: 6, padding: '1px 6px', color: t.type === 'milestone' ? 'var(--blue)' : 'var(--muted2)', background: t.type === 'milestone' ? 'var(--blue-bg)' : 'var(--bg2)', flexShrink: 0 }}>{t.type === 'milestone' ? 'MS' : 'T'}</span>
                    <span style={{ flex: 1, fontSize: '.72rem', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    {t.needs_deliverable && <span title="成果物が必要" style={{ fontSize: '.5rem', fontWeight: 700, color: 'var(--amber)', background: 'var(--amber-bg)', borderRadius: 6, padding: '1px 5px', flexShrink: 0 }}>成果物</span>}
                    {t.due_date && <span style={{ fontSize: '.56rem', color: 'var(--muted2)', flexShrink: 0 }}>{t.due_date.slice(5)}</span>}
                    <span style={{ fontSize: '.52rem', fontWeight: 700, borderRadius: 20, padding: '1px 7px', color: t.status === 'done' ? 'var(--green)' : 'var(--muted2)', background: t.status === 'done' ? 'var(--green-bg)' : 'var(--bg2)', flexShrink: 0 }}>{t.status === 'done' ? '完了' : '未'}</span>
                    <button onClick={() => delTask(t.id)} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.75rem', flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <TaskAdder onAdd={(body) => addTask(a.id, body)} busy={busy} />

            {/* c. vendor 実行シグナル（V-2まで空） */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
              <div style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 700, marginBottom: 6 }}>vendor 実行シグナル（成果物・進捗メモ・課題フラグ）</div>
              {deliverables.length === 0 && updates.length === 0 ? (
                <p style={{ fontSize: '.6rem', color: 'var(--muted)' }}>まだシグナルはありません（vendor がタスク完了・成果物提出・メモ投稿を行うと表示されます／V-2）。</p>
              ) : (
                <>
                  {deliverables.map(dl => <div key={dl.id} style={{ fontSize: '.64rem', padding: '3px 0' }}>📎 {dl.file_name ?? '成果物'}{dl.note ? ` · ${dl.note}` : ''}</div>)}
                  {updates.map(u => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', fontSize: '.64rem' }}>
                      <span style={{ flexShrink: 0 }}>{u.kind === 'flag' ? '🚩' : '📝'}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>{u.body}</span>
                      {u.kind === 'flag' && (u.status === 'open'
                        ? <button onClick={() => resolveFlag(u.id, true)} disabled={busy} style={{ fontSize: '.54rem', fontWeight: 700, color: 'var(--green)', background: 'none', border: '1px solid var(--green)', borderRadius: 6, padding: '1px 6px', cursor: 'pointer', flexShrink: 0 }}>解決</button>
                        : <span style={{ fontSize: '.52rem', color: 'var(--green)', flexShrink: 0 }}>解決済</span>)}
                    </div>
                  ))}
                </>
              )}
              {openFlags.length > 0 && <div style={{ fontSize: '.56rem', color: 'var(--red)', fontWeight: 700, marginTop: 4 }}>未解決フラグ {openFlags.length}件</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TaskAdder({ onAdd, busy }: { onAdd: (body: Record<string, unknown>) => void; busy: boolean }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'task' | 'milestone'>('task')
  const [needs, setNeeds] = useState(false)
  const [due, setDue] = useState('')
  const inp: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 7, padding: '6px 8px', fontFamily: 'inherit', fontSize: '.68rem', background: '#fff' }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="タスク/マイルストーン名" style={{ ...inp, flex: 1, minWidth: 130 }} />
      <select value={type} onChange={e => setType(e.target.value as 'task' | 'milestone')} style={inp}><option value="task">タスク</option><option value="milestone">マイルストーン</option></select>
      <input type="date" value={due} onChange={e => setDue(e.target.value)} style={inp} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '.6rem', color: 'var(--muted2)' }}><input type="checkbox" checked={needs} onChange={e => setNeeds(e.target.checked)} />成果物</label>
      <button onClick={() => { if (!title.trim()) return; onAdd({ title: title.trim(), type, needs_deliverable: needs, due_date: due || null, sort: Date.now() % 100000 }); setTitle(''); setDue(''); setNeeds(false) }} disabled={busy || !title.trim()} className="btn btn-g" style={{ fontSize: '.68rem', padding: '6px 11px' }}>＋ 追加</button>
    </div>
  )
}
