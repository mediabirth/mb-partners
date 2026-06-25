'use client'
import { useState, useMemo, type ChangeEvent } from 'react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'

export type Attachment = { type: string; path: string }
export type Msg = {
  id: string; created_at: string; partner_id: string | null; customer_email: string | null
  direction: 'in' | 'out'; channel: 'line' | 'email'; subject: string | null; body: string | null
  status: string | null; error: string | null; thread_key: string
  attachments?: Attachment[] | null
}
export type ThreadRow = {
  key: string; label: string; kind: 'partner' | 'customer' | 'unknown'
  partnerId?: string; customerEmail?: string; hasLine: boolean
  lastBody: string | null; lastAt: string | null
}
export type TemplateButton = { label: string; url: string }
export type Template = {
  id: string; title: string; body: string | null; subject: string | null; category: string | null
  channel: 'line' | 'email' | 'both' | null; attachments: Attachment[] | null; buttons: TemplateButton[] | null; sort_order: number
}
type PendingImage = { path: string; previewUrl: string; filename: string }

const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

export default function MessagesClient({ threads, messages, signedUrls = {}, templates = [] }: { threads: ThreadRow[]; messages: Msg[]; signedUrls?: Record<string, string>; templates?: Template[] }) {
  const [sel, setSel] = useState<string | null>(threads[0]?.key ?? null)
  const [msgs, setMsgs] = useState<Msg[]>(messages)
  const [body, setBody] = useState(''); const [subject, setSubject] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [tplOpen, setTplOpen] = useState(false)
  const [pending, setPending] = useState<PendingImage[]>([])   // 送信前にアップロード済みの画像
  const [pendingButtons, setPendingButtons] = useState<TemplateButton[]>([])   // テンプレ由来のURLボタン
  const [urls, setUrls] = useState<Record<string, string>>(signedUrls)   // path→署名URL（送信後の表示用にローカル追記）

  const thread = threads.find(t => t.key === sel) ?? null
  const channel: 'line' | 'email' = thread?.kind === 'partner' ? 'line' : 'email'
  // 未連携LINE（kind='unknown'）は送信先userIdを保持しない方針 → 受信表示のみ・送信不可。
  const canSend = thread?.kind === 'partner' || thread?.kind === 'customer'
  const threadMsgs = useMemo(() => msgs.filter(m => m.thread_key === sel).sort((a, b) => a.created_at.localeCompare(b.created_at)), [msgs, sel])
  // このチャネルに使えるテンプレ（line/email/both/null汎用）。
  const usableTpls = templates.filter(t => !t.channel || t.channel === 'both' || t.channel === channel)

  function insertTemplate(t: Template) {
    setBody(prev => (prev ? prev + '\n' : '') + (t.body ?? ''))
    if (channel === 'email' && t.subject) setSubject(t.subject)
    const imgs = (t.attachments ?? []).filter(a => a.type === 'image' && a.path)
    if (imgs.length) setPending(prev => [...prev, ...imgs.map(a => ({ path: a.path, previewUrl: urls[a.path] || '', filename: a.path.split('/').pop() || 'image' }))])
    if (t.buttons?.length) setPendingButtons(t.buttons)
    setTplOpen(false)
  }

  async function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErr('')
    try {
      const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file) })
      const res = await fetch('/api/console/messages/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, contentBase64: dataUrl }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.attachment) { setErr(j?.error || '画像アップロードに失敗しました'); return }
      if (j.previewUrl) setUrls(prev => ({ ...prev, [j.attachment.path]: j.previewUrl }))
      setPending(prev => [...prev, { path: j.attachment.path, previewUrl: j.previewUrl || '', filename: file.name }])
    } catch { setErr('画像アップロードに失敗しました') }
  }

  async function send() {
    if (busy || !thread || (!body.trim() && pending.length === 0 && pendingButtons.length === 0)) return
    setBusy(true); setErr('')
    try {
      const attachments = pending.map(p => ({ type: 'image', path: p.path }))
      const buttons = pendingButtons.filter(b => b.label?.trim() && /^https?:\/\//i.test(b.url ?? ''))
      const payload = channel === 'line'
        ? { channel: 'line', partnerId: thread.partnerId, body, attachments, buttons }
        : { channel: 'email', partnerId: thread.partnerId ?? null, customerEmail: thread.customerEmail, subject: subject || undefined, body, attachments, buttons }
      const res = await fetch('/api/console/messages/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j?.error || '送信に失敗しました'); return }
      if (j.message) setMsgs(prev => [...prev, j.message as Msg])
      if (!j.ok) setErr(j.error || '送信は記録されましたが配信に失敗しました')
      setBody(''); setSubject(''); setPending([]); setPendingButtons([])
    } catch { setErr('通信に失敗しました') } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* 左：相手リスト */}
      <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--line)', background: 'var(--s-0)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: '1rem', fontWeight: 900, lineHeight: 1 }}>メッセージ</h1>
            <a href="/console/settings/templates" className="ui-row" style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--c-blue)', textDecoration: 'none', padding: 0 }}>テンプレ設定</a>
          </div>
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
            <div style={{ fontSize: '.6rem', color: 'var(--t-tertiary)', marginTop: 2 }}>{thread.kind === 'unknown' ? '未連携の送信者（受信のみ・連携後に返信可能）' : channel === 'line' ? 'LINE で送受信' : 'メールで送受信'}</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {threadMsgs.length === 0 ? <EmptyState title="まだメッセージはありません" hint="下のボックスから送信できます。" compact />
              : threadMsgs.map(m => (
                <div key={m.id} style={{ alignSelf: m.direction === 'out' ? 'flex-end' : 'flex-start', maxWidth: '72%' }}>
                  <div style={{ background: m.direction === 'out' ? 'var(--c-blue)' : 'var(--s-2)', color: m.direction === 'out' ? '#fff' : 'var(--txt)', borderRadius: 12, padding: '9px 13px', fontSize: '.76rem', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {m.subject && <div style={{ fontWeight: 800, marginBottom: 3 }}>{m.subject}</div>}
                    {(m.attachments ?? []).filter(a => a.type === 'image' && urls[a.path]).map(a => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={a.path} href={urls[a.path]} target="_blank" rel="noopener noreferrer"><img src={urls[a.path]} alt="画像" style={{ display: 'block', maxWidth: 220, maxHeight: 220, borderRadius: 8, marginBottom: m.body ? 4 : 0 }} /></a>
                    ))}
                    {m.body}
                  </div>
                  <div style={{ fontSize: '.52rem', color: 'var(--t-tertiary)', marginTop: 3, textAlign: m.direction === 'out' ? 'right' : 'left' }}>
                    {m.channel === 'line' ? 'LINE' : 'メール'}・{fmt(m.created_at)}{m.status === 'failed' && <span style={{ color: 'var(--red)' }}> ・送信失敗</span>}
                  </div>
                </div>
              ))}
          </div>
          {!canSend ? (
            <div style={{ borderTop: '1px solid var(--line)', padding: '14px 24px 18px', background: 'var(--s-0)', fontSize: '.66rem', color: 'var(--t-tertiary)' }}>この相手はまだ連携前のため返信できません。LINE連携が完了すると返信できます。</div>
          ) : (
          <div style={{ borderTop: '1px solid var(--line)', padding: '12px 24px 16px', background: 'var(--s-0)' }}>
            {/* テンプレ挿入バー */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, position: 'relative' }}>
              {usableTpls.length > 0 ? (
                <button type="button" className="ui-btn ui-btn--secondary" onClick={() => setTplOpen(o => !o)} style={{ fontSize: '.62rem', padding: '6px 12px', borderRadius: 7 }}>
                  テンプレート（{usableTpls.length}）{tplOpen ? ' ▾' : ' ▸'}
                </button>
              ) : (
                <span style={{ fontSize: '.6rem', color: 'var(--t-tertiary)' }}>テンプレート未登録 <a href="/console/settings/templates" style={{ color: 'var(--c-blue)', fontWeight: 700, textDecoration: 'none' }}>登録する</a></span>
              )}
              <label className="ui-btn ui-btn--secondary" style={{ fontSize: '.62rem', padding: '6px 12px', borderRadius: 7, cursor: 'pointer' }}>
                画像を添付
                <input type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} />
              </label>
              {tplOpen && usableTpls.length > 0 && (
                <div style={{ position: 'absolute', bottom: '110%', left: 0, zIndex: 20, width: 280, maxHeight: 260, overflowY: 'auto', background: 'var(--s-0)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
                  {usableTpls.map(t => (
                    <button key={t.id} type="button" onClick={() => insertTemplate(t)} className="ui-row" style={{ width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid var(--c-hairline)', cursor: 'pointer', background: 'transparent', display: 'block', padding: '9px 12px' }}>
                      <div style={{ fontSize: '.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ flexShrink: 0, fontSize: '.46rem', fontWeight: 800, color: t.channel === 'line' ? 'var(--c-success)' : 'var(--c-info)', background: t.channel === 'line' ? 'rgba(30,158,106,0.1)' : 'rgba(55,138,221,0.12)', borderRadius: 4, padding: '1px 5px' }}>{t.channel === 'line' ? 'LINE' : 'メール'}</span>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                        {(t.attachments ?? []).some(a => a.type === 'image') && <span style={{ flexShrink: 0, fontSize: '.5rem', color: 'var(--t-tertiary)' }}>🖼</span>}
                      </div>
                      {t.body && <div style={{ fontSize: '.6rem', color: 'var(--muted2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.body}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* 添付プレビュー */}
            {pending.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {pending.map((p, i) => (
                  <div key={p.path} style={{ position: 'relative' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.previewUrl && <img src={p.previewUrl} alt={p.filename} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--line)' }} />}
                    <button type="button" onClick={() => setPending(prev => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, border: 'none', background: 'var(--c-danger)', color: '#fff', fontSize: 11, lineHeight: 1, cursor: 'pointer' }}>×</button>
                  </div>
                ))}
              </div>
            )}
            {/* テンプレ由来のボタン（タップでURL）。クリアで外す。 */}
            {pendingButtons.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {pendingButtons.map((b, i) => (
                  <span key={i} style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--c-blue)', background: 'var(--c-ghost-bg)', border: '1px solid var(--c-ring-soft)', borderRadius: 6, padding: '3px 8px' }}>🔘 {b.label}</span>
                ))}
                <button type="button" onClick={() => setPendingButtons([])} style={{ fontSize: '.56rem', color: 'var(--t-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>ボタンを外す</button>
              </div>
            )}
            {channel === 'email' && (
              <input className="ui-field" value={subject} onChange={e => setSubject(e.target.value)} placeholder="件名（任意）" style={{ marginBottom: 8 }} />
            )}
            <textarea className="ui-field" value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder={channel === 'line' ? 'LINE メッセージを入力…' : 'メール本文を入力…'} style={{ resize: 'vertical' }} />
            {err && <p style={{ fontSize: '.66rem', color: 'var(--red)', margin: '6px 0 0' }}>{err}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="primary" size="md" busy={busy} disabled={!body.trim() && pending.length === 0 && pendingButtons.length === 0} onClick={send}>{channel === 'line' ? 'LINE 送信' : 'メール送信'}</Button>
            </div>
          </div>
          )}
        </>)}
      </div>
    </div>
  )
}
