'use client'
import { useState, useMemo } from 'react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'

export type Msg = {
  id: string; created_at: string; partner_id: string | null; customer_email: string | null
  direction: 'in' | 'out'; channel: 'line' | 'email'; subject: string | null; body: string | null
  status: string | null; error: string | null; thread_key: string
}
export type ThreadRow = {
  key: string; label: string; kind: 'partner' | 'customer'
  partnerId?: string; customerEmail?: string; hasLine: boolean
  lastBody: string | null; lastAt: string | null
}

const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

export default function MessagesClient({ threads, messages }: { threads: ThreadRow[]; messages: Msg[] }) {
  const [sel, setSel] = useState<string | null>(threads[0]?.key ?? null)
  const [msgs, setMsgs] = useState<Msg[]>(messages)
  const [body, setBody] = useState(''); const [subject, setSubject] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')

  const thread = threads.find(t => t.key === sel) ?? null
  const channel: 'line' | 'email' = thread?.kind === 'partner' ? 'line' : 'email'
  const threadMsgs = useMemo(() => msgs.filter(m => m.thread_key === sel).sort((a, b) => a.created_at.localeCompare(b.created_at)), [msgs, sel])

  async function send() {
    if (busy || !thread || !body.trim()) return
    setBusy(true); setErr('')
    try {
      const payload = channel === 'line'
        ? { channel: 'line', partnerId: thread.partnerId, body }
        : { channel: 'email', partnerId: thread.partnerId ?? null, customerEmail: thread.customerEmail, subject: subject || undefined, body }
      const res = await fetch('/api/console/messages/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j?.error || '送信に失敗しました'); return }
      if (j.message) setMsgs(prev => [...prev, j.message as Msg])
      if (!j.ok) setErr(j.error || '送信は記録されましたが配信に失敗しました')
      setBody(''); setSubject('')
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* 左：相手リスト */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--line)', background: 'var(--s-0)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--line)' }}>
          <p className="eyebrow" style={{ marginBottom: 2 }}>司令塔</p>
          <h1 style={{ fontSize: '1rem', fontWeight: 900, lineHeight: 1 }}>メッセージ</h1>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {threads.length === 0 ? (
            <EmptyState title="相手がいません" hint="LINE連携パートナー、または送信した顧客がここに並びます。" compact />
          ) : threads.map(t => {
            const on = t.key === sel
            return (
              <button key={t.key} onClick={() => { setSel(t.key); setErr('') }} className="ui-row" style={{ width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer', background: on ? 'var(--s-1)' : 'transparent', fontFamily: 'inherit', alignItems: 'flex-start', flexDirection: 'column', gap: 3, padding: '11px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%' }}>
                  <span style={{ flexShrink: 0, fontSize: '.48rem', fontWeight: 800, color: t.kind === 'partner' ? 'var(--c-blue)' : 'var(--green)', background: t.kind === 'partner' ? 'var(--blue-bg)' : 'var(--green-bg)', borderRadius: 5, padding: '2px 6px' }}>{t.kind === 'partner' ? 'LINE' : 'メール'}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: '.78rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                  <span style={{ flexShrink: 0, fontSize: '.54rem', color: 'var(--t-tertiary)' }}>{fmt(t.lastAt).slice(0, 5)}</span>
                </div>
                {t.lastBody && <div style={{ fontSize: '.62rem', color: 'var(--muted2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>{t.lastBody}</div>}
              </button>
            )
          })}
        </div>
      </div>

      {/* 右：スレッド＋送信 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!thread ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><EmptyState title="相手を選んでください" compact /></div>
        ) : (<>
          <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--line)', background: 'var(--s-0)' }}>
            <div style={{ fontSize: '.86rem', fontWeight: 800 }}>{thread.label}</div>
            <div style={{ fontSize: '.6rem', color: 'var(--t-tertiary)', marginTop: 2 }}>{channel === 'line' ? 'LINE で送信' : 'メールで送信'}・受信表示はLINE/メール連携後に追加</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {threadMsgs.length === 0 ? <EmptyState title="まだメッセージはありません" hint="下のボックスから送信できます。" compact />
              : threadMsgs.map(m => (
                <div key={m.id} style={{ alignSelf: m.direction === 'out' ? 'flex-end' : 'flex-start', maxWidth: '72%' }}>
                  <div style={{ background: m.direction === 'out' ? 'var(--c-blue)' : 'var(--s-2)', color: m.direction === 'out' ? '#fff' : 'var(--txt)', borderRadius: 12, padding: '9px 13px', fontSize: '.76rem', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {m.subject && <div style={{ fontWeight: 800, marginBottom: 3 }}>{m.subject}</div>}{m.body}
                  </div>
                  <div style={{ fontSize: '.52rem', color: 'var(--t-tertiary)', marginTop: 3, textAlign: m.direction === 'out' ? 'right' : 'left' }}>
                    {m.channel === 'line' ? 'LINE' : 'メール'}・{fmt(m.created_at)}{m.status === 'failed' && <span style={{ color: 'var(--red)' }}> ・送信失敗</span>}
                  </div>
                </div>
              ))}
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: '12px 24px 16px', background: 'var(--s-0)' }}>
            {channel === 'email' && (
              <input className="ui-field" value={subject} onChange={e => setSubject(e.target.value)} placeholder="件名（任意）" style={{ marginBottom: 8 }} />
            )}
            <textarea className="ui-field" value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder={channel === 'line' ? 'LINE メッセージを入力…' : 'メール本文を入力…'} style={{ resize: 'vertical' }} />
            {err && <p style={{ fontSize: '.66rem', color: 'var(--red)', margin: '6px 0 0' }}>{err}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="primary" size="md" busy={busy} disabled={!body.trim()} onClick={send}>{channel === 'line' ? 'LINE 送信' : 'メール送信'}</Button>
            </div>
          </div>
        </>)}
      </div>
    </div>
  )
}
