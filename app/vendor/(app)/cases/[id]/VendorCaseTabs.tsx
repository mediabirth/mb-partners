'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { VTask, VDeliverable, VUpdate, VExpense } from '@/lib/vendor-data'
import VendorCaseExpense from './VendorCaseExpense'

type Tab = 'todo' | 'message' | 'money'

// 案件詳細＝3タブ（やること / メッセージ / お金）。上部固定（ヘッダ・進捗・次にやること）は page 側。
export default function VendorCaseTabs({ assignmentId, customerLabel, baseFee, tasks, deliverables, updates, expenses }: {
  assignmentId: string; customerLabel: string; baseFee: number
  tasks: VTask[]; deliverables: VDeliverable[]; updates: VUpdate[]; expenses: VExpense[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('todo')
  const [toast, setToast] = useState('')
  const show = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2400) }

  const doTasks = [...tasks].filter(t => t.type === 'task').sort((a, b) => a.sort - b.sort)
  const nextTask = doTasks.find(t => t.status !== 'done') ?? null
  const nextId = nextTask?.id ?? null
  const messages = [...updates].filter(u => u.kind === 'message').sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  const delivered = deliverables.length > 0

  const TABS: { k: Tab; label: string; badge?: number }[] = [
    { k: 'todo', label: 'やること', badge: doTasks.filter(t => t.status !== 'done').length || undefined },
    { k: 'message', label: 'メッセージ', badge: messages.length || undefined },
    { k: 'money', label: 'お金' },
  ]

  return (
    <div>
      {/* 次にやること（上部固定の強調カード・完了ボタン付き） */}
      {nextTask && <NextTaskCard task={nextTask} onChange={() => router.refresh()} onError={show} />}

      {/* タブバー（active=青地白文字） */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)', padding: '10px 20px 6px' }}>
        <div style={{ display: 'flex', gap: 6, background: 'var(--bg2)', borderRadius: 12, padding: 4 }}>
          {TABS.map(t => {
            const on = tab === t.k
            return (
              <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: on ? 500 : 400, background: on ? 'var(--c-blue)' : 'transparent', color: on ? '#fff' : 'var(--muted2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background .15s' }}>
                {t.label}
                {t.badge != null && <span style={{ fontSize: '.56rem', fontWeight: 500, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: on ? 'rgba(255,255,255,.25)' : 'var(--line)', color: on ? '#fff' : 'var(--muted2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{t.badge}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'todo' && <TodoTab assignmentId={assignmentId} doTasks={doTasks} nextId={nextId} deliverables={deliverables} onChange={() => router.refresh()} onError={show} />}
      {tab === 'message' && <MessageTab assignmentId={assignmentId} messages={messages} onChange={() => router.refresh()} onError={show} />}
      {tab === 'money' && <MoneyTab assignmentId={assignmentId} customerLabel={customerLabel} baseFee={baseFee} delivered={delivered} expenses={expenses} />}

      {toast && <div style={{ position: 'fixed', bottom: 'calc(92px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', background: 'var(--txt)', color: '#fff', padding: '12px 22px', borderRadius: 10, fontSize: '.74rem', fontWeight: 500, zIndex: 120 }}>{toast}</div>}
    </div>
  )
}

function NextTaskCard({ task, onChange, onError }: { task: VTask; onChange: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false)
  async function done() {
    setBusy(true)
    try { const r = await fetch(`/api/vendor/tasks/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }); if (r.ok) onChange(); else onError('更新に失敗しました') }
    catch { onError('更新に失敗しました') } finally { setBusy(false) }
  }
  // v2.2：塗り・装飾円は撤去（案件詳細の塗りはゼロ）。0.5px罫線＋左4pxのaccentバーの静かな強調。
  return (
    <div style={{ margin: '14px 20px 0', background: '#fff', border: '0.5px solid var(--line)', borderLeft: '4px solid var(--c-blue)', borderRadius: 14, padding: '14px 16px', color: 'var(--txt)' }}>
      <div style={{ fontSize: '.56rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 4 }}>次にやること</div>
      <div style={{ fontSize: '.92rem', fontWeight: 500, letterSpacing: '-.01em' }}>{task.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 }}>
        {task.due_date && <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>期限 {task.due_date.slice(5).replace('-', '/')}</span>}
        {task.needs_deliverable && <span style={{ fontSize: '.52rem', fontWeight: 500, color: 'var(--muted2)', border: '0.5px solid var(--line)', borderRadius: 20, padding: '2px 9px' }}>成果物が必要</span>}
        <button onClick={done} disabled={busy} className="ui-btn ui-btn--primary ui-btn--sm" style={{ marginLeft: 'auto' }}>{busy ? '…' : '完了にする'}</button>
      </div>
    </div>
  )
}

// ─── やること ───────────────────────────────────────────────
function TodoTab({ assignmentId, doTasks, nextId, deliverables, onChange, onError }: { assignmentId: string; doTasks: VTask[]; nextId: string | null; deliverables: VDeliverable[]; onChange: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  async function toggle(t: VTask) {
    setBusy(true)
    try { const r = await fetch(`/api/vendor/tasks/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: t.status === 'done' ? 'pending' : 'done' }) }); if (r.ok) onChange(); else onError('更新に失敗しました') }
    catch { onError('更新に失敗しました') } finally { setBusy(false) }
  }
  return (
    <div style={{ padding: '8px 20px 24px' }}>
      <h2 style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', margin: '8px 0 8px' }}>タスク</h2>
      {doTasks.length === 0 ? (
        <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '20px 16px', textAlign: 'center', fontSize: '.7rem', color: 'var(--muted2)' }}>タスクはまだありません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {doTasks.map(t => {
            const done = t.status === 'done'; const isNext = t.id === nextId
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: '#fff', borderRadius: 12, border: isNext ? '1.5px solid var(--c-blue)' : '0.5px solid var(--line)' }}>
                <button onClick={() => toggle(t)} disabled={busy} aria-label="完了" style={{ width: 24, height: 24, borderRadius: done ? 8 : '50%', flexShrink: 0, cursor: 'pointer', border: `1.5px solid ${done ? 'var(--green)' : isNext ? 'var(--c-blue)' : 'var(--line)'}`, background: done ? 'var(--green)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  {done && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.78rem', fontWeight: isNext ? 500 : 400, textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--muted2)' : 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                  {(t.due_date || t.needs_deliverable || isNext) && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                      {isNext && <span style={{ fontSize: '.5rem', fontWeight: 500, color: 'var(--c-blue)', border: '0.5px solid var(--line)', borderRadius: 6, padding: '1px 6px' }}>次のタスク</span>}
                      {t.needs_deliverable && <span style={{ fontSize: '.5rem', fontWeight: 500, color: 'var(--muted2)', border: '0.5px solid var(--line)', borderRadius: 6, padding: '1px 6px' }}>成果物が必要</span>}
                      {t.due_date && <span style={{ fontSize: '.56rem', color: 'var(--muted2)' }}>期限 {t.due_date.slice(5).replace('-', '/')}</span>}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 成果物：押した時だけフォーム展開 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 8px' }}>
        <h2 style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)' }}>成果物</h2>
        <button onClick={() => setShowForm(v => !v)} style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--c-blue)', background: 'transparent', border: '0.5px solid var(--line)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>{showForm ? '閉じる' : '＋ 提出する'}</button>
      </div>
      {showForm && <DeliverableUploader assignmentId={assignmentId} tasks={doTasks.filter(t => t.needs_deliverable)} onDone={() => { setShowForm(false); onChange() }} onError={onError} />}
      <div style={{ marginTop: showForm ? 10 : 0 }}>
        {deliverables.length === 0 ? (
          !showForm && <div style={{ background: '#fff', border: '0.5px dashed var(--line)', borderRadius: 12, padding: '16px', textAlign: 'center', fontSize: '.68rem', color: 'var(--muted2)' }}>まだ成果物はありません</div>
        ) : (
          <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
            {deliverables.map((d, i) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderBottom: i < deliverables.length - 1 ? '0.5px solid var(--line)' : 'none' }}>
                <FileThumb id={d.id} hasFile={d.has_file} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.74rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.file_name ?? '成果物'}</div>
                  <div suppressHydrationWarning style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 1 }}>{d.created_at ? new Date(d.created_at).toLocaleDateString('ja', { timeZone: 'Asia/Tokyo' }) : ''}{d.note ? ` ・ ${d.note}` : ''}</div>
                </div>
                <span style={{ fontSize: '.5rem', fontWeight: 500, color: 'var(--green)', border: '0.5px solid var(--line)', borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>納品済</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── メッセージ ─────────────────────────────────────────────
function MessageTab({ assignmentId, messages, onChange, onError }: { assignmentId: string; messages: VUpdate[]; onChange: () => void; onError: (m: string) => void }) {
  // 日付区切りでグルーピング
  const groups: { date: string; items: VUpdate[] }[] = []
  for (const m of messages) {
    const day = (m.created_at ?? '').slice(0, 10)
    const g = groups[groups.length - 1]
    if (g && g.date === day) g.items.push(m); else groups.push({ date: day, items: [m] })
  }
  const dayLabel = (iso: string) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${Number(m[2])}月${Number(m[3])}日` : '' }

  return (
    <div style={{ padding: '12px 20px 24px' }}>
      {messages.length === 0 ? (
        <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '28px 18px', textAlign: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted2)" strokeWidth="1.7" style={{ marginBottom: 8 }} aria-hidden><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <div style={{ fontSize: '.74rem', fontWeight: 500 }}>MB とのメッセージ</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map(g => (
            <div key={g.date}>
              <div style={{ textAlign: 'center', margin: '2px 0 10px' }}><span style={{ fontSize: '.54rem', color: 'var(--muted2)', fontWeight: 500, background: 'var(--bg2)', borderRadius: 999, padding: '3px 12px' }}>{dayLabel(g.date)}</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {g.items.map(m => {
                  const mine = m.sender === 'vendor'
                  return (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                      {!mine && <span style={{ fontSize: '.52rem', color: 'var(--muted2)', fontWeight: 500, margin: '0 0 3px 6px' }}>MB</span>}
                      <div style={{ maxWidth: '80%', padding: '9px 13px', borderRadius: 16, fontSize: '.75rem', lineHeight: 1.55, background: mine ? 'var(--c-blue)' : '#fff', color: mine ? '#fff' : 'var(--txt)', border: mine ? 'none' : '0.5px solid var(--line)', borderBottomRightRadius: mine ? 5 : 16, borderBottomLeftRadius: mine ? 16 : 5 }}>{m.body}</div>
                      <span suppressHydrationWarning style={{ fontSize: '.5rem', color: 'var(--muted)', margin: '3px 6px 0' }}>{m.created_at ? new Date(m.created_at).toLocaleTimeString('ja', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ position: 'sticky', bottom: 'calc(8px + env(safe-area-inset-bottom))', marginTop: 16 }}>
        <ChatComposer assignmentId={assignmentId} onDone={onChange} onError={onError} />
      </div>
    </div>
  )
}

// ─── お金 ───────────────────────────────────────────────────
function MoneyTab({ assignmentId, customerLabel, baseFee, delivered, expenses }: { assignmentId: string; customerLabel: string; baseFee: number; delivered: boolean; expenses: VExpense[] }) {
  return (
    <div style={{ padding: '12px 20px 0' }}>
      <h2 style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', margin: '4px 0 8px' }}>この案件の委託費</h2>
      <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '15px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '.72rem', color: 'var(--muted2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          委託費
          <span style={{ fontSize: '.5rem', fontWeight: 500, color: delivered ? 'var(--green)' : 'var(--amber)', border: '0.5px solid var(--line)', borderRadius: 20, padding: '2px 9px' }}>{delivered ? '納品済・確定' : '納品後に確定'}</span>
        </span>
        <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.15rem', fontWeight: 500 }}>¥{baseFee.toLocaleString()}</span>
      </div>
      <p style={{ fontSize: '.58rem', color: 'var(--muted)', margin: '7px 2px 0', lineHeight: 1.6 }}>委託費＋承認済の経費は「委託費」タブにまとまります。</p>
      <VendorCaseExpense assignmentId={assignmentId} label={customerLabel} initial={expenses} />
    </div>
  )
}

// ─── shared bits ────────────────────────────────────────────
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
    <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 12, padding: '12px 14px' }}>
      <label style={{ display: 'block', border: file ? '1.5px dashed var(--blue)' : '0.5px dashed var(--line)', borderRadius: 10, padding: '14px 12px', textAlign: 'center', cursor: busy ? 'not-allowed' : 'pointer', background: file ? 'var(--blue-bg2)' : 'var(--bg2)', marginBottom: 8 }}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} disabled={busy} style={{ display: 'none' }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '.72rem', fontWeight: 500, color: file ? 'var(--txt)' : 'var(--blue)', maxWidth: '100%' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" style={{ flexShrink: 0 }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file ? file.name : 'ファイルを選択（画像・PDF）'}</span>
        </span>
      </label>
      {tasks.length > 0 && (
        <select value={taskId} onChange={e => setTaskId(e.target.value)} disabled={busy} style={{ width: '100%', border: '0.5px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: '.72rem', background: '#fff', marginBottom: 8 }}>
          <option value="">対象タスク（任意）</option>
          {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      )}
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="メモ（任意）" disabled={busy} style={{ width: '100%', border: '0.5px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: '.72rem', marginBottom: 8 }} />
      <button onClick={submit} disabled={busy || !file} className="ui-btn ui-btn--primary ui-btn--md" style={{ width: '100%', justifyContent: 'center' }}>{busy ? 'アップロード中…' : '成果物を提出'}</button>
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
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 999, padding: '5px 5px 5px 6px', boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
      <input value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send() }} placeholder="メッセージを入力" disabled={busy}
        style={{ flex: 1, border: 'none', outline: 'none', padding: '8px 12px', fontFamily: 'inherit', fontSize: '.78rem', background: 'transparent' }} />
      <button onClick={send} disabled={busy || !body.trim()} aria-label="送信" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, border: 'none', cursor: busy || !body.trim() ? 'default' : 'pointer', background: body.trim() ? 'var(--c-blue)' : 'var(--bg2)', color: body.trim() ? '#fff' : 'var(--muted2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
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
  const box: React.CSSProperties = { width: 44, height: 44, borderRadius: 10, flexShrink: 0, border: '0.5px solid var(--line)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)' }
  if (!hasFile) return <div style={{ ...box, color: 'var(--muted)' }}>—</div>
  if (state === 'img' && url) return (
    <button onClick={() => window.open(url, '_blank', 'noopener')} style={{ ...box, padding: 0, cursor: 'zoom-in' }} title="開く">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="成果物" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setState('doc')} />
    </button>
  )
  return (
    <button onClick={() => url && window.open(url, '_blank', 'noopener')} style={{ ...box, cursor: 'pointer', color: 'var(--blue)' }} title="開く">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  )
}
