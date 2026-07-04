'use client'
/**
 * 委託提示への応答カード（提示中の割当のみ表示）。
 * 承諾/辞退 → PATCH /api/vendor/assignments/[id] → リロードで反映。
 * 辞退は確認ダイアログ（不可逆＝再提示はMB側から）。
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function VendorOfferActions({ assignmentId, baseFee }: { assignmentId: string; baseFee: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmDecline, setConfirmDecline] = useState(false)
  const [err, setErr] = useState('')

  async function respond(action: 'accept' | 'decline') {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/vendor/assignments/${assignmentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || '送信に失敗しました'); setBusy(false); return }
      router.refresh()
    } catch { setErr('通信に失敗しました'); setBusy(false) }
  }

  return (
    <div style={{ margin: '12px 20px 4px', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px 18px', background: '#fff' }}>
      <p style={{ fontSize: '.78rem', fontWeight: 500 }}>この案件の委託のご提案です</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 500 }}>委託費</span>
        <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.05rem', fontWeight: 500 }}>¥{baseFee.toLocaleString()}</span>
      </div>
      {err && <p style={{ fontSize: '.66rem', color: 'var(--red)', marginTop: 8 }}>{err}</p>}
      {!confirmDecline ? (
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={() => respond('accept')} disabled={busy}
            style={{ flex: 1, height: 40, border: 'none', borderRadius: 10, background: 'var(--txt)', color: '#fff', fontFamily: 'inherit', fontSize: '.78rem', fontWeight: 500, cursor: 'pointer', opacity: busy ? .6 : 1 }}>
            受ける
          </button>
          <button onClick={() => setConfirmDecline(true)} disabled={busy}
            style={{ height: 40, padding: '0 18px', border: '0.5px solid var(--line)', borderRadius: 10, background: '#fff', color: 'var(--muted2)', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 500, cursor: 'pointer' }}>
            辞退する
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: '.68rem', color: 'var(--muted2)', lineHeight: 1.6 }}>辞退するとこの提示は終了します。条件の再提示はMBからのみ行えます。</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button onClick={() => setConfirmDecline(false)} disabled={busy}
              style={{ height: 36, padding: '0 16px', border: '0.5px solid var(--line)', borderRadius: 10, background: '#fff', color: 'var(--muted2)', fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 500, cursor: 'pointer' }}>
              戻る
            </button>
            <button onClick={() => respond('decline')} disabled={busy}
              style={{ height: 36, padding: '0 18px', border: 'none', borderRadius: 10, background: 'var(--red)', color: '#fff', fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 500, cursor: 'pointer', opacity: busy ? .6 : 1 }}>
              辞退する
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
