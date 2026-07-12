'use client'
import { useEffect, useState } from 'react'

type Kind = 'partner' | 'frontier' | 'supplier' | 'delivery'
const KINDS: { id: Kind; label: string; note: string }[] = [
  { id: 'partner', label: 'パートナー', note: '' },
  { id: 'frontier', label: 'フロンティア', note: '' },
  { id: 'supplier', label: 'サプライヤー（会社）', note: '' },
  { id: 'delivery', label: 'デリバリー', note: '' },
]
type Card = { id: string; name: string; deprecated?: boolean }

export default function InviteForm() {
  const [kind, setKind] = useState<Kind>(() => {
    if (typeof window !== 'undefined') { const k = new URLSearchParams(window.location.search).get('kind'); if (k === 'frontier' || k === 'delivery' || k === 'partner' || k === 'supplier') return k }
    return 'partner'
  })
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [emailed, setEmailed] = useState(false)
  const [copied, setCopied] = useState(false)
  // B: サプライヤー招待＝レートカード同時選択（既定 standard-v2・契約済み前提）
  const [cards, setCards] = useState<Card[]>([])
  const [selCard, setSelCard] = useState('standard-v2')
  useEffect(() => {
    if (kind !== 'supplier' || cards.length) return
    fetch('/api/console/rate-cards').then(r => r.json()).then(d => setCards((d.cards ?? []).filter((c: Card) => !c.deprecated))).catch(() => {})
  }, [kind, cards.length])

  // A1: フロンティア判定はサーバ（invites.is_frontier）が真実。URLはサーバが返すものをそのまま共有する。
  const shareUrl = inviteUrl

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(''); setInviteUrl('')
    try {
      if (kind === 'delivery') {
        if (!name.trim()) { setError('デリバリーは名称（屋号）が必須です'); setLoading(false); return }
        const dr = await fetch('/api/console/deliveries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), contact_email: email.trim() }) })
        const dd = await dr.json().catch(() => ({}))
        if (!dr.ok || !dd.delivery) { setError(dd.error || 'デリバリーの作成に失敗しました'); setLoading(false); return }
        const ir = await fetch(`/api/console/deliveries/${dd.delivery.id}/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) })
        const id = await ir.json().catch(() => ({}))
        if (!ir.ok || !id.invite_url) { setError(id.error || '招待リンクの発行に失敗しました'); setLoading(false); return }
        setInviteUrl(id.invite_url); setEmailed(!!id.emailed); setName('')
      } else {
        if (kind === 'supplier' && !name.trim()) { setError('サプライヤーは会社名が必須です'); setLoading(false); return }
        const res = await fetch('/api/console/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined, role: 'partner', frontier: kind === 'frontier', supplier_card: kind === 'supplier' ? selCard : undefined }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setError(data.error || '招待リンクを発行できませんでした。時間をおいて再度お試しください'); setLoading(false); return }
        setInviteUrl(data.invite_url); setEmailed(!!data.emailed); setName('')
      }
      setEmail('')
    } catch { setError('招待リンクを発行できませんでした。時間をおいて再度お試しください') } finally { setLoading(false) }
  }
  async function handleCopy() { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const cur = KINDS.find(k => k.id === kind)!

  return (
    <div style={{ padding: '24px 28px', maxWidth: 560 }}>
      <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '24px 24px' }}>
        <h2 style={{ fontSize: '.88rem', fontWeight: 500, marginBottom: 18 }}>招待する</h2>

        <form onSubmit={handleSubmit}>
          {/* ロール選択（統一導線） */}
          <div className="fld" style={{ marginBottom: 14 }}>
            <label>ロール</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {KINDS.map(k => (
                <button type="button" key={k.id} onClick={() => { setKind(k.id); setInviteUrl('') }}
                  style={{ flex: 1, padding: '9px 0', borderRadius: 9, fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 500, cursor: 'pointer',
                    border: `1.5px solid ${kind === k.id ? 'var(--blue)' : 'var(--line)'}`,
                    background: kind === k.id ? 'var(--blue)' : '#fff', color: kind === k.id ? '#fff' : 'var(--txt)' }}>
                  {k.label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 6 }}>{cur.note}</p>
          </div>

          <div className="fld" style={{ marginBottom: 14 }}>
            <label htmlFor="inv-email">{kind === 'supplier' ? 'ご担当者メールアドレス' : 'メールアドレス'} <span style={{ color: 'var(--red)' }}>*</span></label>
            <input id="inv-email" type="email" placeholder={kind === 'supplier' ? 'contact@company.co.jp' : 'partner@example.com'} value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          <div className="fld" style={{ marginBottom: 14 }}>
            <label htmlFor="inv-name">{kind === 'delivery' ? '名称 / 屋号' : kind === 'supplier' ? '会社名' : 'お名前（任意・フォームに事前入力）'} {(kind === 'delivery' || kind === 'supplier') && <span style={{ color: 'var(--red)' }}>*</span>}</label>
            <input id="inv-name" type="text" placeholder={kind === 'delivery' ? '例：田中フォト' : kind === 'supplier' ? '例：株式会社オムニス' : '山田 太郎'} value={name} onChange={e => setName(e.target.value)} />
          </div>

          {kind === 'supplier' && (
            <div className="fld" style={{ marginBottom: 14 }}>
              <label htmlFor="inv-card">適用レートカード</label>
              <select id="inv-card" value={selCard} onChange={e => setSelCard(e.target.value)}
                style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '0.5px solid var(--line)', fontSize: '.8rem', fontFamily: 'inherit', background: '#fff' }}>
                {cards.length === 0 && <option value="standard-v2">標準v2（パススルー＋受注額5%）</option>}
                {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 6, lineHeight: 1.7 }}>
                契約済みの会社を迎える導線です。ご担当者の登録完了と同時に<b>サプライヤーとして自動で有効</b>になります（サプライヤー一覧に出現・履歴/監査記録あり）。後から昇格する場合はフロンティア招待→サプライヤー画面の昇格をご利用ください。
              </p>
            </div>
          )}

          {error && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginBottom: 12 }}>{error}</p>}

          <button type="submit" className="ui-btn ui-btn--primary" style={{ justifyContent: 'center' }} disabled={loading || !email.trim() || ((kind === 'delivery' || kind === 'supplier') && !name.trim())}>
            {loading ? '作成中…' : '招待リンクを作成'}
          </button>
        </form>

        {inviteUrl && (
          <div style={{ marginTop: 24, padding: 16, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 10 }}>
            <p style={{ fontSize: '.72rem', fontWeight: 500, color: 'var(--blue)', marginBottom: 8 }}>{cur.label}の招待リンクが作成されました（有効期限: 7日間）</p>
            <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 7, padding: '10px 12px', fontSize: '.68rem', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 10, color: 'var(--txt)' }}>{shareUrl}</div>
            <button className="ui-btn ui-btn--secondary" style={{ fontSize: '.72rem', padding: '8px 16px' }} onClick={handleCopy}>{copied ? 'コピーしました ✓' : 'リンクをコピー'}</button>
            <p style={{ fontSize: '.65rem', color: 'var(--muted2)', marginTop: 10, lineHeight: 1.6 }}>
              {emailed ? '招待メールを送信しました。このリンクを直接共有することもできます。' : '招待メールを送信できませんでした。このリンクを直接共有してください。'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
