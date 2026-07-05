'use client'
/**
 * 納品宣言（純化バッチ）— 了承済の委託を「納品済みにする」。
 * これが経費申請と粗利確定のゲート（正典業務フロー: 納品→経費申請→承認→粗利）。
 * ベンダー本人が宣言する（納品したことを知っているのは受託者＝最も自然）。
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function VendorDeliverAction({ assignmentId }: { assignmentId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [err, setErr] = useState('')

  async function deliver() {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/vendor/assignments/${assignmentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deliver' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || '送信に失敗しました'); setBusy(false); return }
      router.refresh()
    } catch { setErr('通信に失敗しました'); setBusy(false) }
  }

  return (
    <div style={{ margin: '4px 20px 0', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px 18px', background: '#fff' }}>
      <p style={{ fontSize: '.78rem', fontWeight: 500 }}>納品はお済みですか</p>
      <p style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 4, lineHeight: 1.6 }}>納品済みにすると経費を申請できます。</p>
      {err && <p style={{ fontSize: '.66rem', color: 'var(--red)', marginTop: 8 }}>{err}</p>}
      {!confirm ? (
        <button onClick={() => setConfirm(true)} disabled={busy}
          style={{ marginTop: 12, width: '100%', height: 40, border: 'none', borderRadius: 10, background: 'var(--txt)', color: '#fff', fontFamily: 'inherit', fontSize: '.78rem', fontWeight: 500, cursor: 'pointer', opacity: busy ? .6 : 1 }}>
          納品済みにする
        </button>
      ) : (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: '.66rem', color: 'var(--muted2)', lineHeight: 1.6 }}>納品済みにすると取り消せません。経費の申請に進みます。</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button onClick={() => setConfirm(false)} disabled={busy} style={{ height: 36, padding: '0 16px', border: '0.5px solid var(--line)', borderRadius: 10, background: '#fff', color: 'var(--muted2)', fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 500, cursor: 'pointer' }}>戻る</button>
            <button onClick={deliver} disabled={busy} style={{ flex: 1, height: 36, border: 'none', borderRadius: 10, background: 'var(--txt)', color: '#fff', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 500, cursor: 'pointer', opacity: busy ? .6 : 1 }}>納品済みにする</button>
          </div>
        </div>
      )}
    </div>
  )
}
