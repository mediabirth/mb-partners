'use client'
/**
 * BR-C3：デリバリーを統一リストの行として表示し、固有操作（招待/有効化/削除）を行を開いた詳細から行う。
 * 別UI（DeliveriesPanel）の置き換え。操作は従来の API（/api/console/deliveries/*）をそのまま呼ぶ＝挙動・データ不変。
 */
import { useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import StatusPill from '@/components/ui/StatusPill'
import { partnerKind } from '@/lib/status'

const COLS = '2.2fr .9fr .7fr .65fr .6fr 1fr .8fr'

export default function DeliveryRow({ id, name, email, kind, active: initialActive, authed, first }: {
  id: string; name: string; email: string; kind: string; active: boolean; authed: boolean; first: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [active, setActive] = useState(initialActive)
  const [removed, setRemoved] = useState(false)

  async function toggle() {
    setBusy(true); setMsg('')
    try {
      const res = await fetch(`/api/console/deliveries/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !active }) })
      if (res.ok) setActive(a => !a); else setMsg('更新に失敗しました')
    } catch { setMsg('更新に失敗しました') } finally { setBusy(false) }
  }
  async function invite() {
    setBusy(true); setMsg('')
    try {
      const res = await fetch(`/api/console/deliveries/${id}/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) { try { await navigator.clipboard.writeText(data.url) } catch { /* noop */ } setMsg('招待リンクをコピーしました') }
      else setMsg(data.error ?? '招待に失敗しました')
    } catch { setMsg('招待に失敗しました') } finally { setBusy(false) }
  }
  async function del() {
    if (!confirm(`「${name}」を削除しますか？`)) return
    setBusy(true); setMsg('')
    try {
      const res = await fetch(`/api/console/deliveries/${id}`, { method: 'DELETE' })
      if (res.ok) setRemoved(true); else setMsg('削除に失敗しました')
    } catch { setMsg('削除に失敗しました') } finally { setBusy(false) }
  }

  if (removed) return null
  const btn: React.CSSProperties = { border: '1px solid var(--line)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.66rem', fontWeight: 700, padding: '6px 12px', borderRadius: 8, color: 'var(--txt)' }
  return (
    <>
      <div onClick={() => setOpen(o => !o)} className="row-hover lift" style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 20px', borderTop: first ? undefined : '1px solid #F2F2F6', alignItems: 'center', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar name={name} color={null} size={34} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
            <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email || '—'}{authed && <span style={{ marginLeft: 6, color: 'var(--green)', fontWeight: 600 }}>✓ 連携済</span>}</div>
          </div>
        </div>
        <span><StatusPill size="sm" {...partnerKind('delivery')} /></span>
        <span style={{ fontFamily: 'Inter', fontSize: '.7rem', color: 'var(--muted)' }}>—</span>
        <span style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>{kind || '—'}</span>
        <span style={{ color: 'var(--muted)' }}>—</span>
        <span style={{ color: 'var(--muted)' }}>—</span>
        <StatusPill tone={active ? 'success' : 'neutral'}>{active ? '有効' : '無効'}</StatusPill>
      </div>
      {open && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid #F2F2F6', background: 'var(--bg2)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {!authed && <button onClick={invite} disabled={busy} style={{ ...btn, color: 'var(--blue)', borderColor: 'var(--blue)' }}>招待リンクをコピー</button>}
          <button onClick={toggle} disabled={busy} style={btn}>{active ? '無効にする' : '有効にする'}</button>
          <button onClick={del} disabled={busy} style={{ ...btn, color: 'var(--red)', borderColor: 'var(--red)' }}>削除</button>
          {msg && <span style={{ fontSize: '.64rem', color: 'var(--muted2)' }}>{msg}</span>}
        </div>
      )}
    </>
  )
}
