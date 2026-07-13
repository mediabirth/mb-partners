'use client'
/** 委託先（v6・MBコンソール「パートナー」の区分と同文法）: 招待（名称＋任意メール→リンク）＋一覧。 */
import { useEffect, useState } from 'react'

type Dlv = { id: string; name: string; kind: string | null; contact_email: string | null; active: boolean; auth_user_id: string | null }

export default function DeliverySection() {
  const [list, setList] = useState<Dlv[] | null>(null)
  const [name, setName] = useState('')
  const [work, setWork] = useState('')
  const [email, setEmail] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const load = () => fetch('/api/supplier/self').then(r => r.ok ? r.json() : null).then(d => setList(d?.deliveries ?? [])).catch(() => setList([]))
  useEffect(() => { load() }, [])

  async function invite() {
    if (busy || !name.trim()) return
    setBusy(true); setNote(''); setUrl('')
    const r = await fetch('/api/supplier/self', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'invite_delivery', name: name.trim(), work: work.trim(), email: email.trim() }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setNote(j.error ?? '失敗しました'); setBusy(false); return }
    setUrl(j.invite_url)
    setNote(email.trim() ? (j.emailed ? '招待メールを送信しました（リンクの共有も可能です）' : 'リンクを作成しました（メールは送信できませんでした）') : 'リンクを作成しました。委託先の方に共有してください')
    setName(''); setWork(''); setEmail('')
    await load(); setBusy(false)
  }

  const CARD: React.CSSProperties = { background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13 }
  const FLD: React.CSSProperties = { minHeight: 40, padding: '0 10px', borderRadius: 8, border: '0.5px solid var(--line)', fontSize: '.74rem', fontFamily: 'inherit', boxSizing: 'border-box' }
  return (
    <div>
      <div style={{ ...CARD, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: '.78rem', fontWeight: 700, marginBottom: 10 }}>委託先を招待</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="名称 / 屋号（必須）" style={{ ...FLD, flex: 1, minWidth: 150 }} />
          <input value={work} onChange={e => setWork(e.target.value)} placeholder="業務（例: 保険の実務）" style={{ ...FLD, flex: 1, minWidth: 130 }} />
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="メール（任意）" style={{ ...FLD, flex: 1, minWidth: 150 }} />
          <button disabled={busy || !name.trim()} onClick={invite}
            style={{ fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 700, minHeight: 40, padding: '0 18px', borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: 'var(--c-blue)', flexShrink: 0 }}>{busy ? '作成中…' : '招待リンクを作成'}</button>
        </div>
        {url && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <input readOnly value={url} style={{ ...FLD, flex: 1, minWidth: 0, fontFamily: 'Inter', fontSize: '.64rem', color: 'var(--muted2)' }} />
            <button onClick={() => navigator.clipboard?.writeText(url)} style={{ fontFamily: 'inherit', fontSize: '.66rem', minHeight: 36, padding: '0 12px', borderRadius: 8, border: '0.5px solid var(--line)', background: '#fff', cursor: 'pointer', flexShrink: 0 }}>コピー</button>
          </div>
        )}
        {note && <p style={{ fontSize: '.64rem', color: 'var(--muted2)', margin: '8px 0 0' }}>{note}</p>}
      </div>
      <div style={{ ...CARD, overflow: 'hidden' }}>
        {list === null ? <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '14px 15px', margin: 0 }}>読み込み中…</p>
        : list.length === 0 ? <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '14px 15px', margin: 0 }}>まだ委託先がいません。招待すると、案件への委託（アサイン）ができるようになります。</p>
        : list.map((v, i) => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 15px', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: '.76rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}<span style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 400, marginLeft: 8 }}>{v.kind ?? ''}</span></span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: v.auth_user_id ? 'var(--st-success, #0f9d76)' : 'var(--amber)' }} />
              <span style={{ fontSize: '.64rem', color: 'var(--muted2)' }}>{v.auth_user_id ? '稼働中' : '招待済み・未登録'}</span>
            </span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '8px 2px 0' }}>案件への委託（アサイン）は「案件」の詳細から。委託費のお支払いはMB Partnersの月次サイクルで行われます。</p>
    </div>
  )
}
