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
  const nextTask = doTasks.find(t => t.status !== 'done') ?? null
  const messages = [...updates].filter(u => u.kind === 'message').sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))

  async function toggleTask(t: VTask) {
    setBusy(true)
    try {
      const r = await fetch(`/api/vendor/tasks/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: t.status === 'done' ? 'pending' : 'done' }) })
      if (r.ok) router.refresh(); else show('更新に失敗しました')
    } catch { show('更新に失敗しました') } finally { setBusy(false) }
  }

  return (
    <div style={{ padding: '8px 20px 0' }}>
      {/* 次にやること（強調カード） */}
      {nextTask && (
        <div style={{ marginTop: 14, background: 'linear-gradient(135deg,#4733E6,#3A28CE)', borderRadius: 14, padding: '14px 16px', color: '#fff' }}>
          <div style={{ fontSize: '.56rem', fontWeight: 700, opacity: .85, marginBottom: 4 }}>次にやること</div>
          <div style={{ fontSize: '.92rem', fontWeight: 800, letterSpacing: '-.01em' }}>{nextTask.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            {nextTask.due_date && <span style={{ fontSize: '.6rem', opacity: .9 }}>期限 {nextTask.due_date.slice(5).replace('-', '/')}</span>}
            {nextTask.needs_deliverable && <span style={{ fontSize: '.52rem', fontWeight: 700, background: 'rgba(255,255,255,.2)', borderRadius: 20, padding: '2px 9px' }}>成果物が必要</span>}
            <button onClick={() => toggleTask(nextTask)} disabled={busy} style={{ marginLeft: 'auto', fontSize: '.64rem', fontWeight: 700, color: 'var(--c-blue)', background: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>完了にする</button>
          </div>
        </div>
      )}

      {/* やること（tasks） */}
      <h2 style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted2)', margin: '18px 0 8px' }}>やること</h2>
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

      {/* MB とのやり取り（双方向チャット） */}
      <h2 style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted2)', margin: '18px 0 8px' }}>MB とのやり取り</h2>
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '12px 12px 10px' }}>
        {messages.length === 0 ? (
          <p style={{ fontSize: '.66rem', color: 'var(--muted2)', padding: '8px 2px', textAlign: 'center' }}>MB とのメッセージがここに表示されます。</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
            {messages.map(m => {
              const mine = m.sender === 'vendor'
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  {!mine && <span style={{ fontSize: '.52rem', color: 'var(--muted2)', fontWeight: 700, margin: '0 0 2px 4px' }}>MB</span>}
                  <div style={{ maxWidth: '78%', padding: '8px 12px', borderRadius: 13, fontSize: '.74rem', lineHeight: 1.55,
                    background: mine ? 'var(--c-blue)' : 'var(--bg2)', color: mine ? '#fff' : 'var(--txt)',
                    borderBottomRightRadius: mine ? 4 : 13, borderBottomLeftRadius: mine ? 13 : 4 }}>{m.body}</div>
                  <span style={{ fontSize: '.5rem', color: 'var(--muted)', margin: '2px 4px 0' }}>{m.created_at ? new Date(m.created_at).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>
              )
            })}
          </div>
        )}
        <ChatComposer assignmentId={assignmentId} onDone={() => router.refresh()} onError={show} />
      </div>
      {toast && <div style={{ position: 'fixed', bottom: 'calc(92px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', background: 'var(--txt)', color: '#fff', padding: '12px 22px', borderRadius: 10, fontSize: '.74rem', fontWeight: 600, zIndex: 120 }}>{toast}</div>}
    </div>
  )
}

function ChatComposer({ assignmentId, onDone, onError }: { assignmentId: string; onDone: () => void; onError: (m: string) => void }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  async function send() {
    if (!body.trim()) return
    setBusy(true)
    try {
      const r = await fetch('/api/vendor/updates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_assignment_id: assignmentId, kind: 'message', body: body.trim() }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.update) { setBody(''); onDone() }
      else { onError(d.error ?? '送信に失敗しました'); setBusy(false) }
    } catch { onError('送信に失敗しました'); setBusy(false) }
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, paddingTop: 10, borderTop: '1px solid #F2F2F6' }}>
      <input value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send() }} placeholder="メッセージを入力" disabled={busy}
        style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 999, padding: '9px 14px', fontFamily: 'inherit', fontSize: '.76rem' }} />
      <button onClick={send} disabled={busy || !body.trim()} aria-label="送信" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, border: 'none', cursor: busy || !body.trim() ? 'default' : 'pointer', background: body.trim() ? 'var(--c-blue)' : 'var(--bg2)', color: body.trim() ? '#fff' : 'var(--muted2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
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
      {/* V-c1：素のfile inputをドロップゾーン風ラベルに（input の name/onChange/ref/挙動は不変・display:noneで内包）。 */}
      <label style={{ display: 'block', border: `1.5px dashed ${file ? 'var(--blue)' : 'var(--line)'}`, borderRadius: 10, padding: '14px 12px', textAlign: 'center', cursor: busy ? 'not-allowed' : 'pointer', background: file ? 'var(--blue-bg2)' : 'var(--bg2)', marginBottom: 8, transition: 'border-color .15s, background .15s' }}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} disabled={busy} style={{ display: 'none' }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '.72rem', fontWeight: 700, color: file ? 'var(--txt)' : 'var(--blue)', maxWidth: '100%' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" style={{ flexShrink: 0 }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file ? file.name : 'ファイルを選択（画像・PDF）'}</span>
        </span>
        {file && <span style={{ display: 'block', fontSize: '.58rem', color: 'var(--muted2)', marginTop: 4 }}>タップで変更</span>}
      </label>
      {tasks.length > 0 && (
        <select value={taskId} onChange={e => setTaskId(e.target.value)} disabled={busy} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: '.72rem', background: '#fff', marginBottom: 8 }}>
          <option value="">対象タスク（任意）</option>
          {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      )}
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="メモ（任意）" disabled={busy} style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: '.72rem', marginBottom: 8 }} />
      {/* V-c2：見た目のみ。disabled条件(busy||!file)・onClick・送信処理は不変。無効時=明確なグレー、有効時=ブランド濃色ソリッド。 */}
      <button onClick={submit} disabled={busy || !file} className="btn btn-p" style={{ width: '100%', justifyContent: 'center', ...((busy || !file) ? { background: 'var(--bg2)', color: 'var(--muted2)', border: '1px solid var(--line)', opacity: 1 } : {}) }}>{busy ? 'アップロード中…' : '成果物を提出'}</button>
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
      {/* V-c2：有効時=ブランド濃色ソリッド(btn-p)、無効時=明確なグレー。disabled条件(busy||!body.trim())・onClick・送信処理は不変。 */}
      <button onClick={submit} disabled={busy || !body.trim()} className="btn btn-p" style={{ width: '100%', justifyContent: 'center', ...((busy || !body.trim()) ? { background: 'var(--bg2)', color: 'var(--muted2)', border: '1px solid var(--line)', opacity: 1 } : {}) }}>{busy ? '送信中…' : '投稿する'}</button>
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
