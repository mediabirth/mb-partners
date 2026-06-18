'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { VTask, VDeliverable, VUpdate } from '@/lib/vendor-data'

// V-2: 案件ワークスペースの実行シグナル（vendorが返せるもの）：タスク完了・成果物提出・進捗メモ/フラグ。
// 構造（タスク/マイルストーン/概要）は作成/編集/削除できない＝完了チェック・提出・投稿のみ。
export default function VendorWorkspace({ assignmentId, tasks, deliverables, updates }: {
  assignmentId: string; tasks: VTask[]; deliverables: VDeliverable[]; updates: VUpdate[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const show = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600) }
  const doTasks = [...tasks].filter(t => t.type === 'task').sort((a, b) => a.sort - b.sort)

  async function toggleTask(t: VTask) {
    setBusy(true)
    try {
      const r = await fetch(`/api/vendor/tasks/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: t.status === 'done' ? 'pending' : 'done' }) })
      if (r.ok) router.refresh(); else show('更新に失敗しました')
    } catch { show('更新に失敗しました') } finally { setBusy(false) }
  }

  return (
    <div style={{ padding: '8px 20px 0' }}>
      {/* やること（tasks） */}
      <h2 style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted2)', margin: '14px 0 8px' }}>やること</h2>
      {doTasks.length === 0 ? (
        <p style={{ fontSize: '.68rem', color: 'var(--muted2)', padding: '4px 2px' }}>MB がタスクを設定するとここに表示されます。</p>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          {doTasks.map((t, i) => {
            const done = t.status === 'done'
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderBottom: i < doTasks.length - 1 ? '1px solid #F2F2F6' : 'none' }}>
                <button onClick={() => toggleTask(t)} disabled={busy} aria-label="完了" style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, cursor: 'pointer', border: `1.5px solid ${done ? 'var(--green)' : 'var(--line)'}`, background: done ? 'var(--green)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  {done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.76rem', fontWeight: 600, textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--muted2)' : 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                    {t.needs_deliverable && <span style={{ fontSize: '.5rem', fontWeight: 700, color: 'var(--amber)', background: 'var(--amber-bg)', borderRadius: 6, padding: '1px 5px' }}>成果物が必要</span>}
                    {t.due_date && <span style={{ fontSize: '.56rem', color: 'var(--muted2)' }}>期日 {t.due_date.slice(5)}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 成果物 */}
      <h2 style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted2)', margin: '18px 0 8px' }}>成果物</h2>
      <DeliverableUploader assignmentId={assignmentId} tasks={doTasks.filter(t => t.needs_deliverable)} onDone={() => router.refresh()} onError={show} />
      <div style={{ marginTop: 10 }}>
        {deliverables.length === 0 ? (
          <p style={{ fontSize: '.66rem', color: 'var(--muted2)', padding: '4px 2px' }}>まだ成果物はありません。</p>
        ) : (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
            {deliverables.map((d, i) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderBottom: i < deliverables.length - 1 ? '1px solid #F2F2F6' : 'none' }}>
                <FileThumb id={d.id} hasFile={d.has_file} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.74rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.file_name ?? '成果物'}</div>
                  <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 1 }}>{d.created_at ? new Date(d.created_at).toLocaleDateString('ja') : ''}{d.note ? ` · ${d.note}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 進捗メモ / 課題フラグ */}
      <h2 style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted2)', margin: '18px 0 8px' }}>進捗メモ / 課題フラグ</h2>
      <UpdatePoster assignmentId={assignmentId} onDone={() => router.refresh()} onError={show} />
      <div style={{ marginTop: 10 }}>
        {updates.length === 0 ? (
          <p style={{ fontSize: '.66rem', color: 'var(--muted2)', padding: '4px 2px' }}>まだ投稿はありません。</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {updates.map(u => (
              <div key={u.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 9 }}>
                <span style={{ flexShrink: 0 }}>{u.kind === 'flag' ? '🚩' : '📝'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.72rem', lineHeight: 1.6 }}>{u.body}</div>
                  <div style={{ fontSize: '.56rem', color: 'var(--muted2)', marginTop: 3 }}>
                    {u.created_at ? new Date(u.created_at).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    {u.kind === 'flag' && <span style={{ marginLeft: 7, fontWeight: 700, color: u.status === 'resolved' ? 'var(--green)' : 'var(--amber)' }}>{u.status === 'resolved' ? '解決済' : '対応中'}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {toast && <div style={{ position: 'fixed', bottom: 'calc(92px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', background: 'var(--txt)', color: '#fff', padding: '12px 22px', borderRadius: 10, fontSize: '.74rem', fontWeight: 600, zIndex: 120 }}>{toast}</div>}
    </div>
  )
}

function DeliverableUploader({ assignmentId, tasks, onDone, onError }: { assignmentId: string; tasks: VTask[]; onDone: () => void; onError: (m: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [taskId, setTaskId] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  async function submit() {
    if (!file) { onError('ファイルを選択してください'); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('delivery_assignment_id', assignmentId); fd.append('file', file)
      if (note.trim()) fd.append('note', note.trim())
      if (taskId) fd.append('task_id', taskId)
      const r = await fetch('/api/vendor/deliverables', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.deliverable) { setFile(null); setNote(''); setTaskId(''); if (fileRef.current) fileRef.current.value = ''; onDone() }
      else { onError(d.error ?? '提出に失敗しました'); setBusy(false) }
    } catch { onError('提出に失敗しました'); setBusy(false) }
  }
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} disabled={busy} style={{ fontSize: '.66rem', width: '100%', marginBottom: 8 }} />
      {tasks.length > 0 && (
        <select value={taskId} onChange={e => setTaskId(e.target.value)} disabled={busy} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: '.72rem', background: '#fff', marginBottom: 8 }}>
          <option value="">対象タスク（任意）</option>
          {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      )}
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="メモ（任意）" disabled={busy} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: '.72rem', marginBottom: 8 }} />
      <button onClick={submit} disabled={busy || !file} className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }}>{busy ? 'アップロード中…' : '成果物を提出'}</button>
    </div>
  )
}

function UpdatePoster({ assignmentId, onDone, onError }: { assignmentId: string; onDone: () => void; onError: (m: string) => void }) {
  const [kind, setKind] = useState<'note' | 'flag'>('note')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!body.trim()) { onError('内容を入力してください'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/vendor/updates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_assignment_id: assignmentId, kind, body: body.trim() }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.update) { setBody(''); setKind('note'); onDone() }
      else { onError(d.error ?? '投稿に失敗しました'); setBusy(false) }
    } catch { onError('投稿に失敗しました'); setBusy(false) }
  }
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {([['note', '📝 メモ'], ['flag', '🚩 課題フラグ']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} disabled={busy} style={{ flex: 1, padding: '8px 0', borderRadius: 9, fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${kind === k ? (k === 'flag' ? 'var(--red)' : 'var(--blue)') : 'var(--line)'}`, background: kind === k ? (k === 'flag' ? 'var(--red-bg)' : 'var(--blue-bg)') : '#fff', color: kind === k ? (k === 'flag' ? 'var(--red)' : 'var(--blue)') : 'var(--txt)' }}>{l}</button>
        ))}
      </div>
      <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} placeholder={kind === 'flag' ? '困っていること・ブロッカーを記入' : '進捗を記入'} disabled={busy} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.74rem', resize: 'vertical', marginBottom: 8 }} />
      <button onClick={submit} disabled={busy || !body.trim()} className="btn btn-g" style={{ width: '100%', justifyContent: 'center' }}>{busy ? '送信中…' : '投稿する'}</button>
    </div>
  )
}

function FileThumb({ id, hasFile }: { id: string; hasFile: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'img' | 'doc'>('idle')
  useEffect(() => {
    if (!hasFile) return
    let alive = true
    fetch(`/api/vendor/deliverables/${id}/file`).then(r => r.json()).then(d => { if (!alive) return; if (d.url) { setUrl(d.url); setState('img') } else setState('doc') }).catch(() => { if (alive) setState('doc') })
    return () => { alive = false }
  }, [id, hasFile])
  const box: React.CSSProperties = { width: 44, height: 44, borderRadius: 10, flexShrink: 0, border: '1px solid var(--line)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)' }
  if (!hasFile) return <div style={{ ...box, color: 'var(--muted)' }}>—</div>
  if (state === 'img' && url) return (
    <button onClick={() => window.open(url, '_blank', 'noopener')} style={{ ...box, padding: 0, cursor: 'zoom-in' }} title="開く">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="成果物" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setState('doc')} />
    </button>
  )
  return <button onClick={() => url && window.open(url, '_blank', 'noopener')} style={{ ...box, cursor: 'pointer', color: 'var(--blue)', fontSize: '1.1rem' }} title="開く">📄</button>
}
