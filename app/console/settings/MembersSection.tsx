'use client'
// MBメンバー（内部・ディレクター）管理 — 設定>管理者管理 に統合。案件のMB担当(director)はここの母集合から選ばれる。
import { useEffect, useState } from 'react'

type Member = { id: string; name: string | null; email: string | null; role: string; color: string | null }
const ROLE_JP: Record<string, string> = { owner: 'オーナー', manager: 'マネージャー', admin: '管理者', viewer: '閲覧者' }

export default function MembersSection() {
  const [list, setList] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const show = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600) }

  useEffect(() => { fetch('/api/console/members').then(r => r.json()).then(d => setList(d.members ?? [])).catch(() => {}).finally(() => setLoading(false)) }, [])

  async function invite() {
    if (!email.trim()) { show('メールアドレスは必須です'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/console/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.invite_url) {
        try { await navigator.clipboard.writeText(d.invite_url) } catch { /* noop */ }
        window.prompt('招待URLを発行しました（クリップボードにコピー済み）。本人へ共有してください：', d.invite_url)
        setEmail(''); setName(''); show('招待URLを発行しました')
      } else if (d.needsMigration) show('メンバー招待のDB適用が必要です（batch2 DDL）')
      else show(d.error ?? '招待に失敗しました')
    } catch { show('招待に失敗しました') } finally { setBusy(false) }
  }
  const inp: React.CSSProperties = { border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.78rem', background: '#fff' }

  return (
    <div>
      <p style={{ fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 14 }}>
        案件の<b>MB担当（ディレクター）</b>はここのメンバーから選びます。
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, alignItems: 'center', marginBottom: 16 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="お名前（任意）" style={{ ...inp, width: 150 }} />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="招待メールアドレス" style={{ ...inp, flex: 1, minWidth: 180 }} />
        <button onClick={invite} disabled={busy} className="btn btn-p" style={{ fontSize: '.74rem', padding: '8px 16px' }}>メンバーを招待</button>
      </div>
      {loading ? <p style={{ fontSize: '.74rem', color: 'var(--muted2)' }}>読み込み中…</p> : list.length === 0 ? (
        <p style={{ fontSize: '.72rem', color: 'var(--muted2)' }}>メンバーがいません</p>
      ) : (
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
          {list.map((m, i) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderBottom: i < list.length - 1 ? '1px solid #F2F2F6' : 'none' }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: m.color ?? '#0E0E14', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 700, flexShrink: 0 }}>{(m.name ?? m.email ?? '?')[0]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name ?? '—'}</div>
                <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</div>
              </div>
              <span style={{ fontSize: '.56rem', fontWeight: 700, borderRadius: 20, padding: '2px 9px', color: m.role === 'owner' ? 'var(--blue)' : 'var(--muted2)', background: m.role === 'owner' ? 'var(--blue-bg2)' : 'var(--bg2)' }}>{ROLE_JP[m.role] ?? m.role}</span>
            </div>
          ))}
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--txt)', color: '#fff', padding: '12px 22px', borderRadius: 9, fontSize: '.74rem', fontWeight: 600, zIndex: 99 }}>{toast}</div>}
    </div>
  )
}
